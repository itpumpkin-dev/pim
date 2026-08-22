<?php

namespace App\Services\Lazada;

use App\Models\LazadaAttributeMapping;
use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Orchestrates pushing one product to one shop: gathers our own data and
 * validates it against Lazada's live category schema (buildPayload — reads
 * only, safe to call any time) and, only when explicitly asked, sends it to
 * Lazada via LazadaClient (push — a real, live write).
 */
class LazadaProductSyncService
{
    use ResolvesProductAttributeValues;

    public function __construct(private readonly LazadaClient $client)
    {
    }

    public static function forShop(SalesPlatformShop $shop): self
    {
        $account = $shop->lazadaAccount();
        if (!$account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked Lazada account.");
        }

        return new self(new LazadaClient($account));
    }

    /**
     * Gathers our own data into Lazada's payload shape, then validates it
     * against that category's live mandatory-field list (one read-only API
     * call — safe, no write). Throws with a specific, actionable list of
     * what's missing rather than letting an incomplete payload reach push().
     */
    public function buildPayload(Product $product, SalesPlatformShop $shop): array
    {
        $category = $product->categories()->whereNotNull('lazada_category_id')->first();
        if (!$category) {
            throw new RuntimeException("Product '{$product->sku}' has no category mapped to a Lazada category yet.");
        }

        // Admin-configurable (LazadaAttributeMappingController) — replaces
        // the old hardcoded pname/price_std/qty/attribute_6/SKU_FIELD_SOURCE
        // lookups. Fetched once and reused by resolveMappedAttributes()
        // below for the `lazada_attribute` group.
        $mappings = LazadaAttributeMapping::with(['attribute', 'lazadaAttribute'])->orderBy('sort_order')->get();

        $name = $this->resolveMappedField($mappings, 'name', $product, $shop->channel_id, localeCode: 'th');
        $price = $this->resolveMappedField($mappings, 'price', $product, $shop->channel_id);
        // Full `pgallery` list when the product has one, falling back to
        // the single legacy `pimage` — see ResolvesProductAttributeValues::
        // resolveProductImageUrls(). Not part of the target_field mapping
        // system — Lazada already pulls the whole gallery dynamically, a
        // different (multi-value) mechanism than the single-value fields
        // below.
        $imageUrls = $this->resolveProductImageUrls($product, $shop->channel_id);
        $qty = $this->resolveMappedField($mappings, 'qty', $product, $shop->channel_id);
        // PIM's own uploaded-file `video` attribute — NOT `youtube_url` (a
        // plain external link): a real push once hit Lazada's
        // BIZ_CHECK_EXTERNAL_VIDEO_IS_FORBIDDEN when this was mapped to the
        // wrong kind of attribute via the general mechanism. Reopened as an
        // admin-configurable target_field, but LazadaAttributeMappingController
        // only ever allows a PIM attribute of type `video` to be saved
        // against it, so this can't silently regress into that bug again.
        // Still our own storage URL at this point — swapped for a real
        // Lazada video_id by uploadVideoToLazada() in push(), same
        // reasoning as $imageUrls/uploadImagesToLazada().
        $videoUrl = $this->resolveMappedField($mappings, 'video', $product, $shop->channel_id);

        if (!$name || !$price) {
            throw new RuntimeException("Product '{$product->sku}' is missing a name or price — cannot push to Lazada.");
        }

        $skuFields = [
            'SellerSku' => $product->sku,
            'quantity' => (int) ($qty ?? 0),
            'price' => $price,
            'images' => !empty($imageUrls) ? $imageUrls : null,
            'package_weight' => $this->resolveMappedField($mappings, 'weight', $product, $shop->channel_id),
            'package_length' => $this->resolveMappedField($mappings, 'length', $product, $shop->channel_id),
            'package_width' => $this->resolveMappedField($mappings, 'width', $product, $shop->channel_id),
            'package_height' => $this->resolveMappedField($mappings, 'height', $product, $shop->channel_id),
        ];

        $normalAttributes = [
            'name' => $name,
            'short_description' => $name,
            // Confirmed live, 2026-08-13: Lazada's `brand` field must
            // match its own controlled brand catalog exactly
            // (CHK_CATPROP_CPV_NOT_ENUM otherwise) — our local pbrand
            // select-option value (e.g. "option_1"/"พัมคิน") was never
            // going to match that. The catalog has 153,482 entries via
            // /category/brands/query with no confirmed name-search
            // parameter (tried name/keyword/brand_name/search — none
            // filtered), so matching our brand to a real Lazada brand_id
            // isn't currently feasible. "No Brand" is Lazada's own
            // documented universal fallback (present in their official
            // /product/create example payload) for exactly this case.
            'brand' => 'No Brand',
        ];
        if ($videoUrl) {
            $normalAttributes['video'] = $videoUrl;
        }

        // Admin-configurable, on top of the fixed fields above — see
        // LazadaAttributeMappingController. attribute_type decides whether
        // a mapped value belongs in payload.attributes (normal) or the
        // SKU-level fields (sku) — same distinction
        // assertMandatoryFieldsPresent() already checks.
        foreach ($this->resolveMappedAttributes($mappings, $product, $shop->channel_id) as $lazadaName => $result) {
            if ($result['attribute_type'] === 'sku') {
                $skuFields[$lazadaName] = $result['value'];
            } else {
                $normalAttributes[$lazadaName] = $result['value'];
            }
        }

        $payload = [
            'primary_category_id' => $category->lazada_category_id,
            'attributes' => array_filter($normalAttributes),
            // Confirmed via a real official /product/create example: Product
            // carries its own main-image list separate from each Sku's own
            // Images (which the same $imageUrls also feeds into via
            // $skuFields['images'] above) — both exist in the real payload.
            'images' => $imageUrls,
            'skus' => [
                array_filter($skuFields, fn ($v) => $v !== null && $v !== ''),
            ],
        ];

        $this->assertMandatoryFieldsPresent($category->lazada_category_id, $payload);

        return $payload;
    }

    /**
     * Lazada's own schema pairs a handful of its category attributes as
     * `_en` variants of a primary one (name/name_en, description/
     * description_en, short_description/short_description_en,
     * product_warranty/product_warranty_en, package_content/
     * package_contents_en — confirmed live via syncLazadaAttributes()) —
     * the base name wants Thai (this shop's primary storefront language,
     * matching every other attributeValue() call in this class), the `_en`
     * one wants English specifically. Without this, mapping any PIM
     * attribute to an `_en` target still resolved 'th' unconditionally,
     * so an admin mapping (say) product_details_features to
     * description_en would have pushed Thai text into an English-labelled
     * field — added once this was flagged, before any real `_en` mapping
     * had been made.
     */
    private function localeCodeForLazadaAttribute(string $lazadaName): string
    {
        return str_ends_with($lazadaName, '_en') ? 'en' : 'th';
    }

    /**
     * First mapped PIM attribute with a value wins per lazada_attribute_name
     * (by sort_order) — same semantics as WooCommerceProductSyncService::
     * resolveMappedField() / ShopeeProductSyncService::resolveAttributes().
     *
     * @param \Illuminate\Support\Collection<int, LazadaAttributeMapping> $mappings same collection buildPayload() already fetched
     * @return array<string, array{value: string, attribute_type: ?string}>
     */
    private function resolveMappedAttributes(\Illuminate\Support\Collection $mappings, Product $product, ?int $channelId): array
    {
        $mappings = $mappings->where('target_field', 'lazada_attribute')->groupBy('lazada_attribute_name');

        $resolved = [];

        foreach ($mappings as $lazadaName => $group) {
            $localeCode = $this->localeCodeForLazadaAttribute($lazadaName);

            foreach ($group as $mapping) {
                if (!$mapping->attribute) {
                    continue;
                }

                // A locale-based PIM attribute mapped here without a
                // matching localeCode would otherwise silently resolve to
                // null forever, the same bug already found and fixed once
                // this session for WooCommerceProductSyncService::buildPayload().
                $value = $this->attributeValue($product, $mapping->attribute->code, $channelId, localeCode: $localeCode);
                if ($value !== null && $value !== '') {
                    $resolved[$lazadaName] = [
                        'value' => $value,
                        'attribute_type' => $mapping->lazadaAttribute->attribute_type ?? null,
                    ];
                    break;
                }
            }
        }

        return $resolved;
    }

    /**
     * Decides create vs. update by asking Lazada directly (findProductMatch()
     * below) whether this SellerSku already exists under this shop.
     *
     * Previously checked n8n's lazada_product_mapping instead — found live,
     * 2026-08-13: that table can lag behind a just-completed push (n8n syncs
     * on its own separate schedule we don't control), so pushing again
     * shortly after a first successful push could still see "no mapping yet"
     * and call createProduct() a second time instead of updateProduct() —
     * risking a duplicate listing or Lazada's own SellerSku-repeat rejection.
     * Asking Lazada directly has no such lag.
     *
     * FIRES A REAL, LIVE WRITE TO LAZADA — creates or edits an actual
     * listing on the seller's storefront, visible to real customers. Only
     * call this with the user's explicit, specific go-ahead; buildPayload()
     * above is the safe way to inspect what would be sent first.
     */
    public function push(Product $product, SalesPlatformShop $shop): array
    {
        $payload = $this->buildPayload($product, $shop);
        // Images first — uploadVideoToLazada() reuses the now-Lazada-hosted
        // main image as the video's required coverUrl.
        $payload = $this->uploadImagesToLazada($payload);
        $payload = $this->uploadVideoToLazada($payload);

        $existing = $this->findProductMatch($product->sku);

        if ($existing) {
            // Confirmed live, 2026-08-13: /product/update rejects the
            // payload outright ("skuId is a mandatory field and must be
            // filled in") without this — unlike /product/create, which
            // assigns item_id/SkuId itself, an update has to say exactly
            // which existing item/sku it's targeting. findProductMatch()
            // (called above to decide create-vs-update in the first place)
            // already has both, so no extra Lazada call is needed to get them.
            $payload['item_id'] = $existing['item_id'];
            $payload['skus'][0]['SkuId'] = $existing['sku']['SkuId'] ?? null;

            return $this->client->updateProduct($payload);
        }

        return $this->client->createProduct($payload);
    }

    /**
     * Lazada rejects any product/SKU image URL that isn't already hosted on
     * their own domain (confirmed live, 2026-08-13:
     * BIZ_CHECK_EXIST_OUTER_MAIN_IMAGE) — buildPayload() only knows our own
     * storage URLs, so every one of them needs to go through
     * LazadaClient::uploadImage() and get swapped for the URL that comes
     * back before this payload can actually be submitted. Kept out of
     * buildPayload() itself so that method stays side-effect-free/safe to
     * call anytime for inspection — this step is a real write (uploads to
     * Lazada's CDN) and only belongs on the push() path.
     */
    private function uploadImagesToLazada(array $payload): array
    {
        $uploaded = [];
        $uploadOnce = function (string $localUrl) use (&$uploaded): string {
            return $uploaded[$localUrl] ??= $this->client->uploadImage($localUrl);
        };

        if (!empty($payload['images'])) {
            $payload['images'] = array_map($uploadOnce, $payload['images']);
        }

        foreach ($payload['skus'] as &$sku) {
            if (!empty($sku['images'])) {
                $sku['images'] = array_map($uploadOnce, $sku['images']);
            }
        }
        unset($sku);

        return $payload;
    }

    /**
     * Swaps `attributes.video` (still our own storage URL at this point,
     * from buildPayload()) for a real Lazada video_id via
     * LazadaClient::uploadVideo() — kept out of buildPayload() for the same
     * side-effect-free/safe-to-inspect reasoning as uploadImagesToLazada()
     * above. No-op if the product has no video.
     *
     * Requires `payload.images` to already be Lazada-hosted URLs (i.e. must
     * run after uploadImagesToLazada()) — the first one is reused as the
     * video's required coverUrl. Drops the video entirely (rather than
     * failing the whole push over it) if there's no image to use as a cover.
     */
    private function uploadVideoToLazada(array $payload): array
    {
        $videoUrl = $payload['attributes']['video'] ?? null;
        if (!$videoUrl) {
            return $payload;
        }

        $coverUrl = $payload['images'][0] ?? null;
        if (!$coverUrl) {
            unset($payload['attributes']['video']);

            return $payload;
        }

        $payload['attributes']['video'] = $this->client->uploadVideo($videoUrl, $coverUrl);

        return $payload;
    }

    /**
     * Hides this product's listing for this shop from the storefront —
     * requires it to actually exist on Lazada right now (findProductMatch()
     * below asks Lazada directly, not n8n's lazada_product_mapping — see
     * push()'s docblock for why that table can't be trusted for a check this
     * time-sensitive; it's exactly what produced the confusing case of
     * checkLiveStatus() confirming "live" while this method's old
     * mapping-based lookup still said "never pushed").
     *
     * FIRES A REAL, LIVE WRITE TO LAZADA — takes down an actual listing
     * visible to real customers. Same explicit-go-ahead rule as push().
     */
    public function deactivate(Product $product, SalesPlatformShop $shop): array
    {
        $match = $this->findProductMatch($product->sku);

        if (!$match) {
            throw new RuntimeException("Product '{$product->sku}' has never been pushed to '{$shop->name}' — nothing to deactivate.");
        }

        return $this->client->deactivateProduct([
            'item_id' => $match['item_id'],
            'sku_id' => $match['sku']['SkuId'] ?? null,
            'seller_sku' => $product->sku,
        ]);
    }

    /**
     * Real-time single-item status check — see findProductMatch() below for
     * why this asks Lazada directly rather than trusting n8n's
     * lazada_product_mapping. Meant to be called right before offering/
     * confirming Push or Deactivate, so a shop that was never actually
     * pushed (or was pushed but later deactivated outside this app) doesn't
     * look "maybe live" purely because a cache somewhere hasn't caught up.
     *
     * Also refreshes product_platform_shops' status/platform_item_id/
     * last_synced_at for this row with what it just found, so the result
     * and the cached "Live" badge stay consistent without waiting for the
     * next bulk sync.
     *
     * Read-only against Lazada; the only write is to our own cache.
     *
     * @return array{is_live: bool, never_pushed: bool, status: string|null}
     */
    public function checkLiveStatus(Product $product, SalesPlatformShop $shop): array
    {
        $match = $this->findProductMatch($product->sku);

        if ($match === null) {
            DB::table('product_platform_shops')
                ->where('product_id', $product->id)
                ->where('sales_platform_shop_id', $shop->id)
                ->update(['status' => null, 'last_synced_at' => now()]);

            return ['is_live' => false, 'never_pushed' => true, 'status' => null];
        }

        $status = $match['sku']['Status'] ?? null;
        $isLive = strtolower((string) $status) === 'active';

        DB::table('product_platform_shops')->updateOrInsert(
            ['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id],
            ['status' => $isLive ? 'live' : null, 'platform_item_id' => (string) $match['item_id'], 'last_synced_at' => now(), 'updated_at' => now()]
        );

        return ['is_live' => $isLive, 'never_pushed' => false, 'status' => $status];
    }

    /**
     * Shared lookup for push()/deactivate()/checkLiveStatus() — one direct
     * call to Lazada by our own SellerSku (LazadaClient::findProductBySku()),
     * returning the matching {item_id, sku: [...]} or null if this SKU
     * doesn't exist on Lazada under this shop's account at all.
     *
     * Deliberately not LazadaProductMapping (n8n's separate, independently-
     * timed sync of the same data): confirmed live, 2026-08-13, that it can
     * lag behind Lazada's actual current state enough to matter — a
     * checkLiveStatus() call (using this method) correctly reported a
     * product as live while deactivate()'s old mapping-based lookup still
     * said "never pushed", because n8n simply hadn't synced that mapping row
     * yet even though the listing had existed on Lazada for a while.
     */
    private function findProductMatch(string $sellerSku): ?array
    {
        $response = $this->client->findProductBySku($sellerSku);

        foreach ($response['data']['products'] ?? [] as $lazadaProduct) {
            foreach ($lazadaProduct['skus'] ?? [] as $sku) {
                if (($sku['SellerSku'] ?? null) === $sellerSku) {
                    return ['item_id' => $lazadaProduct['item_id'] ?? null, 'sku' => $sku];
                }
            }
        }

        return null;
    }

    /**
     * Refreshes product_platform_shops.status/platform_item_id/last_synced_at
     * for this shop from Lazada's own live-listing API — the only real
     * source of truth for whether a push actually succeeded (the row's mere
     * existence only ever meant "marked to publish", see
     * ProductController::update()'s published_shop_ids handling). Paging
     * through every live listing on every Products-list page load isn't
     * feasible (one shop alone had 265 live products in testing), so this
     * populates a local cache instead — see LazadaClient::getLiveProducts().
     *
     * FIRES A REAL WRITE, but only to our own database — reads from Lazada,
     * writes to us. No risk to Lazada's data; safe to re-run any time.
     *
     * @return array{matched: int, total_live: int}
     */
    public function syncLiveStatus(SalesPlatformShop $shop): array
    {
        $liveItemIdBySku = [];
        $offset = 0;
        $limit = 50;

        do {
            $response = $this->client->getLiveProducts($offset, $limit);
            $products = $response['data']['products'] ?? [];

            foreach ($products as $liveProduct) {
                foreach ($liveProduct['skus'] ?? [] as $sku) {
                    $sellerSku = $sku['SellerSku'] ?? null;
                    if ($sellerSku !== null && $sellerSku !== '') {
                        $liveItemIdBySku[$sellerSku] = $liveProduct['item_id'] ?? null;
                    }
                }
            }

            $total = (int) ($response['data']['total_products'] ?? 0);
            $offset += $limit;

            // Paced to reduce hitting Lazada's opaque per-account rate limit
            // ("901: too frequent") — a single shop can need several of
            // these calls back to back (265 live products / 50 per page = 6
            // pages), which is what actually triggered it live, 2026-08-13.
            if ($offset < $total) {
                usleep(300_000);
            }
        } while ($offset < $total);

        $productIdBySku = Product::whereIn('sku', array_keys($liveItemIdBySku))->pluck('id', 'sku');

        $now = now();
        foreach ($productIdBySku as $sku => $productId) {
            DB::table('product_platform_shops')->updateOrInsert(
                ['product_id' => $productId, 'sales_platform_shop_id' => $shop->id],
                ['status' => 'live', 'platform_item_id' => (string) $liveItemIdBySku[$sku], 'last_synced_at' => $now, 'updated_at' => $now]
            );
        }

        // Anything previously marked live for this shop but not seen in this
        // sync is no longer live (delisted/deactivated Lazada-side) — reset
        // rather than delete, since the row's existence alone still carries
        // the separate "marked to publish" meaning.
        DB::table('product_platform_shops')
            ->where('sales_platform_shop_id', $shop->id)
            ->where('status', 'live')
            ->whereNotIn('product_id', $productIdBySku->values())
            ->update(['status' => null, 'last_synced_at' => $now]);

        return ['matched' => $productIdBySku->count(), 'total_live' => count($liveItemIdBySku)];
    }

    /**
     * Read-only — fetches the category's live attribute schema and checks
     * every field it marks is_mandatory=1 has a non-empty value in $payload.
     */
    private function assertMandatoryFieldsPresent(int $categoryId, array $payload): void
    {
        $schema = $this->client->getCategoryAttributes($categoryId);
        $skuFields = $payload['skus'][0] ?? [];
        $missing = [];

        foreach ($schema['data'] ?? [] as $field) {
            if (empty($field['is_mandatory'])) {
                continue;
            }

            $providedIn = $field['attribute_type'] === 'sku' ? $skuFields : $payload['attributes'];
            // Confirmed via a live (read-only) getCategoryAttributes() call:
            // Lazada's schema names the SKU image slot "__images__", but our
            // own payload builds it under the plain "images" key (matching
            // the "Images" JSON key LazadaClient::buildProductPayload()
            // emits) — translate here so a category that actually requires
            // it doesn't get a false "missing" (or worse, a false pass) from
            // a literal key mismatch.
            $fieldName = $field['name'] === '__images__' ? 'images' : $field['name'];
            $value = $providedIn[$fieldName] ?? null;

            if ($value === null || $value === '' || $value === []) {
                $missing[] = ($field['label'] ?? $field['name']).' ('.$field['name'].')';
            }
        }

        if (!empty($missing)) {
            throw new RuntimeException(
                'Missing mandatory Lazada field(s) for this category: '.implode(', ', $missing)
            );
        }
    }
}
