<?php

namespace App\Http\Controllers;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\ProductViewEvent;
use App\Services\Catalog\ProductPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public-facing product pages (home, product detail). Unlike Catalog\ProductController,
 * these routes carry no auth/permission middleware, so only enabled, sellable
 * (type=simple) products are ever queried or exposed here.
 */
class StorefrontController extends Controller
{
    public function home(): Response
    {
        $products = Product::where('enabled', true)->where('type', 'simple')->orderBy('id')->get();

        $mapped = ProductPresenter::mapMany($products);

        $categories = collect($mapped)->pluck('category')->unique()->sort()->values()->all();

        return Inertia::render('home', [
            'products' => $mapped,
            'categories' => $categories,
            'topViewedProducts' => $this->topViewedProducts($mapped),
        ]);
    }

    /**
     * Top 10 products by storefront click count, restricted to products
     * still enabled/sellable (same set as $mappedProducts), most-viewed first.
     */
    private function topViewedProducts(array $mappedProducts): array
    {
        $mappedById = collect($mappedProducts)->keyBy('id');

        $topProductIds = ProductViewEvent::selectRaw('product_id, COUNT(*) as views')
            ->where('event_type', 'click')
            ->whereIn('product_id', $mappedById->keys())
            ->groupBy('product_id')
            ->orderByDesc('views')
            ->limit(10)
            ->pluck('product_id');

        return $topProductIds->map(fn ($id) => $mappedById->get($id))->filter()->values()->all();
    }

    public function show(int $id): Response
    {
        $product = Product::where('id', $id)->where('enabled', true)->where('type', 'simple')->first();

        if (!$product) {
            return Inertia::render('products/show', [
                'id' => $id,
                'product' => null,
                'related' => [],
            ]);
        }

        $mapped = ProductPresenter::mapMany(collect([$product]))[0];

        $categoryAttributeId = Attribute::where('code', 'pcatname')->value('id');

        // pcatname is a select field storing an AttributeOption code, not the
        // label — $mapped['category'] is already the resolved label (see
        // ProductPresenter::resolvePcatnameLabels), so match products whose
        // raw value is either that same code, or (for values predating the
        // dropdown) the literal free-typed label text.
        $matchingCodes = $categoryAttributeId
            ? AttributeOption::where('attribute_id', $categoryAttributeId)->where('admin_label', $mapped['category'])->pluck('code')
            : collect();

        $relatedIds = $categoryAttributeId
            ? ProductValue::where('attribute_id', $categoryAttributeId)
                ->where(function ($query) use ($mapped, $matchingCodes) {
                    $query->where('value', $mapped['category']);
                    if ($matchingCodes->isNotEmpty()) {
                        $query->orWhereIn('value', $matchingCodes);
                    }
                })
                ->pluck('product_id')
            : collect();

        $related = Product::whereIn('id', $relatedIds)
            ->where('id', '!=', $product->id)
            ->where('enabled', true)
            ->where('type', 'simple')
            ->limit(4)
            ->get();

        return Inertia::render('products/show', [
            'id' => $id,
            'product' => $mapped,
            'related' => ProductPresenter::mapMany($related),
        ]);
    }

    public function trackEvent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'event_type' => ['required', 'string', 'in:click,category_select'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'category' => ['nullable', 'string', 'max:150'],
        ]);

        ProductViewEvent::record(
            eventType: $validated['event_type'],
            productId: $validated['product_id'] ?? null,
            category: $validated['category'] ?? null,
        );

        return response()->json(['status' => 'ok']);
    }
}
