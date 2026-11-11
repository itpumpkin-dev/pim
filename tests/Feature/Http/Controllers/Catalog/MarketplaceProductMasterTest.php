<?php

use App\Http\Controllers\Catalog\MarketplaceProductMasterController;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * "Marketplace Product Master" — listings of one platform's shops + cached
 * detail + matched PIM product, with shop / search / status / matching filters.
 */
function pmmShop(string $code, string $name): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['code' => $code], ['name' => ucfirst($code)]);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'pmm_'.uniqid(), 'name' => $name]);
}

function pmmListing(SalesPlatformShop $shop, array $attrs): MarketplaceListing
{
    return MarketplaceListing::create(array_merge([
        'sales_platform_shop_id' => $shop->id,
        'platform' => $shop->platform->code,
        'item_id' => uniqid(),
        'variant_id' => '',
        'is_active' => true,
    ], $attrs));
}

function pmmProps(User $user, ?string $platform, array $query = []): array
{
    $request = Request::create('/catalog/marketplace/product-master', 'GET', $platform ? ['platform' => $platform, ...$query] : $query);
    $request->setUserResolver(fn () => $user);
    $response = app(MarketplaceProductMasterController::class)->index($request);

    return (fn () => $this->props)->call($response);
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->shopA = pmmShop('woocommerce', 'PMM Shop A');
    $this->shopA->load('platform');
    $this->product = Product::create(['sku' => 'PMM-1']);

    $this->matched = pmmListing($this->shopA, ['item_id' => '100', 'seller_sku' => 'PMM-1', 'name' => 'Alpha', 'product_id' => $this->product->id, 'match_method' => 'manual', 'price' => 199]);
    pmmListing($this->shopA, ['item_id' => '101', 'seller_sku' => 'X-2', 'name' => 'Beta', 'is_active' => false]);
    pmmListing($this->shopA, ['item_id' => '102', 'seller_sku' => 'X-3', 'name' => 'Gamma', 'ignored_at' => now()]);
    MarketplaceListingDetail::create(['sales_platform_shop_id' => $this->shopA->id, 'platform' => 'woocommerce', 'item_id' => '100', 'brand_name' => 'PUMPKIN', 'category_name' => 'Tools', 'fetched_at' => now()]);

    $lazada = pmmShop('lazada', 'PMM Lazada');
    $lazada->load('platform');
    pmmListing($lazada, ['item_id' => '900', 'name' => 'Other platform']);
});

test('lists the platform\'s listings (not ignored) with detail and matched PIM product', function () {
    $props = pmmProps($this->user, 'woocommerce');
    $rows = collect($props['rows']->items())->keyBy('item_id');

    expect($props['stats'])->toMatchArray(['total' => 2, 'active' => 1, 'matched' => 1])
        ->and($rows->pluck('item_id')->values()->all())->toBe(['100', '101'])
        ->and($rows['100']['detail'])->toMatchArray(['brand' => 'PUMPKIN', 'category' => 'Tools'])
        ->and($rows['100']['pim']['products'][0]['sku'])->toBe('PMM-1')
        ->and($rows['101']['detail'])->toBeNull()
        ->and($rows['101']['pim'])->toBeNull();
});

test('filters by matching, status, search and shop', function () {
    $items = fn (array $q) => collect(pmmProps($this->user, 'woocommerce', $q)['rows']->items())->pluck('item_id')->all();

    expect($items(['matching' => 'matched']))->toBe(['100'])
        ->and($items(['matching' => 'unmatched']))->toBe(['101'])
        ->and($items(['status' => 'inactive']))->toBe(['101'])
        ->and($items(['search' => 'PMM-1']))->toBe(['100'])
        ->and($items(['shop_id' => $this->shopA->id]))->toBe(['100', '101']);

    // a shop of another platform is ignored → all shops of this platform
    $other = SalesPlatformShop::where('name', 'PMM Lazada')->value('id');
    expect(pmmProps($this->user, 'woocommerce', ['shop_id' => $other])['filters']['shop_id'])->toBeNull();
});

test('all platforms by default, each row carrying its platform; an unknown platform is ignored', function () {
    $props = pmmProps($this->user, null);
    $platforms = collect($props['rows']->items())->pluck('platform', 'item_id')->all();

    expect($props['stats']['total'])->toBe(3)
        ->and($platforms)->toEqualCanonicalizing(['100' => 'woocommerce', '101' => 'woocommerce', '900' => 'lazada'])
        ->and(collect($props['platforms'])->pluck('value')->sort()->values()->all())->toBe(['lazada', 'woocommerce'])
        ->and(pmmProps($this->user, 'amazon')['filters']['platform'])->toBeNull();
});

test('rows carry the PIM parent ids the Product Mapping ?ids= link needs', function () {
    $parent = Product::create(['sku' => 'PMM-PARENT']);
    $variant = Product::create(['sku' => 'PMM-VAR', 'parent_id' => $parent->id]);
    pmmListing($this->shopA, ['item_id' => '200', 'name' => 'Zeta', 'product_id' => $variant->id, 'match_method' => 'manual']);

    $rows = collect(pmmProps($this->user, 'woocommerce')['rows']->items())->keyBy(fn ($r) => 'i'.$r['item_id']);
    expect($rows['i200']['mapping_ids'])->toBe([$parent->id])
        ->and($rows['i100']['mapping_ids'])->toBe([$this->product->id])
        ->and($rows['i101']['mapping_ids'])->toBe([]);
});
