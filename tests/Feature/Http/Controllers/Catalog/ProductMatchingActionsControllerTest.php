<?php

use App\Http\Controllers\Catalog\ProductMatchingActionsController;
use App\Http\Controllers\Catalog\ProductMatchingController;
use App\Models\AuditLog;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingComponent;
use App\Models\Product;
use App\Models\Role;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\Listings\MarketplaceListingSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Product Matching phase 2 — link / bundle / accept / bulk accept / unlink /
 * ignore actions. Controller called directly (same style as
 * ProductMatchingControllerTest); route permission middleware is covered by
 * the existing permission tests.
 */
function pmaShop(): SalesPlatformShop
{
    $platform = SalesPlatform::firstOrCreate(['name' => 'Shopee'], ['code' => 'shopee_'.uniqid()]);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'PMA '.uniqid()]);
}

function pmaListing(SalesPlatformShop $shop, array $attrs): MarketplaceListing
{
    return MarketplaceListing::create(array_merge([
        'sales_platform_shop_id' => $shop->id,
        'platform' => 'shopee',
        'item_id' => (string) random_int(1, 999999999),
        'variant_id' => '',
        'is_active' => true,
    ], $attrs));
}

function pmaCall(User $user, string $action, array $data = [], ?MarketplaceListing $listing = null)
{
    test()->actingAs($user);
    $request = Request::create('/catalog/marketplace/product-matching/x', 'POST', $data);
    $request->setUserResolver(fn () => $user);
    $request->setLaravelSession(app('session.store'));
    $controller = app(ProductMatchingActionsController::class);

    return $listing ? $controller->{$action}($request, $listing) : $controller->{$action}($request);
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->shop = pmaShop();
});

test('link sets a manual single link with pack quantity, clears components and ignore, and is audited', function () {
    $p = Product::create(['sku' => 'PMA-1']);
    $other = Product::create(['sku' => 'PMA-OTHER']);
    $l = pmaListing($this->shop, ['seller_sku' => 'PMA-1_6', 'ignored_at' => now(), 'ignore_reason' => 'x']);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $l->id, 'product_id' => $other->id, 'quantity' => 1]);

    $response = pmaCall($this->user, 'link', ['product_id' => $p->id, 'pack_quantity' => 6], $l);

    expect($response->getStatusCode())->toBe(302);
    $l->refresh();
    expect($l->product_id)->toBe($p->id)
        ->and($l->pack_quantity)->toBe(6)
        ->and($l->match_method)->toBe('manual')
        ->and($l->matched_by)->toBe($this->user->id)
        ->and($l->matched_at)->not->toBeNull()
        ->and($l->ignored_at)->toBeNull()
        ->and($l->components()->count())->toBe(0);
    expect(AuditLog::where('event', 'marketplace_listing_linked')->where('auditable_id', $l->id)->exists())->toBeTrue();
});

test('bundle stores components, nulls product_id and needs at least 2 products', function () {
    $a = Product::create(['sku' => 'PMA-A']);
    $b = Product::create(['sku' => 'PMA-B']);
    $l = pmaListing($this->shop, ['seller_sku' => 'PMA-A+PMA-B', 'product_id' => $a->id, 'pack_quantity' => 3, 'match_method' => 'manual']);

    pmaCall($this->user, 'bundle', ['components' => [['product_id' => $a->id, 'quantity' => 1], ['product_id' => $b->id, 'quantity' => 2]]], $l);

    $l->refresh();
    expect($l->product_id)->toBeNull()
        ->and($l->pack_quantity)->toBeNull()
        ->and($l->match_method)->toBe('bundle')
        ->and($l->isLinked())->toBeTrue()
        ->and($l->components()->orderBy('product_id')->pluck('quantity', 'product_id')->all())->toBe([$a->id => 1, $b->id => 2]);

    expect(fn () => pmaCall($this->user, 'bundle', ['components' => [['product_id' => $a->id, 'quantity' => 1]]], $l))
        ->toThrow(ValidationException::class);
});

test('accept applies the recomputed suggestion with match_method suggested (pack and bundle)', function () {
    $base = Product::create(['sku' => 'PMA-P']);
    $a = Product::create(['sku' => 'PMA-X']);
    $b = Product::create(['sku' => 'PMA-Y']);
    $pack = pmaListing($this->shop, ['seller_sku' => 'PMA-P_5']);
    $bundle = pmaListing($this->shop, ['seller_sku' => 'PMA-X+PMA-Y']);

    pmaCall($this->user, 'accept', ['index' => 0, 'type' => 'pack'], $pack);
    pmaCall($this->user, 'accept', ['index' => 0, 'type' => 'bundle'], $bundle);

    $pack->refresh();
    expect($pack->product_id)->toBe($base->id)->and($pack->pack_quantity)->toBe(5)->and($pack->match_method)->toBe('suggested');
    $bundle->refresh();
    expect($bundle->product_id)->toBeNull()->and($bundle->match_method)->toBe('suggested')
        ->and($bundle->components()->pluck('product_id')->sort()->values()->all())->toBe([$a->id, $b->id]);
});

test('accept refuses a stale suggestion type and leaves the listing untouched', function () {
    Product::create(['sku' => 'PMA-S']);
    $l = pmaListing($this->shop, ['seller_sku' => 'PMA-S_2']);

    pmaCall($this->user, 'accept', ['index' => 0, 'type' => 'bundle'], $l);

    expect($l->fresh()->product_id)->toBeNull();
    expect(session('error'))->toContain('เปลี่ยนไปแล้ว');
});

test('unlink clears product, pack, components and match_method; the next auto-match may relink by exact SKU', function () {
    $p = Product::create(['sku' => 'PMA-U']);
    $l = pmaListing($this->shop, ['seller_sku' => 'PMA-U', 'product_id' => $p->id, 'pack_quantity' => 2, 'match_method' => 'manual']);

    pmaCall($this->user, 'unlink', [], $l);

    $l->refresh();
    expect($l->product_id)->toBeNull()->and($l->pack_quantity)->toBeNull()->and($l->match_method)->toBeNull();
    expect(AuditLog::where('event', 'marketplace_listing_unlinked')->where('auditable_id', $l->id)->exists())->toBeTrue();

    app(MarketplaceListingSyncService::class)->autoMatch($this->shop->id);
    expect($l->fresh())->product_id->toBe($p->id)->match_method->toBe('auto_sku');
});

test('ignore / unignore with reason; an ignored row is never auto-matched; a linked row cannot be ignored', function () {
    $p = Product::create(['sku' => 'PMA-I']);
    $l = pmaListing($this->shop, ['seller_sku' => 'PMA-I']);

    pmaCall($this->user, 'ignore', ['reason' => 'ของแถม'], $l);
    $l->refresh();
    expect($l->ignored_at)->not->toBeNull()->and($l->ignored_by)->toBe($this->user->id)->and($l->ignore_reason)->toBe('ของแถม');

    app(MarketplaceListingSyncService::class)->autoMatch($this->shop->id);
    expect($l->fresh()->product_id)->toBeNull();

    pmaCall($this->user, 'unignore', [], $l);
    expect($l->fresh()->ignored_at)->toBeNull()->and($l->fresh()->ignore_reason)->toBeNull();

    $linked = pmaListing($this->shop, ['seller_sku' => 'PMA-I', 'product_id' => $p->id, 'match_method' => 'auto_sku']);
    pmaCall($this->user, 'ignore', [], $linked);
    expect($linked->fresh()->ignored_at)->toBeNull();
});

test('bulk accept applies only high-confidence top suggestions', function () {
    $p = Product::create(['sku' => 'PMA-H']);
    Product::create(['sku' => 'PMA-H2']);
    $high = pmaListing($this->shop, ['seller_sku' => 'PMA-H.']);
    $medium = pmaListing($this->shop, ['seller_sku' => 'PMA-H+PMA-H2']);
    $none = pmaListing($this->shop, ['seller_sku' => 'NOPE']);

    pmaCall($this->user, 'bulkAccept', ['listing_ids' => [$high->id, $medium->id, $none->id]]);

    expect($high->fresh())->product_id->toBe($p->id)->match_method->toBe('suggested');
    expect($medium->fresh()->isLinked())->toBeFalse();
    expect($none->fresh()->isLinked())->toBeFalse();
    expect(session('success'))->toContain('1 รายการ');
});

test('every action is 403 for a shop the user cannot access', function () {
    $allowed = pmaShop();
    $user = User::factory()->create();
    $role = Role::create(['label' => 'PMA restricted '.uniqid()]);
    $user->roles()->attach($role->id);
    DB::table('role_sales_platform_restrictions')->insert(['role_id' => $role->id, 'sales_platform_id' => $allowed->sales_platform_id, 'created_at' => now(), 'updated_at' => now()]);
    DB::table('role_sales_platform_shop')->insert(['role_id' => $role->id, 'sales_platform_shop_id' => $allowed->id, 'created_at' => now(), 'updated_at' => now()]);

    $p = Product::create(['sku' => 'PMA-F']);
    $l = pmaListing($this->shop, ['seller_sku' => 'PMA-F.']);

    foreach ([['link', ['product_id' => $p->id]], ['unlink', []], ['ignore', []], ['unignore', []], ['accept', ['type' => 'trimmed']]] as [$action, $data]) {
        expect(fn () => pmaCall($user, $action, $data, $l))->toThrow(HttpException::class);
    }
    expect(fn () => pmaCall($user, 'bulkAccept', ['listing_ids' => [$l->id]]))->toThrow(HttpException::class);
    expect($l->fresh()->isLinked())->toBeFalse();

    // same user on the allowed shop works
    $ok = pmaListing($allowed, ['seller_sku' => 'PMA-F.']);
    pmaCall($user, 'link', ['product_id' => $p->id], $ok);
    expect($ok->fresh()->product_id)->toBe($p->id);
});

test('sync never overrides manual / suggested / bundle / ignored rows', function () {
    $p = Product::create(['sku' => 'PMA-SYNC']);
    $q = Product::create(['sku' => 'PMA-SYNC-2']);
    $manual = pmaListing($this->shop, ['seller_sku' => 'PMA-SYNC', 'product_id' => $q->id, 'match_method' => 'manual']);
    $suggested = pmaListing($this->shop, ['seller_sku' => 'PMA-SYNC', 'product_id' => $q->id, 'pack_quantity' => 2, 'match_method' => 'suggested']);
    $bundle = pmaListing($this->shop, ['seller_sku' => 'PMA-SYNC', 'match_method' => 'bundle']);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $bundle->id, 'product_id' => $p->id, 'quantity' => 1]);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $bundle->id, 'product_id' => $q->id, 'quantity' => 1]);
    $ignored = pmaListing($this->shop, ['seller_sku' => 'PMA-SYNC', 'ignored_at' => now()]);

    app(MarketplaceListingSyncService::class)->autoMatch($this->shop->id);

    expect($manual->fresh())->product_id->toBe($q->id)->match_method->toBe('manual');
    expect($suggested->fresh())->product_id->toBe($q->id)->match_method->toBe('suggested')->pack_quantity->toBe(2);
    expect($bundle->fresh())->product_id->toBeNull()->match_method->toBe('bundle');
    expect($bundle->fresh()->components()->count())->toBe(2);
    expect($ignored->fresh())->product_id->toBeNull()->match_method->toBeNull();
});

test('a manual link whose product was deleted goes back to the queue on the next auto-match', function () {
    $gone = Product::create(['sku' => 'PMA-GONE']);
    $l = pmaListing($this->shop, ['seller_sku' => 'PMA-GONE-LISTING', 'product_id' => $gone->id, 'match_method' => 'manual']);
    $gone->forceDelete();

    app(MarketplaceListingSyncService::class)->autoMatch($this->shop->id);

    expect($l->fresh()->match_method)->toBeNull();
});

test('index exposes suggested / ignored tabs, suggestions on rows and bundle components', function () {
    $a = Product::create(['sku' => 'PMA-IA']);
    $b = Product::create(['sku' => 'PMA-IB']);
    pmaListing($this->shop, ['seller_sku' => 'PMA-IA_4']);                        // suggested (pack)
    pmaListing($this->shop, ['seller_sku' => 'NO-SUGGESTION']);                   // unmatched only
    pmaListing($this->shop, ['seller_sku' => 'HIDDEN', 'ignored_at' => now(), 'ignore_reason' => 'r']);
    $bundle = pmaListing($this->shop, ['seller_sku' => 'BUNDLE', 'match_method' => 'bundle']);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $bundle->id, 'product_id' => $a->id, 'quantity' => 1]);
    MarketplaceListingComponent::create(['marketplace_listing_id' => $bundle->id, 'product_id' => $b->id, 'quantity' => 3]);

    $props = function (array $query) {
        $request = Request::create('/catalog/marketplace/product-matching', 'GET', $query);
        $request->setUserResolver(fn () => $this->user);
        $response = app(ProductMatchingController::class)->index($request);

        return (fn () => $this->props)->call($response);
    };

    $p = $props(['shop_id' => $this->shop->id, 'tab' => 'suggested']);
    expect($p['summary'])->toMatchArray(['matched' => 1, 'unmatched' => 2, 'suggested' => 1, 'ignored' => 1]);
    $row = $p['rows']->items()[0];
    expect($row['seller_sku'])->toBe('PMA-IA_4')
        ->and($row['suggestions'][0])->toMatchArray(['type' => 'pack', 'pack_quantity' => 4, 'confidence' => 'high']);

    $p = $props(['shop_id' => $this->shop->id, 'tab' => 'matched']);
    $row = $p['rows']->items()[0];
    expect(collect($row['components'])->pluck('quantity', 'sku')->all())->toBe(['PMA-IA' => 1, 'PMA-IB' => 3]);

    $p = $props(['shop_id' => $this->shop->id, 'tab' => 'ignored']);
    expect($p['rows']->items()[0]['ignore_reason'])->toBe('r');
});
