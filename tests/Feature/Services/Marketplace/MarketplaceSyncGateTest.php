<?php

use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\ShopeeBrand;
use App\Models\ShopeeCategory;
use App\Services\Marketplace\MarketplaceSyncGate;

function makeSyncProduct(array $attributes = []): Product
{
    return Product::create(array_merge(['sku' => 'SKU-'.uniqid()], $attributes));
}

beforeEach(function () {
    $this->gate = new MarketplaceSyncGate();
});

// --- categoryMapped ---

test('categoryMapped is true when the product has its own platform category override', function () {
    ShopeeCategory::create(['id' => 100, 'name' => 'Test Shopee Category', 'is_leaf' => true]);
    $product = makeSyncProduct(['shopee_category_id' => 100]);

    expect($this->gate->categoryMapped($product, 'shopee'))->toBeTrue();
});

test('categoryMapped falls back to whether any of the product\'s assigned categories has the platform mapping', function () {
    ShopeeCategory::create(['id' => 100, 'name' => 'Test Shopee Category', 'is_leaf' => true]);
    $mapped = Category::create(['code' => 'mapped', 'name' => 'Mapped', 'shopee_category_id' => 100]);
    $unmapped = Category::create(['code' => 'unmapped', 'name' => 'Unmapped']);

    $product = makeSyncProduct();
    $product->categories()->attach($unmapped->id);

    expect($this->gate->categoryMapped($product, 'shopee'))->toBeFalse();

    $product->categories()->attach($mapped->id);
    expect($this->gate->categoryMapped($product, 'shopee'))->toBeTrue();
});

test('categoryMapped is false with no override and no assigned category at all', function () {
    $product = makeSyncProduct();

    expect($this->gate->categoryMapped($product, 'shopee'))->toBeFalse();
});

// --- brandMapped ---

test('brandMapped is true when the product has its own platform brand override', function () {
    ShopeeBrand::create(['id' => 55, 'name' => 'Test Shopee Brand']);
    $product = makeSyncProduct(['shopee_brand_id' => 55]);

    expect($this->gate->brandMapped($product, 'shopee'))->toBeTrue();
});

test('brandMapped resolves through the product\'s pbrand value to a Brand row mapped for the platform', function () {
    $brandAttr = Attribute::create(['code' => 'pbrand', 'type' => 'select']);
    Brand::create(['code' => 'acme', 'name' => 'Acme', 'shopee_brand_id' => 999]);
    $product = makeSyncProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $brandAttr->id, 'value' => 'acme']);

    expect($this->gate->brandMapped($product, 'shopee'))->toBeTrue();
});

test('brandMapped is false when the pbrand-linked Brand exists but has no mapping for this platform', function () {
    $brandAttr = Attribute::create(['code' => 'pbrand', 'type' => 'select']);
    Brand::create(['code' => 'acme', 'name' => 'Acme']); // no shopee_brand_id
    $product = makeSyncProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $brandAttr->id, 'value' => 'acme']);

    expect($this->gate->brandMapped($product, 'shopee'))->toBeFalse();
});

test('brandMapped is false when the product has no pbrand value at all', function () {
    Attribute::create(['code' => 'pbrand', 'type' => 'select']);
    $product = makeSyncProduct();

    expect($this->gate->brandMapped($product, 'shopee'))->toBeFalse();
});

test('brandMapped is false when the pbrand attribute does not even exist in this environment', function () {
    $product = makeSyncProduct();

    expect($this->gate->brandMapped($product, 'shopee'))->toBeFalse();
});

test('tiktok uniquely accepts a Brand row with no tiktok_brand_id yet, since push() can create it via API', function () {
    $brandAttr = Attribute::create(['code' => 'pbrand', 'type' => 'select']);
    Brand::create(['code' => 'acme', 'name' => 'Acme']); // no tiktok_brand_id
    $product = makeSyncProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $brandAttr->id, 'value' => 'acme']);

    expect($this->gate->brandMapped($product, 'tiktok'))->toBeTrue();
    // Every other platform still requires the mapping to exist already.
    expect($this->gate->brandMapped($product, 'shopee'))->toBeFalse();
});

test('lazada uniquely also accepts a direct PIM attribute mapped to its "brand" attribute, with no Brand master row involved at all', function () {
    LazadaAttribute::firstOrCreate(['name' => 'brand'], ['label' => 'Brand', 'input_type' => 'text']);
    $genericAttr = Attribute::create(['code' => 'some_custom_attr', 'type' => 'text']);
    LazadaAttributeMapping::create([
        'attribute_id' => $genericAttr->id,
        'target_field' => 'lazada_attribute',
        'lazada_attribute_name' => 'brand',
        'sort_order' => 0,
    ]);
    $product = makeSyncProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $genericAttr->id, 'value' => 'SomeBrandText']);

    expect($this->gate->brandMapped($product, 'lazada'))->toBeTrue();
});

test('lazada\'s attribute-mapping fallback does not count an empty-string value as mapped', function () {
    LazadaAttribute::firstOrCreate(['name' => 'brand'], ['label' => 'Brand', 'input_type' => 'text']);
    $genericAttr = Attribute::create(['code' => 'some_custom_attr', 'type' => 'text']);
    LazadaAttributeMapping::create([
        'attribute_id' => $genericAttr->id,
        'target_field' => 'lazada_attribute',
        'lazada_attribute_name' => 'brand',
        'sort_order' => 0,
    ]);
    $product = makeSyncProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $genericAttr->id, 'value' => '']);

    expect($this->gate->brandMapped($product, 'lazada'))->toBeFalse();
});
