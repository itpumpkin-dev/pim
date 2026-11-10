<?php

use App\Events\ProductDataChanged;
use App\Http\Controllers\Catalog\PlatformPushController;
use App\Http\Controllers\Catalog\ProductController;
use App\Jobs\AutoSyncProductToMarketplaceJob;
use App\Listeners\QueueAutoMarketplaceSync;
use App\Models\MarketplaceListing;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\ShopeeBrand;
use App\Models\ShopeeCategory;
use App\Models\User;
use App\Services\Marketplace\MarketplaceSyncDispatcher;
use App\Services\Marketplace\MarketplaceSyncGate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

/**
 * Push ต้องผ่าน Product Matching ก่อน (MarketplaceSyncGate::knownShopIds()) — ยัง
 * ไม่รู้จักบนร้านนั้น = จะสร้าง listing ใหม่ ต้องยืนยัน confirm_new_listing เอง
 * ทั้ง push ทีละร้าน, pushBulk(), publish() ส่วน auto-sync ไม่สร้างใหม่เลย
 */
function pmgShop(): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['code' => 'shopee'], ['name' => 'Shopee']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'PMG '.uniqid()]);
}

/** enabled + published on $shop + Shopee category/brand set — only the matching rule can block it */
function pmgReadyProduct(SalesPlatformShop $shop, string $sku): Product
{
    $category = ShopeeCategory::firstOrCreate(['id' => 990001], ['name' => 'PMG Cat', 'is_leaf' => true]);
    $brand = ShopeeBrand::firstOrCreate(['id' => 990002], ['name' => 'PMG Brand']);
    $product = Product::create(['sku' => $sku, 'type' => 'simple', 'enabled' => true, 'shopee_category_id' => $category->id, 'shopee_brand_id' => $brand->id]);
    $product->platformShops()->attach($shop->id);

    return $product;
}

function pmgLink(SalesPlatformShop $shop, Product $product, array $attrs = []): MarketplaceListing
{
    return MarketplaceListing::create([
        'sales_platform_shop_id' => $shop->id, 'platform' => 'shopee', 'item_id' => uniqid(), 'variant_id' => '', 'is_active' => true,
        'product_id' => $product->id, 'match_method' => 'manual', ...$attrs,
    ]);
}

beforeEach(function () {
    Queue::fake();
    $this->actingAs(User::factory()->create());
});

test('knownShopIds counts direct listing links (incl. variants), cached item ids and completed pushes — not ignored rows', function () {
    $gate = new MarketplaceSyncGate;
    [$linked, $viaVariant, $cached, $pushed, $ignored, $none] = [pmgShop(), pmgShop(), pmgShop(), pmgShop(), pmgShop(), pmgShop()];
    $product = Product::create(['sku' => 'PMG-GATE', 'type' => 'simple']);
    $variant = Product::create(['sku' => 'PMG-GATE-V', 'type' => 'simple', 'parent_id' => $product->id]);

    pmgLink($linked, $product);
    pmgLink($viaVariant, $variant, ['match_method' => 'auto_sku']);
    pmgLink($ignored, $product, ['ignored_at' => now()]);
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $cached->id, 'platform_item_id' => '999']);
    ProductMarketplaceSyncJob::create(['product_id' => $product->id, 'sales_platform_shop_id' => $pushed->id, 'platform' => 'shopee', 'action' => 'push', 'status' => 'completed']);

    expect($gate->knownShopIds($product, [$linked, $viaVariant, $cached, $pushed, $ignored, $none]))
        ->toBe(collect([$linked->id, $viaVariant->id, $cached->id, $pushed->id])->sort()->values()->all())
        ->and($gate->knownOnShop($product, $none))->toBeFalse();
});

test('single push of an unmatched product returns 409 not_matched until confirmed', function () {
    $shop = pmgShop();
    $product = pmgReadyProduct($shop, 'PMG-SINGLE');

    $response = app(ProductController::class)->pushToShopee($product, $shop);
    expect($response->getStatusCode())->toBe(409)
        ->and($response->getData(true)['code'])->toBe('not_matched')
        ->and(ProductMarketplaceSyncJob::count())->toBe(0);

    request()->merge(['confirm_new_listing' => true]);
    expect(app(ProductController::class)->pushToShopee($product, $shop)->getStatusCode())->toBe(202)
        ->and(ProductMarketplaceSyncJob::count())->toBe(1);
});

test('single push of a matched product goes straight through', function () {
    $shop = pmgShop();
    $product = pmgReadyProduct($shop, 'PMG-SINGLE-M');
    pmgLink($shop, $product);

    expect(app(ProductController::class)->pushToShopee($product, $shop)->getStatusCode())->toBe(202);
});

test('auto-sync never pushes an unmatched product', function () {
    $shop = pmgShop();
    $product = pmgReadyProduct($shop, 'PMG-AUTO');
    $key = "marketplace_autosync:action:{$product->id}:{$shop->id}";

    Cache::put($key, 'push', 60);
    $dispatcher = Mockery::mock(MarketplaceSyncDispatcher::class);
    $dispatcher->shouldNotReceive('queue');
    (new AutoSyncProductToMarketplaceJob($product->id, $shop->id))->handle(new MarketplaceSyncGate, $dispatcher);

    pmgLink($shop, $product);
    Cache::put($key, 'push', 60);
    $dispatcher = Mockery::mock(MarketplaceSyncDispatcher::class);
    $dispatcher->shouldReceive('queue')->once();
    (new AutoSyncProductToMarketplaceJob($product->id, $shop->id))->handle(new MarketplaceSyncGate, $dispatcher);
});

test('saving no longer auto-pushes — only switching publishing off still auto-deactivates', function () {
    config(['services.marketplace_sync.auto_enabled' => true]);
    $shop = pmgShop();
    $product = pmgReadyProduct($shop, 'PMG-NO-AUTOPUSH');
    $listener = new QueueAutoMarketplaceSync;

    $listener->handle(new ProductDataChanged($product->id, true));
    Queue::assertNotPushed(AutoSyncProductToMarketplaceJob::class);
    expect(Cache::get("marketplace_autosync:action:{$product->id}:{$shop->id}"))->toBeNull();

    $product->update(['enabled' => false]);
    $listener->handle(new ProductDataChanged($product->id, false));
    Queue::assertPushed(AutoSyncProductToMarketplaceJob::class, 1);
    expect(Cache::get("marketplace_autosync:action:{$product->id}:{$shop->id}"))->toBe('deactivate');

    // switching it back on within the debounce cancels the pending takedown
    $product->update(['enabled' => true]);
    $listener->handle(new ProductDataChanged($product->id, true));
    expect(Cache::get("marketplace_autosync:action:{$product->id}:{$shop->id}"))->toBeNull();
});

test('publish enables the product and saves the ticked shops without pushing', function () {
    $shop = pmgShop();
    $product = Product::create(['sku' => 'PMG-PUBLISH', 'type' => 'simple', 'enabled' => false, 'status' => Product::STATUS_ACTIVE]);
    $request = Request::create("/catalog/products/{$product->id}/publish", 'POST', ['published_shop_ids' => [$shop->id], 'updated_at' => $product->updated_at?->toIso8601String()]);
    $request->setUserResolver(fn () => auth()->user());

    app(ProductController::class)->publish($request, $product);

    expect($product->fresh()->enabled)->toBeTrue()
        ->and($product->platformShops()->pluck('sales_platform_shops.id')->all())->toBe([$shop->id])
        ->and(ProductMarketplaceSyncJob::count())->toBe(0);
    Queue::assertNothingPushed();
});

test('the Push step status lists the platform shops with publish / live / matching / last job', function () {
    $shop = pmgShop();
    $product = pmgReadyProduct($shop, 'PMG-STATUS');
    pmgLink($shop, $product);
    DB::table('product_platform_shops')->where('product_id', $product->id)->update(['status' => 'live', 'platform_item_id' => '42']);
    ProductMarketplaceSyncJob::create(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform' => 'shopee', 'action' => 'push', 'status' => 'completed', 'message' => 'ok']);

    $request = Request::create("/catalog/marketplace/products/{$product->id}/push/shopee");
    $request->setUserResolver(fn () => auth()->user());
    $body = app(PlatformPushController::class)->status($request, $product, 'shopee')->getData(true);

    $row = collect($body['shops'])->firstWhere('id', $shop->id);
    expect($row)->toMatchArray(['published' => true, 'is_live' => true, 'platform_item_id' => '42', 'known' => true])
        ->and($row['last_job'])->toMatchArray(['action' => 'push', 'status' => 'completed'])
        ->and($body['product'])->toMatchArray(['enabled' => true])
        ->and($body['history'])->toHaveCount(1);
});
