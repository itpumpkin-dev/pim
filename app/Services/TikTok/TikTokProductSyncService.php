<?php

namespace App\Services\TikTok;

use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Models\TikTokAttributeMapping;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Orchestrates pushing one product to one shop — mirrors
 * LazadaProductSyncService/ShopeeProductSyncService's shape. Two gaps
 * neither of those has are now resolved; one remains:
 *
 * 1. RESOLVED, 2026-08-17: warehouse_id comes from a live
 *    TikTokClient::getWarehouseList() call (see resolveWarehouseId()).
 * 2. RESOLVED, 2026-08-21: product-attribute source mapping is now
 *    admin-configurable via TikTokAttributeMapping (see
 *    resolveProductAttributes()), replacing the previously-empty hardcoded
 *    TIKTOK_ATTRIBUTE_SOURCE const — same fix already made for Shopee/
 *    Lazada's equivalent gaps. Only attributes TikTok marks
 *    `is_customizable` are mappable; select-only attributes still aren't
 *    (see TikTokAttributeMappingController).
 * 3. RESOLVED, 2026-08-17: checkLiveStatus() below now asks TikTok
 *    directly via TikTokClient::getProduct(), confirmed live — see that
 *    method's docblock for a real, informative finding from the first
 *    call (a real pushed product came back audit-APPROVED but
 *    status-SELLER_DEACTIVATED, i.e. not actually live — createProduct()
 *    succeeding is not the same as the listing being visible to
 *    customers).
 *
 * A bulk equivalent (searchLiveStatus()/syncLiveStatus(), mirroring
 * Lazada/Shopee's own bulk sync) isn't built here yet — TikTokClient::
 * searchProducts() exists and is confirmed-shape (not confirmed live) if
 * one gets written, but nothing calls it yet.
 *
 * push()/deactivate() and everything they call (createProduct(),
 * uploadImage()) are CONFIRMED LIVE, 2026-08-17 — a real product was
 * pushed end to end through push() itself, not just through TikTokClient
 * directly. See TikTokClient's class docblock for the two real signing/
 * header bugs that took to get there, and for the two Method-field-vs-
 * curl-example contradictions found in TikTok's own docs that this still
 * depends on (updateProduct()'s PUT, uploadFile()'s POST — uploadImage()'s
 * POST is now also confirmed correct).
 */
class TikTokProductSyncService
{
    use ResolvesProductAttributeValues;

    /**
     * Same role as LazadaProductSyncService::SKU_FIELD_SOURCE/
     * ShopeeProductSyncService::DIMENSION_FIELD_SOURCE — our attribute code
     * for each TikTok package_dimensions field, when we have it. Keyed by
     * TikTok's own field name (not prefixed like Shopee's package_length)
     * since package_dimensions here is a single flat object, not per-SKU.
     */
    private const DIMENSION_FIELD_SOURCE = [
        'length' => 'length_pcs',
        'width' => 'width_pcs',
        'height' => 'height_pcs',
    ];

    public function __construct(private readonly TikTokClient $client) {}

    public static function forShop(SalesPlatformShop $shop): self
    {
        $account = $shop->tiktokAccount();
        if (! $account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked TikTok account.");
        }

        return new self(new TikTokClient($account));
    }

    /**
     * Gathers our own data into TikTok's create/update product payload
     * shape. Read-only against TikTok (one getAttributes() call to check
     * mandatory product attributes) — safe to call any time for inspection,
     * same role as Lazada/Shopee's buildPayload(). Throws with a specific,
     * actionable reason for every gap rather than guessing a value — see
     * class docblock for the two gaps (warehouse_id, product attributes)
     * that will realistically block every category until filled in.
     *
     * Single-SKU only, same simplification LazadaProductSyncService/
     * ShopeeProductSyncService's buildPayload() already make — configurable
     * products with real variants (skus[].sales_attributes) aren't built
     * here.
     */
    public function buildPayload(Product $product, SalesPlatformShop $shop): array
    {
        $category = $product->categories()->whereNotNull('tiktok_category_id')->first();
        if (! $category) {
            throw new RuntimeException("Product '{$product->sku}' has no category mapped to a TikTok category yet.");
        }

        $name = $this->attributeValue($product, 'pname', $shop->channel_id, localeCode: 'th');
        $price = $this->attributeValue($product, 'price_std', $shop->channel_id);
        $imageUrl = $this->attributeValue($product, 'pimage', $shop->channel_id);
        $qty = $this->attributeValue($product, 'qty', $shop->channel_id);
        $weight = $this->attributeValue($product, 'weight_pcs', $shop->channel_id);

        // TikTok's description is HTML, max 10,000 chars — product_details_features
        // is this app's own HTML-formatted long-description field (see
        // ProductPresenter::mapOne(), which renders it the same way for the
        // storefront), a much better fit than Shopee's buildPayload() fallback
        // of reusing the plain product name. Still falls back to $name for a
        // product that has neither, rather than blocking the push outright.
        $description = $this->attributeValue($product, 'product_details_features', $shop->channel_id) ?: $name;

        if (! $name || ! $price) {
            throw new RuntimeException("Product '{$product->sku}' is missing a name or price — cannot push to TikTok.");
        }

        if (! $imageUrl) {
            throw new RuntimeException("Product '{$product->sku}' has no image — TikTok requires at least one main image.");
        }

        $warehouseId = $this->resolveWarehouseId();

        $attributes = $this->resolveProductAttributes($product, $shop->channel_id, (string) $category->tiktok_category_id);
        if (! empty($attributes['missing'])) {
            throw new RuntimeException(
                'TikTok category requires product attribute(s) this app has no data for and cannot auto-fill: '
                .implode(', ', $attributes['missing'])
                .' — map these in TikTokProductSyncService::TIKTOK_ATTRIBUTE_SOURCE once a real value source is known.'
            );
        }

        $dimension = array_filter(array_map(
            fn (string $ourAttributeCode) => $this->attributeValue($product, $ourAttributeCode, $shop->channel_id),
            self::DIMENSION_FIELD_SOURCE
        ));

        return array_filter([
            'title' => $name,
            'description' => $description,
            'category_id' => (string) $category->tiktok_category_id,
            // Matches the default already used when syncing the category
            // tree itself (see TikTokClient::getCategoryTree()) — Thailand
            // is a SEA market, which the docs say must use v2.
            'category_version' => 'v2',
            // Swapped for a real TikTok-hosted URI by uploadImagesToTikTok()
            // below — kept out of this method so buildPayload() stays
            // side-effect-free/safe to call anytime for inspection, same
            // reasoning as Lazada/Shopee's own buildPayload().
            'main_images' => [['uri' => $imageUrl]],
            'skus' => [array_filter([
                'seller_sku' => $product->sku,
                'price' => ['currency' => 'THB', 'amount' => (string) $price],
                'inventory' => [[
                    'warehouse_id' => $warehouseId,
                    'quantity' => (int) ($qty ?? 0),
                ]],
            ], fn ($v) => $v !== null)],
            'package_weight' => $weight ? ['value' => (string) $weight, 'unit' => 'KILOGRAM'] : null,
            'package_dimensions' => count($dimension) === 3 ? [
                'length' => (string) $dimension['length'],
                'width' => (string) $dimension['width'],
                'height' => (string) $dimension['height'],
                'unit' => 'CENTIMETER',
            ] : null,
            'product_attributes' => $attributes['product_attributes'] ?: null,
        ], fn ($v) => $v !== null && $v !== []);
    }

    /**
     * See TikTokClient::uploadImage() — a real write (uploads to TikTok's
     * media library) kept out of buildPayload() for the same reason
     * LazadaProductSyncService::uploadImagesToLazada()/
     * ShopeeProductSyncService::uploadImagesToShopee() are separate.
     */
    private function uploadImagesToTikTok(array $payload): array
    {
        if (! empty($payload['main_images'])) {
            $payload['main_images'] = array_map(
                fn (array $image) => ['uri' => $this->client->uploadImage($image['uri'])],
                $payload['main_images']
            );
        }

        return $payload;
    }

    /**
     * FIRES A REAL, LIVE WRITE TO TIKTOK — creates or edits an actual
     * listing on the seller's storefront, visible to real customers. Only
     * call this with the user's explicit, specific go-ahead on a real
     * product.
     *
     * CONFIRMED LIVE, 2026-08-17: pushed a real product end to end through
     * this exact method — image uploaded, product created, platform_item_id
     * cached below, zero warnings in the response. That run only exercised
     * the create branch (no platform_item_id was cached yet for that
     * product/shop pair); the update branch below (existing platform_item_id
     * → updateProduct()) hasn't been separately exercised, so
     * TikTokClient::updateProduct()'s PUT-vs-POST method choice is still
     * technically unconfirmed — see that method's docblock.
     *
     * Create vs. update is decided from our own cached platform_item_id —
     * same reasoning and same create-fallback-on-stale-id behavior as
     * ShopeeProductSyncService::push(), since TikTok has no documented
     * "find product by our own SKU" endpoint either (unlike Lazada's
     * /products/get?sku_seller_list=).
     */
    public function push(Product $product, SalesPlatformShop $shop): array
    {
        $payload = $this->buildPayload($product, $shop);
        $payload = $this->uploadImagesToTikTok($payload);

        $cachedProductId = DB::table('product_platform_shops')
            ->where('product_id', $product->id)
            ->where('sales_platform_shop_id', $shop->id)
            ->value('platform_item_id');

        if ($cachedProductId) {
            try {
                return $this->client->updateProduct((string) $cachedProductId, $payload);
            } catch (\Throwable $e) {
                // Cached product_id no longer resolves on TikTok's side
                // (e.g. deleted outside this app) — fall through to create
                // fresh rather than leaving this product stuck unable to
                // push, same fallback ShopeeProductSyncService::push() uses.
            }
        }

        $result = $this->client->createProduct($payload);

        $newProductId = $result['data']['product_id'] ?? null;
        if ($newProductId) {
            DB::table('product_platform_shops')->updateOrInsert(
                ['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id],
                ['platform_item_id' => (string) $newProductId, 'updated_at' => now()]
            );
        }

        return $result;
    }

    /**
     * FIRES A REAL, LIVE WRITE TO TIKTOK — takes down an actual listing
     * customers can currently see. Same explicit-go-ahead rule as push().
     * Requires a cached platform_item_id — nothing to deactivate without
     * one, same guard as Lazada/Shopee's own deactivate().
     */
    public function deactivate(Product $product, SalesPlatformShop $shop): array
    {
        $productId = DB::table('product_platform_shops')
            ->where('product_id', $product->id)
            ->where('sales_platform_shop_id', $shop->id)
            ->value('platform_item_id');

        if (! $productId) {
            throw new RuntimeException("Product '{$product->sku}' has never been pushed to '{$shop->name}' — nothing to deactivate.");
        }

        return $this->client->deactivateProducts([(string) $productId]);
    }

    /**
     * Degraded relative to Lazada's/Shopee's checkLiveStatus() — see class
     * docblock point 3. No documented single-item "Get Product" endpoint
     * exists to ask TikTok directly, so this only reflects our own cached
     * product_platform_shops row (last written by push()/deactivate()
     * above) — RESOLVED, 2026-08-17, once TikTokClient::getProduct() was
     * confirmed live. Now asks TikTok directly, same role as
     * LazadaProductSyncService::checkLiveStatus(), rather than trusting our
     * own cache (which push() never even wrote a status into — this method
     * used to always report is_live: false for anything actually pushed).
     *
     * Real finding from the first live call, 2026-08-17, against the
     * product pushed earlier this session: `data.status` came back
     * "SELLER_DEACTIVATED" with `data.audit.status: "APPROVED"` — i.e. the
     * product passed TikTok's audit but is NOT live. Confirms `data.status`
     * ("incorporates both the product status and the audit status" per the
     * docs) is the right single field for is_live, NOT audit.status alone
     * (APPROVED here didn't mean visible to customers) and not
     * product_status alone either (same value as data.status in this case,
     * but the docs describe them as tracking different things).
     *
     * Also refreshes product_platform_shops' status/last_synced_at with
     * what it just found, same "keep our own cache honest" reasoning as
     * Lazada/Shopee's own checkLiveStatus().
     *
     * @return array{is_live: bool, never_pushed: bool, status: string|null}
     */
    public function checkLiveStatus(Product $product, SalesPlatformShop $shop): array
    {
        $productId = DB::table('product_platform_shops')
            ->where('product_id', $product->id)
            ->where('sales_platform_shop_id', $shop->id)
            ->value('platform_item_id');

        if (! $productId) {
            return ['is_live' => false, 'never_pushed' => true, 'status' => null];
        }

        $response = $this->client->getProduct((string) $productId);
        $status = $response['data']['status'] ?? null;
        $isLive = $status === 'ACTIVATE';

        DB::table('product_platform_shops')->updateOrInsert(
            ['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id],
            ['status' => $isLive ? 'live' : null, 'platform_item_id' => (string) $productId, 'last_synced_at' => now(), 'updated_at' => now()]
        );

        return ['is_live' => $isLive, 'never_pushed' => false, 'status' => $status];
    }

    /**
     * Confirmed live, 2026-08-17: TikTokClient::getWarehouseList() returns
     * real warehouses per shop — the shop tested had exactly two, a
     * RETURN_WAREHOUSE and a default SALES_WAREHOUSE. Prefers the seller's
     * own default SALES_WAREHOUSE (is_default: true) since that's what a
     * normal push should ship from; falls back to any SALES_WAREHOUSE, then
     * any warehouse at all, rather than fail outright for a shop with an
     * unusual setup (e.g. no default marked). Called fresh on every
     * buildPayload() — no local caching, same as resolveProductAttributes()
     * below and Shopee's own resolveBrand()/resolveAttributes().
     */
    private function resolveWarehouseId(): string
    {
        $warehouses = collect($this->client->getWarehouseList()['data']['warehouses'] ?? []);

        $warehouse = $warehouses->first(fn (array $w) => ($w['is_default'] ?? false) && ($w['type'] ?? null) === 'SALES_WAREHOUSE')
            ?? $warehouses->first(fn (array $w) => ($w['type'] ?? null) === 'SALES_WAREHOUSE')
            ?? $warehouses->first();

        if (! $warehouse) {
            throw new RuntimeException('This TikTok shop has no warehouse configured — set one up in TikTok Shop Seller Center before pushing.');
        }

        return (string) $warehouse['id'];
    }

    /**
     * Checks the category's live attribute schema (getAttributes()) and
     * builds product_attributes from whatever this app has mapped via
     * TikTokAttributeMapping (admin-configurable — see
     * TikTokAttributeMappingController, which replaces the previously-empty
     * hardcoded TIKTOK_ATTRIBUTE_SOURCE const), collecting the rest —
     * genuinely required (`is_requried` — TikTok's own typo, see
     * TikTokClient::getAttributes()) and still unfillable — into $missing.
     * Only PRODUCT_PROPERTY-type attributes are considered; SKU_PROPERTY-type
     * ones are per-variant sales attributes (skus[].sales_attributes), out
     * of scope for this single-SKU-only implementation. First mapped PIM
     * attribute with a value wins per tiktok_attribute_id (by sort_order),
     * same semantics as Lazada/Shopee's own resolvers.
     *
     * @return array{product_attributes: list<array{id: string, values: list<array{name: string}>}>, missing: list<string>}
     */
    private function resolveProductAttributes(Product $product, ?int $channelId, string $categoryId): array
    {
        $response = $this->client->getAttributes($categoryId);
        $schema = $response['data']['attributes'] ?? [];

        $mappingsByTikTokAttributeId = TikTokAttributeMapping::whereNotNull('tiktok_attribute_id')
            ->with('attribute')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('tiktok_attribute_id');

        $productAttributes = [];
        $missing = [];

        foreach ($schema as $attr) {
            if (($attr['type'] ?? null) !== 'PRODUCT_PROPERTY') {
                continue;
            }

            $value = null;

            foreach ($mappingsByTikTokAttributeId->get($attr['id'], collect()) as $mapping) {
                if (!$mapping->attribute) {
                    continue;
                }

                // localeCode: 'th' matches every other attributeValue() call
                // in this class (e.g. pname) — a locale-based PIM attribute
                // mapped here would otherwise silently resolve to null
                // forever, the same class of bug already found and fixed
                // this session for the WooCommerce/Shopee/Lazada equivalents.
                $candidate = $this->attributeValue($product, $mapping->attribute->code, $channelId, localeCode: 'th');
                if ($candidate !== null && $candidate !== '') {
                    $value = $candidate;
                    break;
                }
            }

            if ($value !== null) {
                $productAttributes[] = [
                    'id' => $attr['id'],
                    'values' => [['name' => $value]],
                ];

                continue;
            }

            if (! empty($attr['is_requried'])) {
                $missing[] = $attr['name'];
            }
        }

        return ['product_attributes' => $productAttributes, 'missing' => $missing];
    }
}
