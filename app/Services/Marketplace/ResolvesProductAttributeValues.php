<?php

namespace App\Services\Marketplace;

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\AttributeValueFormatter;

/**
 * Shared by LazadaProductSyncService and ShopeeProductSyncService — resolving
 * one of our own attribute values for a product/channel has nothing
 * marketplace-specific about it, so both platforms' buildPayload() reuse this
 * exact lookup rather than each keeping their own copy.
 */
trait ResolvesProductAttributeValues
{
    /**
     * Shared lookup behind attributeValue()/attributeImageUrls() below —
     * resolves one attribute's stored value for this product/channel/locale
     * and runs it through AttributeValueFormatter, which is what turns a
     * `gallery` attribute's raw JSON path array into a list of public URLs
     * (everything else stays a plain scalar).
     */
    private function resolveFormattedAttributeValue(Product $product, string $attributeCode, ?int $channelId, ?string $localeCode = null): mixed
    {
        $attribute = Attribute::where('code', $attributeCode)->first();
        if (!$attribute) {
            return null;
        }

        $localeId = $attribute->is_locale_based && $localeCode ? Locale::where('code', $localeCode)->value('id') : null;

        $lookup = fn (?int $forChannelId) => ProductValue::where('product_id', $product->id)
            ->where('attribute_id', $attribute->id)
            ->where('channel_id', $forChannelId)
            ->where('locale_id', $localeId)
            ->value('value');

        $raw = $lookup($attribute->is_channel_based ? $channelId : null);

        // A channel with no value of its own falls back to the product's
        // Default (channel_id = null) — set via the Edit Product page's
        // "Default (All Channels)" scope, so it actually acts as a default
        // instead of just being data nobody reads.
        if ($raw === null && $attribute->is_channel_based && $channelId !== null) {
            $raw = $lookup(null);
        }

        return AttributeValueFormatter::format($attribute, $raw);
    }

    private function attributeValue(Product $product, string $attributeCode, ?int $channelId, ?string $localeCode = null): ?string
    {
        $formatted = $this->resolveFormattedAttributeValue($product, $attributeCode, $channelId, $localeCode);

        return is_array($formatted) ? ($formatted[0] ?? null) : $formatted;
    }

    /**
     * Every image URL for a `gallery`-type attribute (empty array if the
     * product has none) — unlike attributeValue(), which only ever returns
     * the first item of an array-shaped value, marketplace pushes need the
     * whole set to list more than one product image.
     */
    private function attributeImageUrls(Product $product, string $attributeCode, ?int $channelId): array
    {
        $formatted = $this->resolveFormattedAttributeValue($product, $attributeCode, $channelId);

        if (is_array($formatted)) {
            return array_values(array_filter($formatted));
        }

        return $formatted !== null && $formatted !== '' ? [$formatted] : [];
    }

    /**
     * Every image URL to push for this product/channel — the `pgallery`
     * attribute's full list when the product has one, falling back to the
     * legacy single-image `pimage` attribute for products not yet given any
     * gallery images. Shared by Lazada/Shopee/TikTok's buildPayload(), which
     * each used to read `pimage` alone and only ever send 1 image.
     */
    private function resolveProductImageUrls(Product $product, ?int $channelId): array
    {
        $galleryUrls = $this->attributeImageUrls($product, 'pgallery', $channelId);
        if (!empty($galleryUrls)) {
            return $galleryUrls;
        }

        $single = $this->attributeValue($product, 'pimage', $channelId);

        return $single ? [$single] : [];
    }

    /**
     * Single-value marketplace push fields (name/price/qty/weight/length/
     * width/height/description/video/...) — "first match wins": walks every
     * attribute an admin has mapped to $targetField (any of
     * WooCommerceAttributeMapping/ShopeeAttributeMapping/
     * LazadaAttributeMapping/TikTokAttributeMapping — they all share this
     * same `target_field` + `attribute` shape), in sort_order, and returns
     * the first one with an actual value for this product.
     *
     * Used to live as four near-identical private copies, one per
     * *ProductSyncService — consolidated here after the copies drifted (one
     * still hardcoded `localeCode: 'th'` while the others took it as a
     * parameter) and one of them shipped with a `if ($value)` truthy check
     * that silently dropped a legitimately-mapped "0" value (e.g. a real
     * zero weight/dimension) — explicit null/empty check here instead, so
     * that class of bug can't recur per-copy.
     *
     * @param \Illuminate\Support\Collection<int, object{target_field: ?string, attribute: ?Attribute}> $mappings
     */
    private function resolveMappedField(\Illuminate\Support\Collection $mappings, string $targetField, Product $product, ?int $channelId, ?string $localeCode = null): ?string
    {
        foreach ($mappings->where('target_field', $targetField) as $mapping) {
            if (!$mapping->attribute) {
                continue;
            }

            $value = $this->attributeValue($product, $mapping->attribute->code, $channelId, $localeCode);
            if ($value !== null && $value !== '') {
                return $value;
            }
        }

        return null;
    }
}
