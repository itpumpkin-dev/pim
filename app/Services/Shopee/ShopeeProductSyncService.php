<?php

namespace App\Services\Shopee;

use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Models\ShopeeAttributeMapping;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Orchestrates pushing one product to one shop — mirrors
 * LazadaProductSyncService's shape, but two structural differences forced by
 * Shopee's own API surface (confirmed live, 2026-08-14, against real
 * get_attribute_tree/get_channel_list calls — see ShopeeClient):
 *
 * 1. Shopee has no documented "find item by our own SKU" endpoint the way
 *    Lazada's /products/get?sku_seller_list= exists. So create-vs-update and
 *    deactivate/status-check all key off product_platform_shops.
 *    platform_item_id, which *we* set right after a successful addItem() —
 *    not re-derived from Shopee on every call like Lazada's findProductMatch().
 *    This means syncLiveStatus() here can only confirm items we already know
 *    we pushed; it can't discover one pushed outside this app the way
 *    Lazada's SellerSku-matching sync can.
 * 2. Every logistics channel on this account was confirmed live to be
 *    fee_type=SIZE_INPUT (Shopee computes the buyer's shipping cost from
 *    package size, not a seller-set flat fee) — so logistic_info only needs
 *    each enabled channel's id + enabled:true, no shipping_fee.
 *
 * Everything else here (buildPayload's exact field names, addItem's other
 * required fields) is NOT yet confirmed against a live write — see
 * ShopeeClient::addItem()'s docblock.
 */
class ShopeeProductSyncService
{
    use ResolvesProductAttributeValues;

    /**
     * Same role as LazadaProductSyncService::SKU_FIELD_SOURCE — our
     * attribute code for each Shopee dimension field, when we have it.
     */
    private const DIMENSION_FIELD_SOURCE = [
        'package_length' => 'length_pcs',
        'package_width' => 'width_pcs',
        'package_height' => 'height_pcs',
    ];

    public function __construct(private readonly ShopeeClient $client)
    {
    }

    public static function forShop(SalesPlatformShop $shop): self
    {
        $account = $shop->shopeeAccount();
        if (!$account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked Shopee account.");
        }

        return new self(new ShopeeClient($account));
    }

    /**
     * Gathers our own data into Shopee's add_item payload shape. Read-only —
     * safe to call any time for inspection. Unlike Lazada's buildPayload(),
     * this does NOT yet validate against the category's live mandatory
     * attribute_list (get_attribute_tree) — Shopee's attribute schema has
     * far more shapes (free text, single-select, multi-select, each with its
     * own input_validation_type) than can responsibly be auto-filled without
     * live testing against real categories first. Any category-specific
     * mandatory attribute this doesn't provide will surface as a clear
     * product_error_attr rejection from push() instead of a pre-emptive
     * local check — same fallback Lazada's own buildPayload() already
     * accepts for attributes outside its own SKU_FIELD_SOURCE map.
     */
    public function buildPayload(Product $product, SalesPlatformShop $shop): array
    {
        $category = $product->categories()->whereNotNull('shopee_category_id')->first();
        if (!$category) {
            throw new RuntimeException("Product '{$product->sku}' has no category mapped to a Shopee category yet.");
        }

        $name = $this->attributeValue($product, 'pname', $shop->channel_id, localeCode: 'th');
        $price = $this->attributeValue($product, 'price_std', $shop->channel_id);
        $imageUrl = $this->attributeValue($product, 'pimage', $shop->channel_id);
        $qty = $this->attributeValue($product, 'qty', $shop->channel_id);
        $weight = $this->attributeValue($product, 'weight_pcs', $shop->channel_id);
        // `product_details_features` is the same attribute WooCommerce's
        // buildContentFields() defaults `description` to — real product copy
        // instead of the name repeated verbatim. Falls back to $name only
        // when a product has no content there yet, since Shopee's
        // `description` is a required field (confirmed live: add_item
        // rejects a missing one) and this app doesn't pre-validate that the
        // way Lazada's buildPayload() does for its own mandatory fields.
        $description = $this->attributeValue($product, 'product_details_features', $shop->channel_id, localeCode: 'th') ?: $name;
        // PIM's own `video` attribute type has only one attribute using it
        // today (attribute_6) — Shopee's video_info is optional (per the
        // product form: no `*`), so this stays null and gets filtered out of
        // the payload entirely for any product that hasn't set one.
        $videoUrl = $this->attributeValue($product, 'attribute_6', $shop->channel_id);

        if (!$name || !$price) {
            throw new RuntimeException("Product '{$product->sku}' is missing a name or price — cannot push to Shopee.");
        }

        if (!$imageUrl) {
            throw new RuntimeException("Product '{$product->sku}' has no image — Shopee requires at least one.");
        }

        $enabledChannelIds = $this->enabledLogisticsChannelIds();
        if (empty($enabledChannelIds)) {
            throw new RuntimeException("Shop '{$shop->name}' has no enabled Shopee logistics channel — cannot push.");
        }

        $attributes = $this->resolveAttributes($product, $shop->channel_id, (int) $category->shopee_category_id);
        if (!empty($attributes['missing'])) {
            throw new RuntimeException(
                'Shopee category requires attribute(s) this app has no data for and cannot auto-fill: '
                .implode(', ', $attributes['missing'])
                .' — often a regulatory requirement (e.g. Thai TIS certification) for this category. '
                .'Provide these manually or map this product to a less-restricted category instead.'
            );
        }

        $dimension = array_filter(array_map(
            fn (string $ourAttributeCode) => $this->attributeValue($product, $ourAttributeCode, $shop->channel_id),
            self::DIMENSION_FIELD_SOURCE
        ));

        $brand = $this->resolveBrand((int) $category->shopee_category_id);

        return array_filter([
            'item_name' => $name,
            'description' => $description,
            'category_id' => (int) $category->shopee_category_id,
            'item_sku' => $product->sku,
            'weight' => (float) ($weight ?: 0.1),
            'brand' => $brand,
            // Confirmed live, 2026-08-14: Shopee rejected the previous
            // price_info[{currency, original_price}] shape with
            // "invalid field original_price, value must Not Null" — that
            // nested/multi-currency shape is for cross-border sellers; this
            // shop is domestic Thai, so the flat field is what's expected.
            'original_price' => (float) $price,
            'attribute_list' => $attributes['attribute_list'],
            'seller_stock' => [
                ['stock' => (int) ($qty ?? 0)],
            ],
            // Still our own storage URL at this point — push() swaps it for
            // a real Shopee image_id via uploadImagesToShopee() below.
            // Kept out of this method so buildPayload() stays
            // side-effect-free/safe to call anytime for inspection.
            'image' => ['image_id_list' => [$imageUrl]],
            // Still our own storage URL at this point, same reasoning as
            // `image` above — push()'s uploadVideoToShopee() swaps it for a
            // real Shopee video_id (a multi-step upload-then-transcode flow,
            // see ShopeeClient::uploadVideo()) before this payload is sent.
            'video_info' => $videoUrl ? [['video_url' => $videoUrl]] : null,
            'logistic_info' => array_map(
                fn ($id) => ['logistic_id' => $id, 'enabled' => true],
                $enabledChannelIds
            ),
            'dimension' => count($dimension) === 3 ? array_map('intval', $dimension) : null,
        ], fn ($v) => $v !== null && $v !== []);
    }

    /**
     * See ShopeeClient::uploadImage() — a real write (uploads to Shopee's
     * media space) kept out of buildPayload() for the same reason
     * LazadaProductSyncService::uploadImagesToLazada() is separate.
     */
    private function uploadImagesToShopee(array $payload): array
    {
        if (!empty($payload['image']['image_id_list'])) {
            $payload['image']['image_id_list'] = array_map(
                fn (string $url) => $this->client->uploadImage($url),
                $payload['image']['image_id_list']
            );
        }

        return $payload;
    }

    /**
     * See ShopeeClient::uploadVideo()'s docblock — a real write (uploads to
     * Shopee's media space, then waits on their own transcoding) kept out of
     * buildPayload() for the same reason uploadImagesToShopee() above is.
     * Slower than an image upload (transcoding isn't instant) — expect this
     * step alone to add real seconds to push() for any product carrying a
     * video, not just the usual HTTP round-trip.
     */
    private function uploadVideoToShopee(array $payload): array
    {
        if (!empty($payload['video_info'][0]['video_url'])) {
            $videoId = $this->client->uploadVideo($payload['video_info'][0]['video_url']);
            $payload['video_info'] = [['video_id' => $videoId]];
        }

        return $payload;
    }

    /**
     * FIRES A REAL, LIVE WRITE TO SHOPEE — creates or edits an actual
     * listing on the seller's storefront, visible to real customers. Only
     * call this with the user's explicit, specific go-ahead on a real
     * product — this method has never actually been called; addItem()'s own
     * docblock has the full caveat.
     *
     * Create vs. update is decided from our own cached platform_item_id
     * (see this class's docblock for why, unlike Lazada, this can't ask
     * Shopee directly first) — if update fails because that cached id is no
     * longer valid Shopee-side, this falls back to creating fresh rather
     * than surfacing an opaque failure.
     */
    public function push(Product $product, SalesPlatformShop $shop): array
    {
        $payload = $this->buildPayload($product, $shop);
        $payload = $this->uploadImagesToShopee($payload);
        $payload = $this->uploadVideoToShopee($payload);

        $cachedItemId = DB::table('product_platform_shops')
            ->where('product_id', $product->id)
            ->where('sales_platform_shop_id', $shop->id)
            ->value('platform_item_id');

        if ($cachedItemId) {
            try {
                return $this->client->updateItem([...$payload, 'item_id' => (int) $cachedItemId]);
            } catch (\Throwable $e) {
                // Cached item_id no longer resolves on Shopee's side (e.g.
                // deleted outside this app) — fall through to create fresh
                // rather than leaving this product stuck unable to push.
            }
        }

        $result = $this->client->addItem($payload);

        $newItemId = $result['response']['item_id'] ?? null;
        if ($newItemId) {
            DB::table('product_platform_shops')->updateOrInsert(
                ['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id],
                ['platform_item_id' => (string) $newItemId, 'updated_at' => now()]
            );
        }

        return $result;
    }

    /**
     * FIRES A REAL, LIVE WRITE TO SHOPEE — hides an actual listing from the
     * storefront. Same explicit-go-ahead rule as push(). Requires a cached
     * platform_item_id (see this class's docblock) — nothing to deactivate
     * without one.
     */
    public function deactivate(Product $product, SalesPlatformShop $shop): array
    {
        $itemId = DB::table('product_platform_shops')
            ->where('product_id', $product->id)
            ->where('sales_platform_shop_id', $shop->id)
            ->value('platform_item_id');

        if (!$itemId) {
            throw new RuntimeException("Product '{$product->sku}' has never been pushed to '{$shop->name}' — nothing to deactivate.");
        }

        return $this->client->unlistItem((int) $itemId);
    }

    /**
     * Real-time single-item status check against our cached platform_item_id
     * — see this class's docblock for why this can't ask Shopee to find the
     * item by SKU the way Lazada's checkLiveStatus() does. Read-only against
     * Shopee; the only write is refreshing our own cache.
     *
     * @return array{is_live: bool, never_pushed: bool, status: string|null}
     */
    public function checkLiveStatus(Product $product, SalesPlatformShop $shop): array
    {
        $itemId = DB::table('product_platform_shops')
            ->where('product_id', $product->id)
            ->where('sales_platform_shop_id', $shop->id)
            ->value('platform_item_id');

        if (!$itemId) {
            return ['is_live' => false, 'never_pushed' => true, 'status' => null];
        }

        $response = $this->client->getItemBaseInfo([(int) $itemId]);
        $item = $response['response']['item_list'][0] ?? null;

        $status = $item['item_status'] ?? null;
        $isLive = strtoupper((string) $status) === 'NORMAL';

        DB::table('product_platform_shops')->updateOrInsert(
            ['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id],
            ['status' => $isLive ? 'live' : null, 'platform_item_id' => (string) $itemId, 'last_synced_at' => now(), 'updated_at' => now()]
        );

        return ['is_live' => $isLive, 'never_pushed' => false, 'status' => $status];
    }

    /**
     * Refreshes product_platform_shops.status/last_synced_at for every row
     * already linked to this shop, from Shopee's own current item list.
     * FIRES A REAL WRITE, but only to our own database — reads from Shopee.
     *
     * Limitation vs. Lazada's equivalent (see this class's docblock): only
     * confirms rows we already have a platform_item_id for. Can't discover a
     * product pushed to this shop from outside this app.
     *
     * @return array{matched: int, total_live: int}
     */
    public function syncLiveStatus(SalesPlatformShop $shop): array
    {
        $liveItemIds = [];
        $offset = 0;
        $pageSize = 50;

        do {
            $response = $this->client->getItemList($offset, $pageSize, 'NORMAL');
            foreach ($response['response']['item'] ?? [] as $item) {
                $liveItemIds[] = (string) $item['item_id'];
            }

            $hasMore = (bool) ($response['response']['has_next_page'] ?? false);
            $offset += $pageSize;

            if ($hasMore) {
                usleep(300_000);
            }
        } while ($hasMore);

        $now = now();

        $matched = DB::table('product_platform_shops')
            ->where('sales_platform_shop_id', $shop->id)
            ->whereIn('platform_item_id', $liveItemIds)
            ->update(['status' => 'live', 'last_synced_at' => $now, 'updated_at' => $now]);

        // Anything previously marked live for this shop but not seen in this
        // sync is no longer live — same reset (not delete) reasoning as
        // LazadaProductSyncService::syncLiveStatus().
        DB::table('product_platform_shops')
            ->where('sales_platform_shop_id', $shop->id)
            ->where('status', 'live')
            ->whereNotIn('platform_item_id', $liveItemIds)
            ->update(['status' => null, 'last_synced_at' => $now]);

        return ['matched' => $matched, 'total_live' => count($liveItemIds)];
    }

    /**
     * Confirmed live, 2026-08-14: every logistics channel on the tested
     * account is fee_type=SIZE_INPUT (Shopee computes the buyer's shipping
     * cost from package size), so enabling a channel needs nothing beyond
     * its id — no shipping_fee to compute or supply.
     */
    private function enabledLogisticsChannelIds(): array
    {
        $response = $this->client->getChannelList();
        $channels = $response['response']['logistics_channel_list'] ?? [];

        return collect($channels)
            ->where('enabled', true)
            ->pluck('logistics_channel_id')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Confirmed live, 2026-08-14: add_item rejected with
     * product.error_invalid_brand ("Brand information required") for a real
     * category on this shop without a `brand` object — get_brand_list's
     * `is_mandatory` flag is what actually determines whether that's
     * required, and it varies per category (unlike Lazada, which has one
     * universal "No Brand" string that works everywhere). This looks for
     * that category's own generic "no brand" entry — present as
     * brand_id=0/"NoBrand" for the category tested — and only sends a brand
     * object at all when one exists or the category doesn't require it.
     *
     * Returns null (omit `brand` entirely) when the category has no
     * mandatory brand requirement. Throws when it does but no generic
     * option exists — same "can't auto-fill, surface a clear error instead
     * of guessing a real brand" fallback Lazada's own buildPayload() accepts
     * for attributes outside its SKU_FIELD_SOURCE map.
     */
    private function resolveBrand(int $categoryId): ?array
    {
        $response = $this->client->getBrandList($categoryId, 0, 50);
        $isMandatory = (bool) ($response['response']['is_mandatory'] ?? false);
        $brands = $response['response']['brand_list'] ?? [];

        $noBrand = collect($brands)->first(function (array $b) {
            if ((int) ($b['brand_id'] ?? -1) === 0) {
                return true;
            }

            $normalized = strtolower(str_replace(' ', '', (string) ($b['original_brand_name'] ?? '')));

            return str_contains($normalized, 'nobrand');
        });

        if ($noBrand) {
            return ['brand_id' => (int) $noBrand['brand_id'], 'original_brand_name' => $noBrand['original_brand_name']];
        }

        if ($isMandatory) {
            throw new RuntimeException(
                "Shopee category {$categoryId} requires a specific brand and has no generic \"No Brand\" option — assign a real brand manually before pushing (not yet supported by this auto-push)."
            );
        }

        return null;
    }

    /**
     * Confirmed live, 2026-08-14: add_item rejected with product_error_busi
     * ("Attribute \"TIS No.\" is mandatory required") for the Power
     * Generators category — a Thai TIS/มอก. safety-certification field this
     * app had no data source for at all at the time. Rather than let each
     * mandatory attribute surface one at a time across repeated live push
     * attempts (Shopee's add_item appears to validate and reject on the
     * first failing field, not report every gap at once), this checks the
     * category's full attribute schema up front — read-only, safe to call
     * anytime — building the real attribute_list from whatever's mapped via
     * ShopeeAttributeMapping (admin-configurable, see
     * ShopeeAttributeMappingController — replaces the old hardcoded
     * SHOPEE_ATTRIBUTE_SOURCE const), and collecting the rest (still
     * genuinely unfillable) into one clear error before ever attempting a
     * live write. Only FREE_TEXT_FILED attributes are supported this way —
     * select/dropdown attributes need a specific value_id, which
     * ShopeeAttributeMappingController::update() already refuses to let a
     * mapping target.
     *
     * @return array{attribute_list: list<array{attribute_id: int, attribute_value_list: list<array{original_value_name: string}>}>, missing: list<string>}
     */
    private function resolveAttributes(Product $product, ?int $channelId, int $categoryId): array
    {
        $response = $this->client->getAttributeTree([$categoryId]);
        $schema = $response['response']['list'][0]['attribute_tree'] ?? [];

        $mappingsByShopeeAttributeId = ShopeeAttributeMapping::whereNotNull('shopee_attribute_id')
            ->with('attribute')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('shopee_attribute_id');

        $attributeList = [];
        $missing = [];

        foreach ($schema as $attr) {
            $value = null;

            foreach ($mappingsByShopeeAttributeId->get($attr['attribute_id'], collect()) as $mapping) {
                if (!$mapping->attribute) {
                    continue;
                }

                // localeCode: 'th' matches every other attributeValue() call
                // in this class (e.g. pname) — a locale-based PIM attribute
                // mapped here would otherwise silently resolve to null
                // forever, the same class of bug already found and fixed
                // this session for WooCommerceProductSyncService::buildPayload().
                $candidate = $this->attributeValue($product, $mapping->attribute->code, $channelId, localeCode: 'th');
                if ($candidate !== null && $candidate !== '') {
                    $value = $candidate;
                    break;
                }
            }

            if ($value !== null) {
                // FREE_TEXT_FILED shape (input_type 3, confirmed live for
                // all three TIS fields) — a plain original_value_name, no
                // value_id since there's no predefined list to pick from.
                $attributeList[] = [
                    'attribute_id' => $attr['attribute_id'],
                    'attribute_value_list' => [['original_value_name' => $value]],
                ];

                continue;
            }

            if (!empty($attr['mandatory'])) {
                $missing[] = $attr['name'];
            }
        }

        return ['attribute_list' => $attributeList, 'missing' => $missing];
    }
}
