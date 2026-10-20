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

test('changing the status to hold unpublishes the product immediately', function () {
    $product = Product::create(['sku' => 'STATUS-HOLD-1', 'type' => 'simple', 'enabled' => true, 'status' => 'active']);

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-HOLD-1',
        'type' => 'simple',
        'enabled' => true,
        'status' => 'hold',
    ]), $product);

    $product->refresh();
    expect($product->status)->toBe('hold');
    expect($product->enabled)->toBeFalse();
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

test('changing only the status bumps the storefront cache version', function () {
    $product = Product::create(['sku' => 'STATUS-BUMP-1', 'type' => 'simple', 'enabled' => true, 'status' => 'active']);
    $before = Product::storefrontVersion();

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-BUMP-1',
        'type' => 'simple',
        'enabled' => true,
        'status' => 'hold',
    ]), $product);

    expect(Product::storefrontVersion())->not->toBe($before);
});

test('an Active product keeps publishing when saved', function () {
    $product = Product::create(['sku' => 'STATUS-ACTIVE-1', 'type' => 'simple', 'enabled' => false, 'status' => 'active']);

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-ACTIVE-1', 'type' => 'simple', 'enabled' => true, 'status' => 'active',
    ]), $product);

    expect($product->fresh()->enabled)->toBeTrue();
});

test('a New product cannot be published', function () {
    $product = Product::create(['sku' => 'STATUS-NEW-PUB', 'type' => 'simple', 'enabled' => false]);

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-NEW-PUB', 'type' => 'simple', 'enabled' => true, 'status' => 'new',
    ]), $product);

    expect($product->fresh()->enabled)->toBeFalse();
});

test('status cannot go back to New once it has left New', function () {
    $product = Product::create(['sku' => 'STATUS-BACK-1', 'type' => 'simple', 'enabled' => false, 'status' => 'active']);

    expect(fn () => app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'STATUS-BACK-1', 'type' => 'simple', 'enabled' => false, 'status' => 'new',
    ]), $product))->toThrow(ValidationException::class);

    expect($product->fresh()->status)->toBe('active');
});

test('the publish action refuses a product that is not Active', function () {
    $product = Product::create(['sku' => 'STATUS-PUB-HOLD', 'type' => 'simple', 'enabled' => false, 'status' => 'hold']);
    $this->actingAs(\App\Models\User::factory()->create());

    app(ProductController::class)->publish(Request::create("/catalog/products/{$product->id}/publish", 'POST', []), $product);

    expect($product->fresh()->enabled)->toBeFalse();
    expect(session('error'))->not->toBeNull();
});
