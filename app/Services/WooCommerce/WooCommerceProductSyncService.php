<?php

namespace App\Services\WooCommerce;

use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Models\WooCommerceAttributeMapping;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Orchestrates pushing one product to the WooCommerce store — mirrors
 * LazadaProductSyncService/ShopeeProductSyncService's shape (same
 * buildPayload()/push()/deactivate()/checkLiveStatus() signatures, called
 * polymorphically by SyncProductToMarketplaceJob), but simpler than both on
 * three points specific to WooCommerce's own API:
 *
 * 1. No CDN image upload step — WooCommerce's `images[].src` accepts a plain
 *    URL and fetches it itself (confirmed reachable: the WooCommerce site's
 *    server can reach this app's storage URLs directly over the internal
 *    network). Unlike Lazada/Shopee, which both reject external image URLs.
 * 2. No live mandatory-field schema check — WooCommerce has no per-category
 *    required-attribute concept the way Lazada/Shopee do; a product can be
 *    created with just a name and price, category included or not.
 * 3. Create-vs-update is decided by asking WooCommerce directly by SKU
 *    (findProductBySku(), same as Lazada) rather than trusting a locally
 *    cached platform_item_id (Shopee's approach, forced by Shopee having no
 *    find-by-SKU endpoint) — WooCommerce's `sku` filter is an exact match,
 *    so there's no reason to prefer a cache that could go stale.
 *
 * No per-shop WooCommerceSellerAccount model exists — see forShop() below.
 */
class WooCommerceProductSyncService
{
    use ResolvesProductAttributeValues;

    public function __construct(private readonly WooCommerceClient $client)
    {
    }

    /**
     * Unlike LazadaProductSyncService::forShop()/ShopeeProductSyncService::forShop(),
     * this doesn't look up a per-shop account — WooCommerceClient reads
     * config('services.woocommerce') directly (one WooCommerce site today,
     * see that class's docblock). $shop is still required and still used
     * (for channel_id scoping in buildPayload()), keeping the same static-
     * factory shape SyncProductToMarketplaceJob's match expression expects.
     */
    public static function forShop(SalesPlatformShop $shop): self
    {
        return new self(new WooCommerceClient());
    }

    /**
     * Gathers our own data into WooCommerce's product payload shape.
     * Read-only — safe to call any time for inspection. Category is included
     * when mapped but not required (see class docblock point 2) — every
     * category this product is assigned to with a woocommerce_category_id
     * mapping is sent, not just one (WooCommerce supports multiple
     * categories per product natively, unlike Lazada's single
     * primary_category_id).
     */
    public function buildPayload(Product $product, SalesPlatformShop $shop): array
    {
        $mappings = WooCommerceAttributeMapping::with('attribute')->orderBy('sort_order')->get();

        $name = $this->resolveMappedField($mappings, 'name', $product, $shop->channel_id);
        $price = $this->resolveMappedField($mappings, 'price', $product, $shop->channel_id);
        $imageUrl = $this->resolveMappedField($mappings, 'image', $product, $shop->channel_id);
        $qty = $this->resolveMappedField($mappings, 'qty', $product, $shop->channel_id);
        $weight = $this->resolveMappedField($mappings, 'weight', $product, $shop->channel_id);
        $length = $this->resolveMappedField($mappings, 'length', $product, $shop->channel_id);
        $width = $this->resolveMappedField($mappings, 'width', $product, $shop->channel_id);
        $height = $this->resolveMappedField($mappings, 'height', $product, $shop->channel_id);
        $content = $this->buildContentFields($mappings, $product, $shop->channel_id);
        $wcAttributes = $this->buildWooCommerceAttributes($mappings, $product, $shop->channel_id);

        if (!$name || !$price) {
            throw new RuntimeException("Product '{$product->sku}' is missing a name or price — cannot push to WooCommerce.");
        }

        $categoryIds = $product->categories()
            ->whereNotNull('woocommerce_category_id')
            ->pluck('woocommerce_category_id')
            ->map(fn ($id) => ['id' => (int) $id])
            ->all();

        $dimensions = array_filter([
            'length' => $length,
            'width' => $width,
            'height' => $height,
        ], fn ($v) => $v !== null && $v !== '');

        return array_filter([
            'sku' => $product->sku,
            'name' => $name,
            'regular_price' => (string) $price,
            'description' => $content['description'],
            'short_description' => $content['short_description'],
            'manage_stock' => true,
            'stock_quantity' => (int) ($qty ?? 0),
            'weight' => $weight !== null && $weight !== '' ? (string) $weight : null,
            'dimensions' => count($dimensions) ? array_map('strval', $dimensions) : null,
            'images' => $imageUrl ? [['src' => $imageUrl]] : null,
            'categories' => count($categoryIds) ? $categoryIds : null,
            'attributes' => count($wcAttributes) ? $wcAttributes : null,
        ], fn ($v) => $v !== null && $v !== []);
    }

    /**
     * Single-value WooCommerce fields (name/price/image/qty/weight/length/
     * width/height) — "first match wins": walks every attribute an admin
     * has mapped to this target, in sort_order, and returns the first one
     * with an actual value for this product. Mapping both price_std (order
     * 0) and price_recommend (order 1) to 'price' reproduces the old
     * `price_std ?? price_recommend` fallback this replaced, for any target,
     * not just price. Always passes `localeCode: 'th'` — see
     * buildContentFields()'s docblock for why that's safe unconditionally.
     */
    private function resolveMappedField(\Illuminate\Support\Collection $mappings, string $targetField, Product $product, ?int $channelId): ?string
    {
        foreach ($mappings->where('target_field', $targetField) as $mapping) {
            if (!$mapping->attribute) {
                continue;
            }

            $value = $this->attributeValue($product, $mapping->attribute->code, $channelId, localeCode: 'th');
            if ($value) {
                return $value;
            }
        }

        return null;
    }

    /**
     * Composes WooCommerce's `description`/`short_description` from
     * whichever PIM attributes an admin has mapped to each — see the
     * "PIM Attribute → WooCommerce Content" mapping page
     * (WooCommerceAttributeMappingController), not a hardcoded attribute
     * list. Unlike resolveMappedField() above, these two targets compose
     * EVERY mapped attribute (not just the first with a value): each
     * becomes one `<h4>label</h4>` section, in sort_order, skipping
     * attributes with no value for this product. Always passes
     * `localeCode: 'th'` — every attribute eligible for mapping here is
     * content meant for the storefront, and omitting the locale (like the
     * original single-field version of this method used to) silently
     * returns nothing for locale-based attributes.
     */
    private function buildContentFields(\Illuminate\Support\Collection $mappings, Product $product, ?int $channelId): array
    {
        $sections = ['description' => [], 'short_description' => []];

        foreach ($mappings->whereIn('target_field', ['description', 'short_description']) as $mapping) {
            $attribute = $mapping->attribute;
            if (!$attribute) {
                continue;
            }

            $value = $this->attributeValue($product, $attribute->code, $channelId, localeCode: 'th');
            if (!$value) {
                continue;
            }

            // `textarea` attributes are edited through a rich-text (WYSIWYG)
            // editor in the PIM UI and can already contain real HTML (<p>,
            // <ul>, <strong>, ...) — escaping that here would show literal
            // "&lt;p&gt;" text on the storefront instead of rendering it.
            // Every other attribute type (text/select/price/date/...) is a
            // plain scalar, so it's escaped normally. WordPress's own
            // wpautop() paragraph-wraps plain text on render, so unwrapped
            // plain values still display correctly without help from here.
            $content = $attribute->type === 'textarea' ? $value : e($value);

            // CSS hooks for the theme's Additional CSS (or a child theme
            // stylesheet) to style — `.pim-content-section` per section,
            // `data-attribute` for targeting one specific field (e.g.
            // `[data-attribute="warnings"] { color: #b91c1c; }`).
            $sections[$mapping->target_field][] =
                '<div class="pim-content-section" data-attribute="'.e($attribute->code).'">'
                .'<h4 class="pim-content-heading">'.e($attribute->name).'</h4>'
                .'<div class="pim-content-body">'.$content.'</div>'
                .'</div>';
        }

        return [
            'description' => $sections['description'] ? '<div class="pim-content">'.implode('', $sections['description']).'</div>' : '',
            'short_description' => $sections['short_description'] ? '<div class="pim-content">'.implode('', $sections['short_description']).'</div>' : '',
        ];
    }

    /**
     * Builds WooCommerce's `attributes[]` payload entries from `wc_attribute`
     * mappings — one entry per distinct woocommerce_attribute_id, "first
     * mapped attribute with a value wins" within that group (same semantics
     * as resolveMappedField()). Only `id` + `options` are sent: these are
     * all global attributes (real WooCommerce term-based taxonomies, synced
     * via syncWoocommerceAttributes()), so `name` isn't needed and
     * WooCommerce matches/creates the term from the option value itself.
     */
    private function buildWooCommerceAttributes(\Illuminate\Support\Collection $mappings, Product $product, ?int $channelId): array
    {
        $result = [];

        $groups = $mappings->where('target_field', 'wc_attribute')->groupBy('woocommerce_attribute_id');

        foreach ($groups as $wcAttributeId => $group) {
            foreach ($group->sortBy('sort_order') as $mapping) {
                if (!$mapping->attribute) {
                    continue;
                }

                $value = $this->attributeValue($product, $mapping->attribute->code, $channelId, localeCode: 'th');
                if ($value) {
                    $result[] = ['id' => (int) $wcAttributeId, 'options' => [$value], 'visible' => true, 'variation' => false];
                    break;
                }
            }
        }

        return $result;
    }

    /**
     * FIRES A REAL, LIVE WRITE TO WOOCOMMERCE — creates or updates an actual
     * listing on the store, visible to real customers. Only call this with
     * the user's explicit, specific go-ahead.
     */
    public function push(Product $product, SalesPlatformShop $shop): array
    {
        $payload = $this->buildPayload($product, $shop);
        $payload = $this->uploadImagesToWooCommerce($payload);
        $payload['status'] = 'publish';

        $existing = $this->client->findProductBySku($product->sku);

        $result = $existing
            ? $this->client->updateProduct((int) $existing['id'], $payload)
            : $this->client->createProduct($payload);

        $this->cacheStatus($product, $shop, $result);

        return $result;
    }

    /**
     * See WooCommerceClient::uploadMedia()'s docblock — a real write
     * (uploads to WordPress's Media Library) kept out of buildPayload() for
     * the same reason LazadaProductSyncService::uploadImagesToLazada()/
     * ShopeeProductSyncService::uploadImagesToShopee() are separate. Swaps
     * each `src` URL for the uploaded attachment's `id` — passing `id`
     * directly (rather than the resulting source_url, which is a normal
     * public WordPress URL and would sideload fine too) skips WooCommerce
     * re-fetching an image it just received from us a moment ago.
     */
    private function uploadImagesToWooCommerce(array $payload): array
    {
        if (!empty($payload['images'])) {
            $payload['images'] = array_map(function (array $image) {
                $media = $this->client->uploadMedia($image['src']);

                return ['id' => (int) $media['id']];
            }, $payload['images']);
        }

        return $payload;
    }

    /**
     * FIRES A REAL, LIVE WRITE TO WOOCOMMERCE — sets an actual listing to
     * draft (hidden from the storefront, not deleted), same "hide, don't
     * delete" semantics as Lazada's deactivateProduct()/Shopee's
     * unlistItem(). Requires the product to already exist on WooCommerce.
     */
    public function deactivate(Product $product, SalesPlatformShop $shop): array
    {
        $existing = $this->client->findProductBySku($product->sku);
        if (!$existing) {
            throw new RuntimeException("Product '{$product->sku}' has never been pushed to '{$shop->name}' — nothing to deactivate.");
        }

        $result = $this->client->updateProduct((int) $existing['id'], ['status' => 'draft']);

        $this->cacheStatus($product, $shop, $result);

        return $result;
    }

    /**
     * Real-time single-item status check — asks WooCommerce directly by SKU
     * (same reasoning as Lazada's checkLiveStatus(): don't trust a cache that
     * could be stale from a push made outside this app). Read-only against
     * WooCommerce; the only write is refreshing our own product_platform_shops
     * cache.
     *
     * @return array{is_live: bool, never_pushed: bool, status: string|null}
     */
    public function checkLiveStatus(Product $product, SalesPlatformShop $shop): array
    {
        $existing = $this->client->findProductBySku($product->sku);

        if (!$existing) {
            DB::table('product_platform_shops')
                ->where('product_id', $product->id)
                ->where('sales_platform_shop_id', $shop->id)
                ->update(['status' => null, 'last_synced_at' => now()]);

            return ['is_live' => false, 'never_pushed' => true, 'status' => null];
        }

        $isLive = ($existing['status'] ?? null) === 'publish';

        DB::table('product_platform_shops')->updateOrInsert(
            ['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id],
            ['status' => $isLive ? 'live' : null, 'platform_item_id' => (string) $existing['id'], 'last_synced_at' => now(), 'updated_at' => now()]
        );

        return ['is_live' => $isLive, 'never_pushed' => false, 'status' => $existing['status'] ?? null];
    }

    /**
     * Shared by push()/deactivate() — refreshes product_platform_shops from
     * whatever WooCommerce's response just confirmed, so the cached "Live"
     * badge stays consistent without waiting for a separate checkLiveStatus()
     * call right after a push.
     */
    private function cacheStatus(Product $product, SalesPlatformShop $shop, array $result): void
    {
        $id = $result['id'] ?? null;
        if (!$id) {
            return;
        }

        $isLive = ($result['status'] ?? null) === 'publish';

        DB::table('product_platform_shops')->updateOrInsert(
            ['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id],
            ['status' => $isLive ? 'live' : null, 'platform_item_id' => (string) $id, 'last_synced_at' => now(), 'updated_at' => now()]
        );
    }
}
