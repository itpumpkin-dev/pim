<?php

namespace App\Services\Lazada;

use App\Models\AttributeOption;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\LazadaBrand;
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
        $lazadaCategoryId = $this->resolveLazadaCategoryId($product);

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

        // Admin-configurable, on top of the fixed fields above — see
        // LazadaAttributeMappingController. attribute_type decides whether
        // a mapped value belongs in payload.attributes (normal) or the
        // SKU-level fields (sku) — same distinction
        // assertMandatoryFieldsPresent() already checks. Fetched before the
        // brand resolution below because `brand` needs to check this map
        // first (its own alternate route — see next comment).
        $mappedAttributes = $this->resolveMappedAttributes($mappings, $product, $shop->channel_id);

        // Two independent routes to a Lazada brand, either is enough on its
        // own — the Master Brand page (resolveLazadaBrandId()/lazada_brands,
        // ~153,600 rows synced locally, searched by name) takes priority
        // when it resolves anything; falls back to whatever an admin mapped
        // directly onto Lazada's own `brand` category attribute via this
        // page's generic Attribute Mapping mechanism otherwise. Was a
        // straight throw-if-missing before this page could reach `brand` at
        // all — see LazadaAttributeMappingController's class docblock for
        // why unioning them was needed instead of one silently overwriting
        // the other. ProductController::hasMarketplaceBrandMapped() gates
        // the Push button on this same pair of routes, kept in sync by hand
        // (no shared helper — that check runs during a page load, this runs
        // during buildPayload()).
        $lazadaBrandId = $this->resolveLazadaBrandId($product);
        $masterBrandName = $lazadaBrandId ? LazadaBrand::find($lazadaBrandId)?->name : null;
        $genericBrandLabel = $mappedAttributes['brand']['label'] ?? null;
        $genericBrandValue = $mappedAttributes['brand']['value'] ?? null;
        // Prefer the label captured at mapping time (reliable — doesn't
        // depend on any shared cache); resolveGenericBrandName() is a legacy
        // fallback for option-mappings saved before that label existed, kept
        // only so those don't regress — see that method's own docblock for
        // the bug this label was added to fix.
        $brandName = $masterBrandName
            ?? (is_string($genericBrandLabel) && $genericBrandLabel !== '' ? $genericBrandLabel : null)
            ?? $this->resolveGenericBrandName(is_string($genericBrandValue) ? $genericBrandValue : null);

        if (!$brandName) {
            throw new RuntimeException(
                "Product '{$product->sku}' has no brand mapped to Lazada yet — map it via the Master Brand page, or via this page's 'brand' attribute row."
            );
        }

        // Already consumed above — must not also go through the generic
        // loop below, which would silently overwrite $brandName with
        // whichever of the two happened to resolve there (defeating the
        // priority order just decided).
        unset($mappedAttributes['brand']);

        $normalAttributes = [
            'name' => $name,
            'short_description' => $name,
            'brand' => $brandName,
        ];
        if ($videoUrl) {
            $normalAttributes['video'] = $videoUrl;
        }

        foreach ($mappedAttributes as $lazadaName => $result) {
            if ($result['attribute_type'] === 'sku') {
                $skuFields[$lazadaName] = $result['value'];
            } else {
                $normalAttributes[$lazadaName] = $result['value'];
            }
        }

        $payload = [
            'primary_category_id' => $lazadaCategoryId,
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

        $this->assertMandatoryFieldsPresent($lazadaCategoryId, $payload);

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
     * input_type branches added for singleSelect/multiSelect/enumInput/
     * multiEnumInput/img (see LazadaAttributeMappingController's class
     * docblock for the full picture) — `date`/`text`/`numeric`/`richText`
     * still just take the plain resolved value, unchanged.
     *
     * @param \Illuminate\Support\Collection<int, LazadaAttributeMapping> $mappings same collection buildPayload() already fetched
     * @return array<string, array{value: mixed, attribute_type: ?string}>
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

                $inputType = $mapping->lazadaAttribute->input_type ?? null;
                $label = null;

                if (in_array($inputType, ['multiSelect', 'multiEnumInput'], true)) {
                    $value = $this->resolveMultiSelectOptionValues($mapping, $product, $channelId);
                    $isEmpty = $value === [];
                } else {
                    // A locale-based PIM attribute mapped here without a
                    // matching localeCode would otherwise silently resolve to
                    // null forever, the same bug already found and fixed once
                    // this session for WooCommerceProductSyncService::buildPayload().
                    $value = $this->attributeValue($product, $mapping->attribute->code, $channelId, localeCode: $localeCode);

                    if (in_array($inputType, ['singleSelect', 'enumInput'], true)) {
                        [$value, $label] = $this->resolveSingleSelectOptionValue($mapping, $value);
                    }

                    $isEmpty = $value === null || $value === '';
                }

                if (!$isEmpty) {
                    $resolved[$lazadaName] = [
                        'value' => $value,
                        // เก็บ label ที่แอดมินเลือกไว้ ณ ตอนจับคู่ตัวเลือกด้วย (มีค่า
                        // เฉพาะ singleSelect/enumInput ที่ผ่าน resolveSingleSelectOptionValue()
                        // เท่านั้น) — buildPayload() ใช้ตัวนี้สำหรับ `brand` โดยเฉพาะ
                        // แทนที่จะพึ่ง lazada_attributes.options ที่ sync ของ category
                        // อื่นทับได้ตลอดเวลา (ดูบั๊กที่แก้ไปใน resolveGenericBrandName())
                        'label' => $label,
                        'attribute_type' => $mapping->lazadaAttribute->attribute_type ?? null,
                    ];
                    break;
                }
            }
        }

        return $resolved;
    }

    /**
     * Translates one product's stored AttributeOption code (the same
     * convention `pbrand` uses — see ResolvesProductAttributeValues::
     * mappedBrandOptionId()'s docblock) into whatever value Lazada's schema
     * actually expects for a singleSelect/enumInput attribute, via the
     * admin-configured LazadaAttributeOptionMapping row for this specific
     * (attribute -> Lazada attribute) mapping. Returns [null, null] (treated
     * as "no value", not an error) if the code doesn't resolve to a known
     * option or that option has no Lazada counterpart chosen yet.
     *
     * Returns both the raw `value` (Lazada's own option id — what every
     * other select-type attribute sends, still unconfirmed live whether
     * that's really the wire format Lazada wants) and the `label` captured
     * alongside it at mapping time (added specifically so buildPayload()'s
     * `brand` resolution doesn't have to fall back to the shared, mutable
     * lazada_attributes.options cache — see that column's own docblock).
     *
     * @return array{0: ?string, 1: ?string} [value, label]
     */
    private function resolveSingleSelectOptionValue(LazadaAttributeMapping $mapping, ?string $rawCode): array
    {
        if ($rawCode === null || $rawCode === '') {
            return [null, null];
        }

        $optionId = AttributeOption::where('attribute_id', $mapping->attribute_id)->where('code', $rawCode)->value('id');
        if (!$optionId) {
            return [null, null];
        }

        $optionMapping = LazadaAttributeOptionMapping::where('lazada_attribute_mapping_id', $mapping->id)
            ->where('attribute_option_id', $optionId)
            ->first(['lazada_option_value', 'lazada_option_label']);

        return [$optionMapping?->lazada_option_value, $optionMapping?->lazada_option_label];
    }

    /**
     * Same idea as resolveSingleSelectOptionValue() but for multiSelect/
     * multiEnumInput, which store several option codes at once.
     *
     * Reads the raw formatted value directly (not via attributeValue(),
     * which only ever returns an array-shaped value's first element) —
     * ProductController::update() json_encode()'s any array-shaped incoming
     * value generically (not special-cased to `gallery`), and
     * AttributeValueFormatter only JSON-decodes for attributes of type
     * `gallery`, passing every other type's raw stored string straight
     * through — so a multiselect PIM attribute's value arrives here as a
     * JSON-encoded string of option codes that needs decoding by hand.
     *
     * NOT CONFIRMED LIVE: returns a plain PHP array (serialized as a JSON
     * array in the final payload) — whether Lazada's real API actually wants
     * an array here, or a comma-separated string instead, has never been
     * tested against a live multiSelect attribute. See this class's
     * LazadaAttributeMappingController docblock cross-reference.
     *
     * @return array<int, string>
     */
    private function resolveMultiSelectOptionValues(LazadaAttributeMapping $mapping, Product $product, ?int $channelId): array
    {
        if (!$mapping->attribute) {
            return [];
        }

        $raw = $this->resolveFormattedAttributeValue($product, $mapping->attribute->code, $channelId);
        $codes = is_array($raw) ? $raw : (json_decode((string) $raw, true) ?: []);

        if (!is_array($codes) || $codes === []) {
            return [];
        }

        $optionIdByCode = AttributeOption::where('attribute_id', $mapping->attribute_id)
            ->whereIn('code', $codes)
            ->pluck('id', 'code');

        if ($optionIdByCode->isEmpty()) {
            return [];
        }

        $lazadaValueByOptionId = LazadaAttributeOptionMapping::where('lazada_attribute_mapping_id', $mapping->id)
            ->whereIn('attribute_option_id', $optionIdByCode->values())
            ->pluck('lazada_option_value', 'attribute_option_id');

        $resolved = [];
        foreach ($codes as $code) {
            $optionId = $optionIdByCode->get($code);
            $value = $optionId ? $lazadaValueByOptionId->get($optionId) : null;
            if ($value !== null) {
                $resolved[] = $value;
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
        $payload = $this->uploadAttributeImagesToLazada($payload);
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
     * Same reasoning as uploadImagesToLazada() above, but for any category
     * attribute whose input_type is `img` (see
     * LazadaAttributeMappingController's docblock) — buildPayload() resolves
     * these to our own public storage URL already (via
     * AttributeValueFormatter, since the validator restricts this target to
     * image/file-type PIM attributes), same as the product's own main
     * images, so the same Lazada-hosting requirement almost certainly
     * applies here too. NOT CONFIRMED LIVE against a real `img`-type
     * category attribute — if Lazada actually accepts an external URL for
     * this particular field, this step is harmless (uploadImage() just
     * returns the equivalent hosted URL), but if it rejects the field
     * outright some other way, this is the method to revisit.
     */
    private function uploadAttributeImagesToLazada(array $payload): array
    {
        if (empty($payload['attributes'])) {
            return $payload;
        }

        $imgFieldNames = LazadaAttribute::whereIn('name', array_keys($payload['attributes']))
            ->where('input_type', 'img')
            ->pluck('name');

        foreach ($imgFieldNames as $name) {
            if (!empty($payload['attributes'][$name])) {
                $payload['attributes'][$name] = $this->client->uploadImage($payload['attributes'][$name]);
            }
        }

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
     * A product's own `lazada_category_id` override (set directly from
     * Lazada's synced tree on the Edit Product page) wins when present;
     * otherwise falls back to whichever of the product's PIM categories has
     * a Lazada mapping configured (the shared, category-level default every
     * product without its own override still relies on).
     */
    private function resolveLazadaCategoryId(Product $product): int
    {
        if ($product->lazada_category_id) {
            return (int) $product->lazada_category_id;
        }

        $category = $product->categories()->whereNotNull('lazada_category_id')->first();
        if (!$category) {
            throw new RuntimeException("Product '{$product->sku}' has no category mapped to a Lazada category yet.");
        }

        return (int) $category->lazada_category_id;
    }

    /**
     * A product's own `lazada_brand_id` override (set directly from
     * Lazada's synced brand list on the Edit Product page) wins when
     * present; otherwise falls back to whichever marketplace brand this
     * product's `pbrand` attribute value's AttributeOption is mapped to.
     *
     * Returns null instead of throwing (unlike resolveLazadaCategoryId(),
     * which still throws — category has no alternate path) — buildPayload()
     * now accepts a second, alternate route for `brand` specifically (an
     * admin can map a PIM attribute directly onto Lazada's own `brand`
     * category attribute via the generic Attribute Mapping page instead of
     * this Master Brand page), so failing to resolve here is no longer
     * automatically fatal; buildPayload() decides that after trying both.
     */
    private function resolveLazadaBrandId(Product $product): ?int
    {
        if ($product->lazada_brand_id) {
            return (int) $product->lazada_brand_id;
        }

        $mapped = $this->mappedBrandOptionId($product, 'lazada_brand_id');

        return $mapped !== null ? (int) $mapped : null;
    }

    /**
     * LEGACY FALLBACK ONLY — buildPayload() now prefers the label captured
     * directly on LazadaAttributeOptionMapping at mapping time (reliable,
     * see resolveSingleSelectOptionValue()); this method only still runs for
     * an option-mapping row saved before that label column existed.
     *
     * Was the *only* way to resolve `brand`'s name until this fix, and was a
     * real, confirmed bug: it looks the id up in lazada_attributes.options —
     * a single row keyed only by attribute `name`, shared across every
     * Lazada category — which gets silently overwritten every time ANY
     * category with its own `brand` attribute gets (re-)synced
     * (syncLazadaAttributesForCategory()/syncLazadaAttributes(), both upsert
     * on `['name']` alone). A product mapped against one category's option
     * ids could therefore find no match at all once a different category's
     * sync ran, and this method would return the raw numeric id string
     * back to buildPayload() instead of a real name — which very likely
     * fails Lazada's own CHK_CATPROP_CPV_NOT_ENUM check.
     */
    private function resolveGenericBrandName(?string $optionId): ?string
    {
        if ($optionId === null || $optionId === '') {
            return null;
        }

        $options = LazadaAttribute::find('brand')?->options ?? [];
        foreach ($options as $option) {
            if (is_array($option) && (string) ($option['id'] ?? null) === $optionId) {
                return $option['name'] ?? $optionId;
            }
        }

        // ไม่เจอใน options ที่ sync ไว้ (เช่น category นี้ `brand` ไม่ใช่ input_type
        // select เลยไม่มี option ให้เทียบ) — ถือว่าเป็นค่าที่แอดมิน map มาแบบอิสระ
        // ส่งค่านั้นตรงๆ ตามที่ตั้งค่าไว้ แทนที่จะทิ้งไปเฉยๆ
        return $optionId;
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
