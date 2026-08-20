<?php

namespace App\Services\WooCommerce;

use App\Models\Product;
use App\Models\SalesPlatformShop;
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
        $name = $this->attributeValue($product, 'pname', $shop->channel_id, localeCode: 'th');
        $price = $this->attributeValue($product, 'price_std', $shop->channel_id)
            ?? $this->attributeValue($product, 'price_recommend', $shop->channel_id);
        $imageUrl = $this->attributeValue($product, 'pimage', $shop->channel_id);
        $qty = $this->attributeValue($product, 'qty', $shop->channel_id);
        $description = $this->attributeValue($product, 'product_details_features', $shop->channel_id);
        $weight = $this->attributeValue($product, 'weight_pcs', $shop->channel_id);
        $length = $this->attributeValue($product, 'length_pcs', $shop->channel_id);
        $width = $this->attributeValue($product, 'width_pcs', $shop->channel_id);
        $height = $this->attributeValue($product, 'height_pcs', $shop->channel_id);

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
            'description' => $description ?: '',
            'manage_stock' => true,
            'stock_quantity' => (int) ($qty ?? 0),
            'weight' => $weight !== null && $weight !== '' ? (string) $weight : null,
            'dimensions' => count($dimensions) ? array_map('strval', $dimensions) : null,
            'images' => $imageUrl ? [['src' => $imageUrl]] : null,
            'categories' => count($categoryIds) ? $categoryIds : null,
        ], fn ($v) => $v !== null && $v !== []);
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
