<?php

use App\Http\Controllers\Catalog\ListingImportController;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * "1. Category Mapping" prefill — the platform category of the listing a product is matched to
 * (ListingImportController::listingCategory), cached detail first.
 */
function lcpShop(string $code, string $name): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['code' => $code], ['name' => ucfirst($code)]);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'lcp_'.uniqid(), 'name' => $name]);
}

function lcpListing(SalesPlatformShop $shop, Product $product, string $itemId): MarketplaceListing
{
    return MarketplaceListing::create([
        'sales_platform_shop_id' => $shop->id, 'platform' => $shop->platform->code, 'item_id' => $itemId, 'variant_id' => '',
        'is_active' => true, 'product_id' => $product->id, 'match_method' => 'manual',
    ]);
}

function lcpCall(User $user, Product $product, string $platform): array
{
    $request = Request::create("/catalog/marketplace/products/{$product->id}/listing-category/{$platform}", 'GET');
    $request->setUserResolver(fn () => $user);

    return app(ListingImportController::class)->listingCategory($request, $product, $platform)->getData(true);
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->shop = lcpShop('shopee', 'LCP Shopee');
    $this->shop->load('platform');
    $this->product = Product::create(['sku' => 'LCP-1', 'type' => 'simple', 'enabled' => true]);
});

test('returns the cached platform category of the matched listing', function () {
    lcpListing($this->shop, $this->product, '501');
    MarketplaceListingDetail::create([
        'sales_platform_shop_id' => $this->shop->id, 'platform' => 'shopee', 'item_id' => '501',
        'category_id' => '100123', 'category_name' => 'Power Tools', 'fetched_at' => now(),
    ]);

    expect(lcpCall($this->user, $this->product, 'shopee'))->toBe([
        'category_id' => 100123, 'category_name' => 'Power Tools', 'shop' => 'LCP Shopee', 'source' => 'cache',
    ]);
});

test('uses a variant\'s matched listing too', function () {
    $variant = Product::create(['sku' => 'LCP-1-V', 'type' => 'simple', 'enabled' => true, 'parent_id' => $this->product->id]);
    lcpListing($this->shop, $variant, '502');
    MarketplaceListingDetail::create([
        'sales_platform_shop_id' => $this->shop->id, 'platform' => 'shopee', 'item_id' => '502', 'category_id' => '777', 'fetched_at' => now(),
    ]);

    expect(lcpCall($this->user, $this->product, 'shopee')['category_id'])->toBe(777);
});

test('ignores listings on another platform', function () {
    $lazada = lcpShop('lazada', 'LCP Lazada');
    $lazada->load('platform');
    lcpListing($lazada, $this->product, '601');
    MarketplaceListingDetail::create([
        'sales_platform_shop_id' => $lazada->id, 'platform' => 'lazada', 'item_id' => '601', 'category_id' => '999', 'fetched_at' => now(),
    ]);

    expect(lcpCall($this->user, $this->product, 'shopee')['category_id'])->toBeNull();
});

test('returns no category (without failing) when nothing is cached and the platform fetch fails', function () {
    lcpListing($this->shop, $this->product, '503'); // shop has no Shopee account → fetch records an error, no category

    expect(lcpCall($this->user, $this->product, 'shopee'))->toMatchArray(['category_id' => null, 'source' => null]);
});

test('returns no category for an unmatched product', function () {
    expect(lcpCall($this->user, $this->product, 'shopee')['category_id'])->toBeNull();
});
