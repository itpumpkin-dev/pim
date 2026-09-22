<?php

use App\Http\Controllers\Catalog\LazadaMasterProductsController;
use App\Models\LazadaProduct;
use App\Models\Role;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * A role can be restricted to a subset of shops per marketplace platform
 * (role_sales_platform_restrictions + role_sales_platform_shop — see
 * User::allowedShopIds()/canAccessShop()). Every sibling marketplace
 * controller (LazadaAttributeMappingController, ShopeeAttributeMappingController,
 * ProductController's push/deactivate endpoints, ...) scopes its shop list and
 * data query through this. LazadaMasterProductsController originally did not,
 * letting a shop-restricted user see/sync every shop's cached data regardless
 * — these tests lock that scoping in.
 */
function lmpController(): LazadaMasterProductsController
{
    return app(LazadaMasterProductsController::class);
}

function lmpRestrictedUser(int $platformId, int $allowedShopId): User
{
    $user = User::factory()->create();
    $role = Role::create(['label' => 'Restricted Lazada Role '.uniqid()]);
    $user->roles()->attach($role->id);

    DB::table('role_sales_platform_restrictions')->insert([
        'role_id' => $role->id,
        'sales_platform_id' => $platformId,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    DB::table('role_sales_platform_shop')->insert([
        'role_id' => $role->id,
        'sales_platform_shop_id' => $allowedShopId,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    return $user;
}

function lmpInertiaProps(\Inertia\Response $response): array
{
    $request = Request::create('/');
    $request->headers->set('X-Inertia', 'true');

    return json_decode($response->toResponse($request)->getContent(), true)['props'];
}

test('index() only shows shops and cached products the user\'s role is allowed to access', function () {
    $platform = SalesPlatform::create(['code' => 'lazada_'.uniqid(), 'name' => 'Lazada']);
    $allowedShop = SalesPlatformShop::create([
        'sales_platform_id' => $platform->id, 'code' => 'shop_a_'.uniqid(), 'name' => 'Allowed Shop',
        'lazada_seller_account_id' => 111,
    ]);
    $blockedShop = SalesPlatformShop::create([
        'sales_platform_id' => $platform->id, 'code' => 'shop_b_'.uniqid(), 'name' => 'Blocked Shop',
        'lazada_seller_account_id' => 222,
    ]);

    LazadaProduct::create(['sales_platform_shop_id' => $allowedShop->id, 'item_id' => 1, 'seller_sku' => 'ALLOWED-SKU']);
    LazadaProduct::create(['sales_platform_shop_id' => $blockedShop->id, 'item_id' => 2, 'seller_sku' => 'BLOCKED-SKU']);

    $user = lmpRestrictedUser($platform->id, $allowedShop->id);
    $request = Request::create('/catalog/marketplace/lazada/master-products', 'GET');
    $request->setUserResolver(fn () => $user);

    $props = lmpInertiaProps(lmpController()->index($request));

    $shopIds = collect($props['shops'])->pluck('id')->all();
    expect($shopIds)->toBe([$allowedShop->id]);

    $skus = collect($props['products']['data'])->pluck('seller_sku')->all();
    expect($skus)->toBe(['ALLOWED-SKU']);
    expect($props['totalCached'])->toBe(1);
});

test('index() ignores an explicit shop_id param for a shop the user is not allowed to access', function () {
    $platform = SalesPlatform::create(['code' => 'lazada_'.uniqid(), 'name' => 'Lazada']);
    $allowedShop = SalesPlatformShop::create([
        'sales_platform_id' => $platform->id, 'code' => 'shop_c_'.uniqid(), 'name' => 'Allowed Shop 2',
        'lazada_seller_account_id' => 333,
    ]);
    $blockedShop = SalesPlatformShop::create([
        'sales_platform_id' => $platform->id, 'code' => 'shop_d_'.uniqid(), 'name' => 'Blocked Shop 2',
        'lazada_seller_account_id' => 444,
    ]);
    LazadaProduct::create(['sales_platform_shop_id' => $blockedShop->id, 'item_id' => 3, 'seller_sku' => 'BLOCKED-SKU-2']);

    $user = lmpRestrictedUser($platform->id, $allowedShop->id);
    $request = Request::create('/catalog/marketplace/lazada/master-products', 'GET', ['shop_id' => $blockedShop->id]);
    $request->setUserResolver(fn () => $user);

    $props = lmpInertiaProps(lmpController()->index($request));

    expect($props['products']['data'])->toBe([]);
});

test('sync() only loops shops the user\'s role is allowed to access', function () {
    $platform = SalesPlatform::create(['code' => 'lazada_'.uniqid(), 'name' => 'Lazada']);
    $allowedShop = SalesPlatformShop::create([
        'sales_platform_id' => $platform->id, 'code' => 'shop_e_'.uniqid(), 'name' => 'Allowed Shop 3',
        'lazada_seller_account_id' => 555,
    ]);
    $blockedShop = SalesPlatformShop::create([
        'sales_platform_id' => $platform->id, 'code' => 'shop_f_'.uniqid(), 'name' => 'Blocked Shop 3',
        'lazada_seller_account_id' => 666,
    ]);

    $user = lmpRestrictedUser($platform->id, $allowedShop->id);
    $request = Request::create('/catalog/marketplace/lazada/master-products/sync', 'POST');
    $request->setUserResolver(fn () => $user);

    // ทั้งสองร้านไม่มี LazadaSellerAccount จริงให้เรียก API ได้ (อยู่ต่างฐานข้อมูล
    // 'n8n') — LazadaProductSyncService::forShop() จะโยน RuntimeException ทันที
    // ที่หาบัญชีไม่เจอ ก่อนจะยิง HTTP ออกไปจริงๆ ด้วยซ้ำ แต่ sync() catch ไว้แล้ว
    // log เป็น Log::error() ต่อร้านที่พัง — นับจำนวนครั้งที่ log ถูกเรียกแทนการ fake
    // HTTP response ก็พิสูจน์ได้ว่า sync() วนแค่ร้านที่ user มีสิทธิ์เข้าถึงจริงๆ
    // (1 ร้าน) ไม่ใช่ทั้ง 2 ร้าน
    Log::shouldReceive('error')
        ->once()
        ->with('Lazada master-product-list sync failed for shop', Mockery::on(
            fn ($context) => $context['shop_id'] === $allowedShop->id
        ));

    lmpController()->sync($request);

    // Log::shouldReceive(...)->once() above is the real assertion, verified via
    // Mockery::close() in tearDown when the expectation isn't met exactly once.
    expect(true)->toBeTrue();
});