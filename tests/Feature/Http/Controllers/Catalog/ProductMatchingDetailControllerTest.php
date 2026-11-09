<?php

use App\Http\Controllers\Catalog\ProductMatchingDetailController;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingComponent;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\Role;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailFetcher;
use App\Services\Marketplace\Listings\Details\ShopeeListingDetailFetcher;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * "รายละเอียด" endpoints of the Product Matching page — JSON shape, on-demand
 * fetch vs stored row, refresh, PIM summary, shop access (403) and the route
 * permissions. Controller called directly (same style as
 * ProductMatchingActionsControllerTest); a fake Shopee detail fetcher is
 * bound in the container — no HTTP.
 */
function pmdShop(): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['name' => 'Shopee'], ['code' => 'shopee_'.uniqid()]);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'PMD '.uniqid()]);
}

function pmdListing(SalesPlatformShop $shop, array $attrs = []): MarketplaceListing
{
    return MarketplaceListing::create(array_merge([
        'sales_platform_shop_id' => $shop->id,
        'platform' => 'shopee',
        'item_id' => '27763421033',
        'variant_id' => '226855724334',
        'seller_sku' => '40278',
        'is_active' => true,
    ], $attrs));
}

function pmdCall(User $user, string $action, MarketplaceListing $listing)
{
    test()->actingAs($user);
    $request = Request::create('/catalog/marketplace/product-matching/listings/'.$listing->id.'/detail', $action === 'show' ? 'GET' : 'POST');
    $request->setUserResolver(fn () => $user);

    return app(ProductMatchingDetailController::class)->{$action}($request, $listing);
}

beforeEach(function () {
    // a fake fetcher returning the real captured Shopee fixture, parsed by the real parser
    $this->fake = new class implements MarketplaceListingDetailFetcher
    {
        public int $calls = 0;

        public function fetch(SalesPlatformShop $shop, string $itemId): array
        {
            $this->calls++;
            $fx = fn ($n) => json_decode(file_get_contents(base_path("tests/Fixtures/MarketplaceListingDetails/{$n}.json")), true);

            return $this->parse([ShopeeListingDetailFetcher::BASE_INFO => $fx('shopee_base_multi'), ShopeeListingDetailFetcher::MODEL_LIST => $fx('shopee_models')], ['shopee_shop_id' => 57198184]);
        }

        public function parse(array $raw, array $context = []): array
        {
            return (new ShopeeListingDetailFetcher)->parse($raw, $context);
        }
    };
    app()->instance(ShopeeListingDetailFetcher::class, $this->fake);
    $this->user = User::factory()->create();
    $this->shop = pmdShop();
});

test('show fetches on demand once, returns the normalised detail without raw, then serves the stored row', function () {
    $listing = pmdListing($this->shop);

    $json = pmdCall($this->user, 'show', $listing)->getData(true);

    expect($this->fake->calls)->toBe(1)
        ->and(array_keys($json))->toBe(['listing', 'detail', 'pim'])
        ->and($json['listing'])->toMatchArray(['id' => $listing->id, 'item_id' => '27763421033', 'variant_id' => '226855724334', 'platform' => 'shopee', 'platform_label' => 'Shopee'])
        ->and($json['listing']['shop'])->toBe(['id' => $this->shop->id, 'name' => $this->shop->name])
        ->and($json['detail'])->not->toHaveKey('raw')
        ->and($json['detail'])->not->toHaveKey('description')
        ->and($json['detail'])->toMatchArray(['has_data' => true, 'is_stale' => false, 'status' => 'NORMAL', 'brand_name' => 'Pumpkin(พัมคินส์)', 'fetch_error' => null])
        ->and($json['detail']['listing_url'])->toBe('https://shopee.co.th/product/57198184/27763421033')
        ->and($json['detail']['images'])->toHaveCount(7)
        ->and($json['detail']['variants'])->toHaveCount(3)
        ->and($json['detail']['variants'][0]['options'])->toBe(['ขนาด' => '21mm'])
        ->and($json['detail']['package']['weight_kg'])->toEqual(0.5)
        ->and($json['detail']['fetched_at'])->toBeString()
        ->and($json['pim'])->toBeNull();

    pmdCall($this->user, 'show', $listing);
    expect($this->fake->calls)->toBe(1)
        ->and(MarketplaceListingDetail::where('sales_platform_shop_id', $this->shop->id)->where('item_id', '27763421033')->count())->toBe(1);

    // another variant of the same item shares the stored detail
    pmdCall($this->user, 'show', pmdListing($this->shop, ['variant_id' => '226855724338', 'seller_sku' => '40282']));
    expect($this->fake->calls)->toBe(1);
});

test('refresh always re-fetches', function () {
    $listing = pmdListing($this->shop);
    pmdCall($this->user, 'show', $listing);
    $this->travel(1)->minutes();
    pmdCall($this->user, 'refresh', $listing);

    expect($this->fake->calls)->toBe(2);
});

test('a single link returns a PIM summary; a bundle lists its components', function () {
    $p = Product::create(['sku' => '40278']);
    DB::table('product_match_index')->insert(['product_id' => $p->id, 'sku' => '40278', 'brand_label' => 'PUMPKIN', 'price' => 79, 'updated_at' => now()]);
    $listing = pmdListing($this->shop, ['product_id' => $p->id, 'pack_quantity' => 2, 'match_method' => 'manual']);

    $pim = pmdCall($this->user, 'show', $listing)->getData(true)['pim'];
    expect($pim['type'])->toBe('single')
        ->and($pim['pack_quantity'])->toBe(2)
        ->and($pim['products'])->toHaveCount(1)
        ->and($pim['products'][0])->toMatchArray(['id' => $p->id, 'sku' => '40278', 'price' => 79, 'brand' => 'PUMPKIN', 'quantity' => 1, 'image_url' => null]);

    $a = Product::create(['sku' => 'PMD-A']);
    $b = Product::create(['sku' => 'PMD-B']);
    $bundle = pmdListing($this->shop, ['variant_id' => 'x2', 'match_method' => 'bundle']);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $bundle->id, 'product_id' => $a->id, 'quantity' => 1]);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $bundle->id, 'product_id' => $b->id, 'quantity' => 3]);

    $pim = pmdCall($this->user, 'show', $bundle)->getData(true)['pim'];
    expect($pim['type'])->toBe('bundle')
        ->and(collect($pim['products'])->pluck('quantity', 'sku')->all())->toBe(['PMD-A' => 1, 'PMD-B' => 3]);
});

test('a failed fetch is returned as 200 with fetch_error and no data', function () {
    app()->instance(ShopeeListingDetailFetcher::class, new class implements MarketplaceListingDetailFetcher
    {
        public function fetch(SalesPlatformShop $shop, string $itemId): array
        {
            throw new RuntimeException('Shopee API error [error_auth]: Invalid access_token.');
        }

        public function parse(array $raw, array $context = []): array
        {
            return [];
        }
    });

    $response = pmdCall($this->user, 'show', pmdListing($this->shop));
    $json = $response->getData(true);

    expect($response->getStatusCode())->toBe(200)
        ->and($json['detail']['has_data'])->toBeFalse()
        ->and($json['detail']['fetch_error'])->toContain('Invalid access_token')
        ->and($json['detail']['variants'])->toBe([]);
});

test('both endpoints are 403 for a shop the user cannot access, and never call the marketplace', function () {
    $allowed = pmdShop();
    $user = User::factory()->create();
    $role = Role::create(['label' => 'PMD restricted '.uniqid()]);
    $user->roles()->attach($role->id);
    DB::table('role_sales_platform_restrictions')->insert(['role_id' => $role->id, 'sales_platform_id' => $allowed->sales_platform_id, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('role_sales_platform_shop')->insert(['role_id' => $role->id, 'sales_platform_shop_id' => $allowed->id, 'created_at' => now(), 'updated_at' => now()]);

    $listing = pmdListing($this->shop);
    expect(fn () => pmdCall($user, 'show', $listing))->toThrow(HttpException::class);
    expect(fn () => pmdCall($user, 'refresh', $listing))->toThrow(HttpException::class);
    expect($this->fake->calls)->toBe(0);

    // the same user on the allowed shop works
    expect(pmdCall($user, 'show', pmdListing($allowed))->getStatusCode())->toBe(200);
});

test('over HTTP a user without the products permissions gets a JSON 403', function () {
    $user = User::factory()->create()->fresh();
    $listing = pmdListing($this->shop);
    $this->actingAs($user)->withSession(['permissions_version' => $user->permissions_version]);

    $this->getJson("/catalog/marketplace/product-matching/listings/{$listing->id}/detail")->assertForbidden()->assertJsonStructure(['message']);
    $this->postJson("/catalog/marketplace/product-matching/listings/{$listing->id}/detail/refresh")->assertForbidden();
    expect($this->fake->calls)->toBe(0);
});

test('routes carry the products permissions', function () {
    $show = Route::getRoutes()->getByName('catalog.marketplace.productMatching.detail');
    $refresh = Route::getRoutes()->getByName('catalog.marketplace.productMatching.detail.refresh');

    expect($show->methods())->toContain('GET')
        ->and($show->gatherMiddleware())->toContain('permission:products,list_products')
        ->and($refresh->methods())->toBe(['POST'])
        ->and($refresh->gatherMiddleware())->toContain('permission:products,edit_products');
});
