<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\BuildsLocalizedLabelMap;
use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Locale;
use App\Services\Catalog\AttributeValueFormatter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Read-only lookup for the Brands master (see Brand model's docblock — its
 * `code` is what a product's `pbrand` attribute value actually stores).
 * Same exposure rule as CategoryLookupController/ProductLookupController:
 * index() sits behind the api_key middleware, show() is public. Only
 * active brands are ever returned.
 */
class BrandLookupController extends Controller
{
    use BuildsLocalizedLabelMap;

    private const MAX_PER_PAGE = 200;

    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->query('per_page', 50), self::MAX_PER_PAGE));

        $brands = Brand::with(['translations', 'parent'])
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString();

        $locales = Locale::pluck('code', 'id');
        $data = $brands->getCollection()->map(fn (Brand $brand) => $this->present($brand, $locales));

        return response()->json([
            'data' => $data->values(),
            'meta' => [
                'current_page' => $brands->currentPage(),
                'per_page' => $brands->perPage(),
                'total' => $brands->total(),
                'last_page' => $brands->lastPage(),
            ],
        ]);
    }

    public function show(string $code): JsonResponse
    {
        $brand = Brand::with(['translations', 'parent'])
            ->where('code', $code)
            ->where('is_active', true)
            ->first();

        if (!$brand) {
            return response()->json(['message' => "Brand with code '{$code}' not found"], 404);
        }

        return response()->json($this->present($brand, Locale::pluck('code', 'id')));
    }

    private function present(Brand $brand, Collection $locales): array
    {
        return [
            'id' => $brand->id,
            'code' => $brand->code,
            'name' => $this->localizedLabelMap($brand->translations, $brand->name, $locales),
            'slug' => $brand->slug,
            'description' => $brand->description,
            'is_active' => (bool) $brand->is_active,
            'sort_order' => $brand->sort_order,
            'thumbnail_url' => AttributeValueFormatter::resolveStorageUrl($brand->thumbnail),
            'parent' => $brand->parent ? [
                'id' => $brand->parent->id,
                'code' => $brand->parent->code,
            ] : null,
            'created_at' => $brand->created_at?->toDateTimeString(),
            'updated_at' => $brand->updated_at?->toDateTimeString(),
        ];
    }
}
