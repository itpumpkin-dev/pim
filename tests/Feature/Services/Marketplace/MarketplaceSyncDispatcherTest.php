<?php

use App\Jobs\SyncProductToMarketplaceJob;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\MarketplaceSyncDispatcher;
use Illuminate\Support\Facades\Queue;

function makeShop(): SalesPlatformShop
{
    $platform = SalesPlatform::create(['code' => 'shopee_'.uniqid(), 'name' => 'Shopee']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'My Shop']);
}

test('queue creates a ProductMarketplaceSyncJob tracking row with the given attributes and status "queued"', function () {
    Queue::fake();
    $product = Product::create(['sku' => 'SKU-1']);
    $shop = makeShop();

    $user = User::factory()->create();

    $dispatcher = new MarketplaceSyncDispatcher();
    $syncJob = $dispatcher->queue($product, $shop, 'shopee', 'push', $user->id);

    expect($syncJob)->toBeInstanceOf(ProductMarketplaceSyncJob::class);
    expect($syncJob->product_id)->toBe($product->id);
    expect($syncJob->sales_platform_shop_id)->toBe($shop->id);
    expect($syncJob->platform)->toBe('shopee');
    expect($syncJob->action)->toBe('push');
    expect($syncJob->status)->toBe('queued');
    expect($syncJob->user_id)->toBe($user->id);
    expect(ProductMarketplaceSyncJob::find($syncJob->id))->not->toBeNull();
});

test('queue defaults user_id to null for system-initiated (auto-sync) calls', function () {
    Queue::fake();
    $product = Product::create(['sku' => 'SKU-1']);
    $shop = makeShop();

    $syncJob = (new MarketplaceSyncDispatcher())->queue($product, $shop, 'lazada', 'deactivate');

    expect($syncJob->user_id)->toBeNull();
});

test('queue dispatches a SyncProductToMarketplaceJob carrying the new tracking row\'s id and the user id', function () {
    Queue::fake();
    $product = Product::create(['sku' => 'SKU-1']);
    $shop = makeShop();

    $user = User::factory()->create();
    $syncJob = (new MarketplaceSyncDispatcher())->queue($product, $shop, 'shopee', 'push', $user->id);

    Queue::assertPushed(SyncProductToMarketplaceJob::class, function ($job) use ($syncJob) {
        return $job->syncJobId === $syncJob->id;
    });
});
