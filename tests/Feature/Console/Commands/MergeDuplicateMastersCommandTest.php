<?php

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * Covers pim:merge-duplicate-masters (DB cleanup Phase 3a).
 */
function mdmAttribute(string $code, array $extra = []): Attribute
{
    $attribute = Attribute::withTrashed()->firstOrCreate(['code' => $code], ['type' => 'select'] + $extra);
    $attribute->forceFill(['type' => 'select', 'deleted_at' => null] + $extra)->save();

    return $attribute;
}

function mdmOption(Attribute $attribute, string $code): int
{
    return DB::table('attribute_options')->insertGetId(['attribute_id' => $attribute->id, 'code' => $code, 'sort_order' => 0, 'is_active' => true, 'is_customized' => false]);
}

function mdmProduct(): Product
{
    return Product::create(['sku' => 'MDM-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
}

test('brand values merge into pbrand: missing values move, existing ones win', function () {
    $brand = mdmAttribute('brand', ['master_source' => 'brands']);
    $pbrand = mdmAttribute('pbrand', ['master_source' => 'brands']);
    $onlyBrand = mdmProduct();
    $both = mdmProduct();
    ProductValue::create(['product_id' => $onlyBrand->id, 'attribute_id' => $brand->id, 'value' => 'pumpkin']);
    ProductValue::create(['product_id' => $both->id, 'attribute_id' => $brand->id, 'value' => 'other']);
    ProductValue::create(['product_id' => $both->id, 'attribute_id' => $pbrand->id, 'value' => 'pumpkin']);

    $this->artisan('pim:merge-duplicate-masters')->assertSuccessful();

    expect(ProductValue::where('attribute_id', $pbrand->id)->where('product_id', $onlyBrand->id)->value('value'))->toBe('pumpkin');
    expect(ProductValue::where('attribute_id', $pbrand->id)->where('product_id', $both->id)->pluck('value')->all())->toBe(['pumpkin']);
    expect(ProductValue::where('attribute_id', $brand->id)->count())->toBe(0);

    $brand = Attribute::withTrashed()->find($brand->id);
    expect($brand->trashed())->toBeTrue();
    expect($brand->master_source)->toBeNull();
});

test('a lazada mapping moves to pbrand with its option mappings remapped by code', function () {
    $brand = mdmAttribute('brand', ['master_source' => 'brands']);
    $pbrand = mdmAttribute('pbrand', ['master_source' => 'brands']);
    $brandOption = mdmOption($brand, 'pumpkin');
    $pbrandOption = mdmOption($pbrand, 'pumpkin');
    DB::table('lazada_attributes')->insertOrIgnore(['name' => 'brand', 'label' => 'Brand']);
    $mappingId = DB::table('lazada_attribute_mappings')->insertGetId(['attribute_id' => $brand->id, 'lazada_attribute_name' => 'brand', 'sort_order' => 0, 'target_field' => 'lazada_attribute']);
    DB::table('lazada_attribute_option_mappings')->insert(['lazada_attribute_mapping_id' => $mappingId, 'attribute_option_id' => $brandOption, 'lazada_option_value' => '123']);

    expect(\App\Models\LazadaAttributeMapping::cachedList()->firstWhere('id', $mappingId)->attribute_id)->toBe($brand->id); // warm the cache

    $this->artisan('pim:merge-duplicate-masters')->assertSuccessful();

    expect(DB::table('lazada_attribute_mappings')->where('id', $mappingId)->value('attribute_id'))->toBe($pbrand->id);
    expect(\App\Models\LazadaAttributeMapping::cachedList()->firstWhere('id', $mappingId)->attribute_id)->toBe($pbrand->id);
    expect(DB::table('lazada_attribute_option_mappings')->where('lazada_attribute_mapping_id', $mappingId)->value('attribute_option_id'))->toBe($pbrandOption);
});

test('unitinfo becomes a text field again and keeps its values', function () {
    $unitInfo = mdmAttribute('unitinfo', ['master_source' => 'base_units']);
    mdmOption($unitInfo, 'item');
    $product = mdmProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $unitInfo->id, 'value' => '290 ML/หลอด']);

    $this->artisan('pim:merge-duplicate-masters')->assertSuccessful();

    $unitInfo = $unitInfo->fresh();
    expect($unitInfo->type)->toBe('text');
    expect($unitInfo->master_source)->toBeNull();
    expect(DB::table('attribute_options')->where('attribute_id', $unitInfo->id)->count())->toBe(0);
    expect(ProductValue::where('attribute_id', $unitInfo->id)->value('value'))->toBe('290 ML/หลอด');
});

test('producttype is renamed to ประเภทสินค้า including its Thai label', function () {
    $th = Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'TH', 'enabled' => true])->id;
    $productType = mdmAttribute('producttype', ['master_source' => 'product_types', 'name' => 'หมวดหมู่สินค้า']);
    DB::table('attribute_translations')->updateOrInsert(['attribute_id' => $productType->id, 'locale_id' => $th], ['label' => 'หมวดหมู่สินค้า']);

    $this->artisan('pim:merge-duplicate-masters')->assertSuccessful();

    expect(Attribute::whereKey($productType->id)->first()->getRawOriginal('name'))->toBe('ประเภทสินค้า');
    expect(DB::table('attribute_translations')->where('attribute_id', $productType->id)->where('locale_id', $th)->value('label'))->toBe('ประเภทสินค้า');
});

test('dry run changes nothing', function () {
    $brand = mdmAttribute('brand', ['master_source' => 'brands']);
    mdmAttribute('pbrand', ['master_source' => 'brands']);

    $this->artisan('pim:merge-duplicate-masters', ['--dry-run' => true])->assertSuccessful();

    expect(Attribute::find($brand->id))->not->toBeNull();
});
