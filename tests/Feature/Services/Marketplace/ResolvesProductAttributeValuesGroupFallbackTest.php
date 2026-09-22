<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaBrand;
use App\Models\LazadaCategory;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Lazada\LazadaClient;
use App\Services\Lazada\LazadaProductSyncService;
use Illuminate\Support\Facades\Http;

/**
 * ResolvesProductAttributeValues::resolveFormattedAttributeValue() (shared
 * by every marketplace sync service) used a scalar ProductValue lookup with
 * no group awareness — nondeterministic once an attribute can hold more
 * than one value (one per attribute_group_id placement, see migration
 * 2026_09_23_000001_add_attribute_group_id_to_product_values_table). It now
 * targets EffectiveFamilyAttributeResolver::primaryGroupIdFor() (lowest
 * group id) deterministically. Exercised through LazadaProductSyncService
 * since the trait itself can't be instantiated directly — the other
 * marketplace services share the exact same trait method.
 */
test('buildPayload uses the primary (lowest id) group placement value for a multi-group mapped attribute', function () {
    LazadaCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    LazadaBrand::firstOrCreate(['id' => 50], ['name' => 'Test Brand']);

    $nameAttribute = Attribute::firstOrCreate(['code' => 'pname'], ['type' => 'text']);
    LazadaAttributeMapping::firstOrCreate(['attribute_id' => $nameAttribute->id], ['target_field' => 'name', 'sort_order' => 0]);
    $priceAttribute = Attribute::firstOrCreate(['code' => 'price_std'], ['type' => 'number']);
    LazadaAttributeMapping::firstOrCreate(['attribute_id' => $priceAttribute->id], ['target_field' => 'price', 'sort_order' => 0]);

    $groupA = AttributeGroup::create(['code' => 'rpav_group_a']);
    $groupB = AttributeGroup::create(['code' => 'rpav_group_b']);
    $family = AttributeFamily::create(['code' => 'rpav_family', 'name' => 'RPAV Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $nameAttribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $nameAttribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);
    expect($groupA->id)->toBeLessThan($groupB->id);

    $category = Category::create(['code' => 'rpav_category', 'name' => 'RPAV PIM Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'RPAV-'.uniqid(), 'type' => 'simple', 'enabled' => false, 'lazada_category_id' => 100, 'lazada_brand_id' => 50]);
    $product->categories()->attach($category->id);

    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $nameAttribute->id, 'attribute_group_id' => $groupA->id, 'value' => 'Primary Name']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $nameAttribute->id, 'attribute_group_id' => $groupB->id, 'value' => 'Other Group Name']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $priceAttribute->id, 'value' => '199']);

    Http::fake(['*/category/attributes/get*' => Http::response(['code' => '0', 'data' => []], 200)]);

    $account = new \App\Models\LazadaSellerAccount();
    $account->app_key = 'appkey123';
    $account->app_secret = 'appsecret123';
    $account->access_token = 'token123';
    $service = new LazadaProductSyncService(new LazadaClient($account));

    $platform = \App\Models\SalesPlatform::create(['code' => 'lazada_rpav', 'name' => 'Lazada']);
    $shop = \App\Models\SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_rpav', 'name' => 'My Shop']);

    $payload = $service->buildPayload($product, $shop);

    expect($payload['attributes']['name'])->toBe('Primary Name');
});
