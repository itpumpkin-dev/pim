<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * products.status (active/hold/delete/new) — แยกจาก `enabled` เรียก
 * controller ตรงๆ แบบเดียวกับ ProductControllerSkuAndTemplateTest
 */
test('a newly created product starts with status new', function () {
    app(ProductController::class)->store(Request::create('/catalog/products', 'POST', [
        'sku' => 'STATUS-NEW-1',
        'type' => 'simple',
        'enabled' => true,
    ]));

    expect(Product::where('sku', 'STATUS-NEW-1')->value('status'))->toBe('new');
});

test('update saves the chosen status without touching enabled', function () {
    $product = Product::create(['sku' => 'STATUS-HOLD-1', 'type' => 'simple', 'enabled' => true]);

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-HOLD-1',
        'type' => 'simple',
        'enabled' => true,
        'status' => 'hold',
    ]), $product);

    $product->refresh();
    expect($product->status)->toBe('hold');
    expect($product->enabled)->toBeTrue();
});

test('update keeps the current status when the request does not send one', function () {
    $product = Product::create(['sku' => 'STATUS-KEEP-1', 'type' => 'simple', 'enabled' => false, 'status' => 'delete']);

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-KEEP-1',
        'type' => 'simple',
        'enabled' => false,
    ]), $product);

    expect($product->fresh()->status)->toBe('delete');
});

test('update rejects a status outside active/hold/delete/new', function () {
    $product = Product::create(['sku' => 'STATUS-BAD-1', 'type' => 'simple', 'enabled' => false]);

    expect(fn () => app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-BAD-1',
        'type' => 'simple',
        'enabled' => false,
        'status' => 'archived',
    ]), $product))->toThrow(ValidationException::class);

    expect($product->fresh()->status)->toBe('new');
});
