<?php

use App\Events\ProductDataChanged;
use App\Http\Controllers\Catalog\ProductController;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;

/**
 * products.show_on_home (แสดงที่หน้า Home) — แยกจาก `enabled` (การเผยแพร่ไป
 * Marketplace) เรียก controller ตรงๆ แบบเดียวกับ ProductStatusTest
 */
test('store saves show_on_home independently of enabled', function () {
    app(ProductController::class)->store(Request::create('/catalog/products', 'POST', [
        'sku' => 'HOME-NEW-1',
        'type' => 'simple',
        'enabled' => false,
        'show_on_home' => true,
    ]));

    $product = Product::where('sku', 'HOME-NEW-1')->first();
    expect($product->enabled)->toBeFalse();
    expect($product->show_on_home)->toBeTrue();
});

test('store defaults show_on_home to false when not sent', function () {
    app(ProductController::class)->store(Request::create('/catalog/products', 'POST', [
        'sku' => 'HOME-NEW-2',
        'type' => 'simple',
        'enabled' => true,
    ]));

    expect(Product::where('sku', 'HOME-NEW-2')->value('show_on_home'))->toBeFalse();
});

test('update leaves show_on_home alone when not sent', function () {
    $product = Product::create(['sku' => 'HOME-KEEP-1', 'type' => 'simple', 'enabled' => true, 'show_on_home' => true]);

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'HOME-KEEP-1',
        'type' => 'simple',
        'enabled' => false,
    ]), $product->fresh());

    $product->refresh();
    expect($product->enabled)->toBeFalse();
    expect($product->show_on_home)->toBeTrue();
});

test('changing only show_on_home bumps the storefront cache without triggering marketplace sync', function () {
    Event::fake([ProductDataChanged::class]);
    $product = Product::create(['sku' => 'HOME-BUMP-1', 'type' => 'simple', 'enabled' => true, 'show_on_home' => true]);
    $before = Product::storefrontVersion();

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'HOME-BUMP-1',
        'type' => 'simple',
        'enabled' => true,
        'show_on_home' => false,
    ]), $product->fresh());

    expect($product->fresh()->show_on_home)->toBeFalse();
    expect(Product::storefrontVersion())->not->toBe($before);
    Event::assertNotDispatched(ProductDataChanged::class);
});
