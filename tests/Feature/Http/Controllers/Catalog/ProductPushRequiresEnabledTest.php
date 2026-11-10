<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Jobs\SyncProductToMarketplaceJob;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Queue;

/**
 * ปิด "การเผยแพร่" (enabled=false) = push ไป Marketplace ไม่ได้ ทั้งปุ่ม Push ทีละร้าน
 * (queueMarketplaceSync()), Push หลายสินค้า (pushBulk()) และด่านสุดท้ายใน
 * SyncProductToMarketplaceJob — ส่วน deactivate ยังทำได้ตามปกติ
 */
function pushGuardShop(): SalesPlatformShop
{
    $platform = SalesPlatform::create(['code' => 'shopee_'.uniqid(), 'name' => 'Shopee']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'My Shop']);
}

beforeEach(function () {
    Queue::fake();
    // ไม่มี role = ไม่ถูกจำกัดร้าน (User::allowedShopIds() คืน null) — canAccessShop() ผ่าน
    $this->actingAs(User::factory()->create());
});

test('single-shop push is rejected when the product is not enabled', function () {
    $product = Product::create(['sku' => 'PUSH-OFF-1', 'type' => 'simple', 'enabled' => false]);
    $shop = pushGuardShop();
    $product->platformShops()->attach($shop->id);

    $response = app(ProductController::class)->pushToShopee($product, $shop);

    expect($response->getStatusCode())->toBe(422);
    expect($response->getData(true)['message'])->toContain('not enabled for publishing');
    expect(ProductMarketplaceSyncJob::count())->toBe(0);
    Queue::assertNothingPushed();
});

test('single-shop deactivate still works when the product is not enabled', function () {
    $product = Product::create(['sku' => 'PUSH-OFF-2', 'type' => 'simple', 'enabled' => false]);
    $shop = pushGuardShop();
    $product->platformShops()->attach($shop->id);

    $response = app(ProductController::class)->deactivateShopee($product, $shop);

    expect($response->getStatusCode())->toBe(202);
    Queue::assertPushed(SyncProductToMarketplaceJob::class);
});

test('queued push job fails without calling the marketplace if the product was disabled while queued', function () {
    $product = Product::create(['sku' => 'PUSH-JOB-OFF', 'type' => 'simple', 'enabled' => false]);
    $shop = pushGuardShop();
    $record = ProductMarketplaceSyncJob::create([
        'product_id' => $product->id,
        'sales_platform_shop_id' => $shop->id,
        'platform' => 'shopee',
        'action' => 'push',
        'status' => 'queued',
    ]);

    (new SyncProductToMarketplaceJob($record->id, null))->handle();

    $record->refresh();
    expect($record->status)->toBe('failed');
    expect($record->message)->toContain('not enabled for publishing');
});

test('the rejection message is translated to Thai', function () {
    app()->setLocale('th');
    $product = Product::create(['sku' => 'PUSH-OFF-TH', 'type' => 'simple', 'enabled' => false]);
    $shop = pushGuardShop();
    $product->platformShops()->attach($shop->id);

    $response = app(ProductController::class)->pushToShopee($product, $shop);

    expect($response->getData(true)['message'])->toContain('ปิดการเผยแพร่');
});

test('bulk push and bulk deactivate are closed — marketplace writes happen only on the Product Mapping "Push" step', function () {
    $product = Product::create(['sku' => 'PUSH-BULK-CLOSED', 'type' => 'simple', 'enabled' => true]);
    $shop = pushGuardShop();

    foreach (['pushBulk', 'deactivateBulk'] as $method) {
        $request = Request::create('/catalog/products/push-bulk', 'POST', ['product_ids' => [$product->id], 'shop_ids' => [$shop->id]]);
        $request->setUserResolver(fn () => auth()->user());
        app(ProductController::class)->{$method}($request);

        expect(session('error'))->toContain('Push');
    }

    expect(ProductMarketplaceSyncJob::count())->toBe(0)
        ->and($product->platformShops()->count())->toBe(0);
    Queue::assertNothingPushed();
});
