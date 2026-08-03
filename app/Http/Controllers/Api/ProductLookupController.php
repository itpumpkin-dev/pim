<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Channel;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\AttributeValueFormatter;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

/**
 * Public, unauthenticated API — only enabled, sellable (type=simple) products
 * are ever queried here, mirroring StorefrontController's exposure rules.
 */
class ProductLookupController extends Controller
{
    public function show(string $sku): JsonResponse
    {
        $product = Product::with('family:id,code,name')
            ->where('sku', $sku)
            ->where('enabled', true)
            ->first();

        if (!$product) {
            return response()->json(['message' => "Product with sku '{$sku}' not found"], 404);
        }

        $attributes = $product->family_id
            ? FamilyAttribute::with('attribute')
                ->where('family_id', $product->family_id)
                ->orderBy('sort_order')
                ->get()
                ->pluck('attribute')
                ->filter()
            : Attribute::all();

        $locales = Locale::pluck('code', 'id');
        $channels = Channel::pluck('code', 'id');

        // Every scope (global, per-channel, per-locale) a value can be stored
        // under — a naive channel_id/locale_id=null filter would silently
        // drop locale- or channel-scoped attributes like pname entirely.
        $valuesByAttribute = ProductValue::where('product_id', $product->id)
            ->get(['attribute_id', 'channel_id', 'locale_id', 'value'])
            ->groupBy('attribute_id');

        return response()->json([
            'id' => $product->id,
            'sku' => $product->sku,
            'type' => $product->type,
            'enabled' => (bool) $product->enabled,
            'family' => $product->family ? [
                'id' => $product->family->id,
                'code' => $product->family->code,
                'name' => $product->family->name,
            ] : null,
            'created_at' => $product->created_at?->toDateTimeString(),
            'updated_at' => $product->updated_at?->toDateTimeString(),
            'attributes' => $attributes->map(fn (Attribute $attribute) => [
                'code' => $attribute->code,
                'name' => $attribute->name,
                'type' => $attribute->type,
                'is_locale_based' => (bool) $attribute->is_locale_based,
                'is_channel_based' => (bool) $attribute->is_channel_based,
                'value' => $this->resolveValue($attribute, $valuesByAttribute->get($attribute->id, collect()), $locales, $channels),
            ])->values(),
        ]);
    }

    /**
     * Plain attributes resolve to a single scalar/array value. Locale- and/or
     * channel-scoped attributes resolve to a map keyed by locale code and/or
     * channel code instead, since they can hold more than one value at once.
     */
    private function resolveValue(Attribute $attribute, Collection $rows, Collection $locales, Collection $channels): mixed
    {
        if (!$attribute->is_locale_based && !$attribute->is_channel_based) {
            $row = $rows->first(fn ($r) => $r->channel_id === null && $r->locale_id === null);

            return AttributeValueFormatter::format($attribute, $row?->value);
        }

        $result = [];
        foreach ($rows as $row) {
            $formatted = AttributeValueFormatter::format($attribute, $row->value);
            $channelKey = $row->channel_id ? ($channels->get($row->channel_id) ?? (string) $row->channel_id) : 'default';
            $localeKey = $row->locale_id ? ($locales->get($row->locale_id) ?? (string) $row->locale_id) : 'default';

            if ($attribute->is_channel_based && $attribute->is_locale_based) {
                $result[$channelKey][$localeKey] = $formatted;
            } elseif ($attribute->is_channel_based) {
                $result[$channelKey] = $formatted;
            } else {
                $result[$localeKey] = $formatted;
            }
        }

        return $result;
    }
}
