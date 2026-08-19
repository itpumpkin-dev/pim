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
    private function attributeValue(Product $product, string $attributeCode, ?int $channelId, ?string $localeCode = null): ?string
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

        $formatted = AttributeValueFormatter::format($attribute, $raw);

        return is_array($formatted) ? ($formatted[0] ?? null) : $formatted;
    }
}
