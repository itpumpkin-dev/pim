<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\BuildsLocalizedLabelMap;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Locale;
use App\Services\Catalog\AttributeValueFormatter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Read-only lookup for the category tree (root / subcategory / product
 * group — all three depths live in the same `categories` table, see
 * Category model). Mirrors ProductLookupController's exposure rule: index()
 * hands out the whole tree and sits behind the api_key middleware, show()
 * is public since the caller must already know the exact code. Only active
 * categories are ever returned, same as products' `enabled=true` filter.
 */
class CategoryLookupController extends Controller
{
    use BuildsLocalizedLabelMap;

    private const MAX_PER_PAGE = 200;

    public function index(Request $request): JsonResponse
    {
        $perPage = max(1, min((int) $request->query('per_page', 50), self::MAX_PER_PAGE));

        $query = Category::with(['translations', 'parent'])->where('is_active', true);

        if ($parentCode = $request->query('parent_code')) {
            $parent = Category::where('code', $parentCode)->first();
            if (!$parent) {
                return response()->json(['message' => "Category with code '{$parentCode}' not found"], 404);
            }
            $query->where('parent_id', $parent->id);
        } elseif ($request->boolean('roots_only')) {
            $query->whereNull('parent_id');
        }

        $categories = $query->orderBy('id')->paginate($perPage)->withQueryString();

        $locales = Locale::pluck('code', 'id');
        $data = $categories->getCollection()->map(fn (Category $category) => $this->present($category, $locales));

        return response()->json([
            'data' => $data->values(),
            'meta' => [
                'current_page' => $categories->currentPage(),
                'per_page' => $categories->perPage(),
                'total' => $categories->total(),
                'last_page' => $categories->lastPage(),
            ],
        ]);
    }

    public function show(string $code): JsonResponse
    {
        $category = Category::with(['translations', 'parent.translations'])
            ->where('code', $code)
            ->where('is_active', true)
            ->first();

        if (!$category) {
            return response()->json(['message' => "Category with code '{$code}' not found"], 404);
        }

        $locales = Locale::pluck('code', 'id');

        $children = Category::with('translations')
            ->where('parent_id', $category->id)
            ->where('is_active', true)
            ->orderBy('id')
            ->get()
            ->map(fn (Category $child) => $this->present($child, $locales));

        return response()->json([
            ...$this->present($category, $locales),
            'children' => $children->values(),
        ]);
    }

    private function present(Category $category, Collection $locales): array
    {
        return [
            'id' => $category->id,
            'code' => $category->code,
            'name' => $this->localizedLabelMap($category->translations, $category->getRawOriginal('name'), $locales),
            'slug' => $category->slug,
            'is_active' => (bool) $category->is_active,
            'thumbnail_url' => AttributeValueFormatter::resolveStorageUrl($category->thumbnail),
            'parent' => $category->parent ? [
                'id' => $category->parent->id,
                'code' => $category->parent->code,
            ] : null,
            'created_at' => $category->created_at?->toDateTimeString(),
            'updated_at' => $category->updated_at?->toDateTimeString(),
        ];
    }
}
