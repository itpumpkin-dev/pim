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
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Only enabled, sellable (type=simple) products are ever queried here,
 * mirroring StorefrontController's exposure rules. show() is public
 * (callers must already know the exact SKU); index() additionally sits
 * behind the api_key middleware since it hands out the whole catalog.
 */
class ProductLookupController extends Controller
{
    private const MAX_PER_PAGE = 200;

    public function show(string $sku): JsonResponse
    {
        $product = Product::with('family:id,code,name')
            ->where('sku', $sku)
            ->where('enabled', true)
            ->first();

        if (!$product) {
            return response()->json(['message' => "Product with sku '{$sku}' not found"], 404);
        }

        $attributes = $this->attributesForFamily($product->family_id);
        $locales = Locale::pluck('code', 'id');
        $channels = Channel::pluck('code', 'id');

        $valuesByAttribute = ProductValue::where('product_id', $product->id)
            ->get(['attribute_id', 'channel_id', 'locale_id', 'value'])
            ->groupBy('attribute_id');

        return response()->json($this->present($product, $attributes, $valuesByAttribute, $locales, $channels));
    }

    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->query('per_page', 50), self::MAX_PER_PAGE));

        $query = Product::with('family:id,code,name')
            ->where('enabled', true)
            ->where('type', 'simple');

        if ($updatedSince = $request->query('updated_since')) {
            try {
                $query->where('updated_at', '>=', Carbon::parse($updatedSince));
            } catch (\Exception) {
                return response()->json(['message' => 'Invalid updated_since — use an ISO 8601 date/time'], 422);
            }
        }

        $products = $query->orderBy('id')->paginate($perPage)->withQueryString();
        $productList = $products->getCollection();

        $locales = Locale::pluck('code', 'id');
        $channels = Channel::pluck('code', 'id');

        $attributesByFamily = FamilyAttribute::with('attribute')
            ->whereIn('family_id', $productList->pluck('family_id')->filter()->unique())
            ->orderBy('sort_order')
            ->get()
            ->groupBy('family_id')
            ->map(fn ($rows) => $rows->pluck('attribute')->filter());

        $valuesByProduct = ProductValue::whereIn('product_id', $productList->pluck('id'))
            ->get(['product_id', 'attribute_id', 'channel_id', 'locale_id', 'value'])
            ->groupBy('product_id');

        $data = $productList->map(function (Product $product) use ($attributesByFamily, $valuesByProduct, $locales, $channels) {
            $attributes = $product->family_id ? ($attributesByFamily->get($product->family_id) ?: collect()) : collect();
            $valuesByAttribute = ($valuesByProduct->get($product->id) ?: collect())->groupBy('attribute_id');

            return $this->present($product, $attributes, $valuesByAttribute, $locales, $channels);
        });

        return response()->json([
            'data' => $data->values(),
            'meta' => [
                'current_page' => $products->currentPage(),
                'per_page' => $products->perPage(),
                'total' => $products->total(),
                'last_page' => $products->lastPage(),
            ],
        ]);
    }

    private function attributesForFamily(?int $familyId): Collection
    {
        if (!$familyId) {
            return Attribute::all();
        }

        return FamilyAttribute::with('attribute')
            ->where('family_id', $familyId)
            ->orderBy('sort_order')
            ->get()
            ->pluck('attribute')
            ->filter();
    }

    private function present(Product $product, Collection $attributes, Collection $valuesByAttribute, Collection $locales, Collection $channels): array
    {
        return [
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
        ];
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
