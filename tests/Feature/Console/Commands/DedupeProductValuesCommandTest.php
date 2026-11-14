<?php

use App\Models\Attribute;
use App\Models\AttributeGroup;
use App\Models\Product;
use App\Models\ProductValue;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * Covers pim:dedupe-product-values + migration 2026_11_14_000001 (uq_product_values_scope).
 * The unique index already exists in the test DB, so duplicate rows are staged by
 * dropping it first — RefreshDatabase's transaction rolls the DROP back afterwards.
 */
function dropProductValueScopeIndex(): void
{
    DB::statement('DROP INDEX IF EXISTS uq_product_values_scope');
}

test('duplicates in the same scope are removed, keeping the oldest row', function () {
    dropProductValueScopeIndex();

    $attribute = Attribute::create(['code' => 'dpv_attr', 'type' => 'text']);
    $product = Product::create(['sku' => 'DPV-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    $kept = ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'user typed']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'user typed']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'backfill copy']);

    $this->artisan('pim:dedupe-product-values')->assertSuccessful();

    $rows = ProductValue::where('product_id', $product->id)->get();
    expect($rows)->toHaveCount(1);
    expect($rows->first()->id)->toBe($kept->id);
    expect($rows->first()->value)->toBe('user typed');
});

test('rows in different groups or locales are not duplicates', function () {
    dropProductValueScopeIndex();

    $attribute = Attribute::create(['code' => 'dpv_scope_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'dpv_group_a']);
    $groupB = AttributeGroup::create(['code' => 'dpv_group_b']);
    $product = Product::create(['sku' => 'DPV-SCOPE-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $localeId = DB::table('locales')->value('id') ?? DB::table('locales')->insertGetId(['code' => 'dpv', 'enabled' => true, 'translation_status' => 'idle']);

    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'value' => 'a']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'value' => 'b']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'locale_id' => $localeId, 'value' => 'a-th']);

    $this->artisan('pim:dedupe-product-values')->assertSuccessful();

    expect(ProductValue::where('product_id', $product->id)->count())->toBe(3);
});

test('dry run deletes nothing', function () {
    dropProductValueScopeIndex();

    $attribute = Attribute::create(['code' => 'dpv_dry_attr', 'type' => 'text']);
    $product = Product::create(['sku' => 'DPV-DRY-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'x']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'x']);

    $this->artisan('pim:dedupe-product-values', ['--dry-run' => true])->assertSuccessful();

    expect(ProductValue::where('product_id', $product->id)->count())->toBe(2);

});

test('the unique index rejects a second row in the same scope, NULLs included', function () {
    $attribute = Attribute::create(['code' => 'dpv_uq_attr', 'type' => 'text']);
    $product = Product::create(['sku' => 'DPV-UQ-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'first']);

    expect(fn () => ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'second']))
        ->toThrow(UniqueConstraintViolationException::class);
});

test('updateOrCreate on an existing scope still updates in place', function () {
    $attribute = Attribute::create(['code' => 'dpv_upsert_attr', 'type' => 'text']);
    $product = Product::create(['sku' => 'DPV-UPSERT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $keys = ['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => null, 'channel_id' => null, 'locale_id' => null];

    ProductValue::updateOrCreate($keys, ['value' => 'v1']);
    ProductValue::updateOrCreate($keys, ['value' => 'v2']);

    expect(ProductValue::where('product_id', $product->id)->pluck('value')->all())->toBe(['v2']);
});
