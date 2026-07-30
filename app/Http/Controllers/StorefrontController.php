<?php

namespace App\Http\Controllers;

use App\Models\Attribute;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\ProductPresenter;
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
        ]);
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
        $relatedIds = $categoryAttributeId
            ? ProductValue::where('attribute_id', $categoryAttributeId)
                ->where('value', $mapped['category'])
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
}
