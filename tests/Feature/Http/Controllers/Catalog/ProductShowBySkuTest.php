<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Product;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * /catalog/products/sku/{sku} — เปิดหน้าดูสินค้าด้วยรหัสสินค้า แล้ว redirect ไป URL ที่ใช้ id
 */
test('redirects to the product view page by exact SKU and keeps the query string', function () {
    $product = Product::create(['sku' => 'SBS-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    $request = Request::create("/catalog/products/sku/{$product->sku}?platform=shopee");
    $response = app(ProductController::class)->showBySku($request, $product->sku);

    expect($response->getTargetUrl())->toBe(route('catalog.products.show', $product->id).'?platform=shopee');
});

test('falls back to a case-insensitive match when there is exactly one', function () {
    $product = Product::create(['sku' => 'SbsMixed-'.($suffix = uniqid()), 'type' => 'simple', 'enabled' => false]);

    $response = app(ProductController::class)->showBySku(Request::create('/'), strtolower('SbsMixed-'.$suffix));

    expect($response->getTargetUrl())->toBe(route('catalog.products.show', $product->id));
});

test('returns 404 for an unknown SKU', function () {
    expect(fn () => app(ProductController::class)->showBySku(Request::create('/'), 'NO-SUCH-SKU-'.uniqid()))
        ->toThrow(NotFoundHttpException::class);
});
