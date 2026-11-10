<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Jobs\AutoSyncProductToMarketplaceJob;
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

test('bulk push skips unmatched product×shop pairs unless confirmed', function () {
    $shop = pmgShop();
    $matched = Product::create(['sku' => 'PMG-BULK-M', 'type' => 'simple', 'enabled' => true]);
    $unmatched = Product::create(['sku' => 'PMG-BULK-U', 'type' => 'simple', 'enabled' => true]);
    pmgLink($shop, $matched);

    $bulk = function (array $extra = []) use ($shop, $matched, $unmatched) {
        $request = Request::create('/catalog/products/push-bulk', 'POST', ['product_ids' => [$matched->id, $unmatched->id], 'shop_ids' => [$shop->id], ...$extra]);
        $request->setUserResolver(fn () => auth()->user());

        return app(ProductController::class)->pushBulk($request);
    };

    $bulk();
    expect(ProductMarketplaceSyncJob::pluck('product_id')->all())->toBe([$matched->id])
        ->and($unmatched->platformShops()->count())->toBe(0)
        ->and(session('warning'))->toContain('ยังไม่ได้จับคู่');

    ProductMarketplaceSyncJob::query()->delete();
    $bulk(['confirm_new_listing' => true]);
    expect(ProductMarketplaceSyncJob::pluck('product_id')->sort()->values()->all())
        ->toBe(collect([$matched->id, $unmatched->id])->sort()->values()->all());
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
