<?php

use App\Http\Controllers\Catalog\ProductMatchingController;
use App\Jobs\SyncMarketplaceListingsJob;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Queue;

/**
 * Product Matching page (phase 1, read-only) — tab counts/rows per shop and
 * the queued sync action. Controller is called directly (same style as
 * ProductQuickExportTest); route-level permission middleware is covered by
 * the existing permission tests.
 */
function pmcShop(string $platformName = 'Shopee'): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['name' => $platformName], ['code' => strtolower($platformName).'_'.uniqid()]);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'PMC '.uniqid()]);
}

function pmcListing(SalesPlatformShop $shop, array $attrs): MarketplaceListing
{
    return MarketplaceListing::create(array_merge([
        'sales_platform_shop_id' => $shop->id,
        'platform' => 'shopee',
        'variant_id' => '',
        'is_active' => true,
    ], $attrs));
}

function pmcProps(User $user, array $query): array
{
    $request = Request::create('/catalog/marketplace/product-matching', 'GET', $query);
    $request->setUserResolver(fn () => $user);
    $response = app(ProductMatchingController::class)->index($request);

    return (fn () => $this->props)->call($response);
}

test('index returns per-tab counts and rows for the selected shop', function () {
    $user = User::factory()->create();
    $shop = pmcShop();
    $a = Product::create(['sku' => 'PMC-A']);
    $b = Product::create(['sku' => 'PMC-B']);
    Product::create(['sku' => 'PMC-C']);

    pmcListing($shop, ['item_id' => '1', 'seller_sku' => 'PMC-A', 'product_id' => $a->id, 'match_method' => 'auto_sku']);
    // manual match whose seller SKU differs from the product SKU → sku_drift
    pmcListing($shop, ['item_id' => '2', 'seller_sku' => 'PMC-B_5', 'product_id' => $b->id, 'match_method' => 'manual']);
    pmcListing($shop, ['item_id' => '3', 'seller_sku' => 'NOPE']);
    pmcListing($shop, ['item_id' => '4', 'seller_sku' => 'NOPE-INACTIVE', 'is_active' => false]);

    $props = pmcProps($user, ['shop_id' => $shop->id, 'tab' => 'matched']);
    expect($props['filters']['shop_id'])->toBe($shop->id)
        ->and($props['summary']['matched'])->toBe(2)
        ->and($props['summary']['unmatched'])->toBe(1) // inactive hidden by default
        ->and($props['summary']['not_listed'])->toBe(Product::count() - 2);

    $rows = collect($props['rows']->items())->keyBy('item_id');
    expect($rows['1']['sku_drift'])->toBeFalse()
        ->and($rows['2']['sku_drift'])->toBeTrue()
        ->and($rows['2']['product']['sku'])->toBe('PMC-B');

    $props = pmcProps($user, ['shop_id' => $shop->id, 'tab' => 'unmatched', 'active_only' => '0']);
    expect($props['rows']->total())->toBe(2);

    $props = pmcProps($user, ['shop_id' => $shop->id, 'tab' => 'not_listed', 'search' => 'PMC-']);
    expect(collect($props['rows']->items())->pluck('sku')->all())->toBe(['PMC-C']);
});

test('sync queues one job for the requested shop', function () {
    Queue::fake();
    $user = User::factory()->create();
    $shop = pmcShop();

    $request = Request::create('/catalog/marketplace/product-matching/sync', 'POST', ['shop_id' => $shop->id]);
    $request->setUserResolver(fn () => $user);
    $this->actingAs($user);
    $response = app(ProductMatchingController::class)->sync($request);

    expect($response->getStatusCode())->toBe(302);
    Queue::assertPushed(SyncMarketplaceListingsJob::class, 1);
    Queue::assertPushed(SyncMarketplaceListingsJob::class, fn ($job) => $job->shopId === $shop->id);
});

test('matched rows carry the parent product and the cached listing category for the Product Mapping link', function () {
    $user = User::factory()->create();
    $shop = pmcShop();
    $parent = Product::create(['sku' => 'PMC-PARENT']);
    $variant = Product::create(['sku' => 'PMC-VARIANT', 'parent_id' => $parent->id]);
    $plain = Product::create(['sku' => 'PMC-PLAIN']);

    pmcListing($shop, ['item_id' => '10', 'seller_sku' => 'PMC-VARIANT', 'product_id' => $variant->id, 'match_method' => 'manual']);
    pmcListing($shop, ['item_id' => '11', 'seller_sku' => 'PMC-PLAIN', 'product_id' => $plain->id, 'match_method' => 'manual']);
    MarketplaceListingDetail::create(['sales_platform_shop_id' => $shop->id, 'platform' => 'shopee', 'item_id' => '10', 'category_id' => '100123']);

    $rows = collect(pmcProps($user, ['shop_id' => $shop->id, 'tab' => 'matched'])['rows']->items())->keyBy('item_id');

    expect($rows['10']['product']['mapping_product'])->toBe(['id' => $parent->id, 'sku' => 'PMC-PARENT'])
        ->and($rows['10']['listing_category_id'])->toBe(100123)
        ->and($rows['11']['product']['mapping_product'])->toBe(['id' => $plain->id, 'sku' => 'PMC-PLAIN'])
        ->and($rows['11']['listing_category_id'])->toBeNull();
});

test('?ids= (picked on Marketplace Product Master) shows only those listings, opening their shop and tab', function () {
    $user = User::factory()->create();
    $shopA = pmcShop();
    $shopB = pmcShop();
    $p = Product::create(['sku' => 'PMC-IDS']);
    $picked = pmcListing($shopA, ['item_id' => '1', 'seller_sku' => 'A1', 'is_active' => false]);
    pmcListing($shopA, ['item_id' => '2', 'seller_sku' => 'A2']);
    $pickedB = pmcListing($shopB, ['item_id' => '3', 'seller_sku' => 'B1', 'product_id' => $p->id, 'match_method' => 'manual']);

    $props = pmcProps($user, ['ids' => "{$picked->id},{$pickedB->id}"]);
    expect($props['filters']['shop_id'])->toBeIn([$shopA->id, $shopB->id])
        ->and($props['filters']['ids'])->toEqualCanonicalizing([$picked->id, $pickedB->id])
        ->and($props['selection'])->toEqual([$shopA->id => 1, $shopB->id => 1]);

    // shop A: the picked (inactive, unmatched) listing only — tab defaults to unmatched, inactive not hidden
    $props = pmcProps($user, ['ids' => "{$picked->id},{$pickedB->id}", 'shop_id' => $shopA->id]);
    expect($props['filters']['tab'])->toBe('unmatched')
        ->and($props['filters']['active_only'])->toBeFalse()
        ->and(collect($props['rows']->items())->pluck('item_id')->all())->toBe(['1'])
        ->and($props['summary']['unmatched'])->toBe(1);

    // shop B: the matched one → matched tab
    $props = pmcProps($user, ['ids' => (string) $pickedB->id]);
    expect($props['filters']['tab'])->toBe('matched')
        ->and(collect($props['rows']->items())->pluck('item_id')->all())->toBe(['3']);
});
