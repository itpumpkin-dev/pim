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

        $query = ProductValue::where('product_id', $product->id)
            ->where('attribute_id', $attribute->id)
            ->where('channel_id', $attribute->is_channel_based ? $channelId : null);

        if ($attribute->is_locale_based) {
            $localeId = $localeCode ? Locale::where('code', $localeCode)->value('id') : null;
            $query->where('locale_id', $localeId);
        } else {
            $query->whereNull('locale_id');
        }

        $raw = $query->value('value');

        $formatted = AttributeValueFormatter::format($attribute, $raw);

        return is_array($formatted) ? ($formatted[0] ?? null) : $formatted;
    }
}
