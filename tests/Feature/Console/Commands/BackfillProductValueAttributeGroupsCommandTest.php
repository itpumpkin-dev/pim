<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * Covers migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table
 * — every product_values row starts NULL after that migration; this command
 * fills in the correct attribute_group_id using the same
 * EffectiveFamilyAttributeResolver logic the product edit page uses.
 */
test('a value for an attribute placed in exactly one group gets that group assigned, no duplication', function () {
    $attribute = Attribute::create(['code' => 'bpvg_single_attr', 'type' => 'text']);
    $group = AttributeGroup::create(['code' => 'bpvg_single_group']);
    $family = AttributeFamily::create(['code' => 'bpvg_single_family', 'name' => 'Single']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'bpvg_single_category', 'name' => 'Single Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'BPVG-SINGLE-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);
    $value = ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'hello']);

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();

    $rows = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->get();
    expect($rows)->toHaveCount(1);
    expect($rows->first()->id)->toBe($value->id);
    expect($rows->first()->attribute_group_id)->toBe($group->id);
    expect($rows->first()->value)->toBe('hello');
});

test('a value for an attribute placed in two groups is duplicated, one row per group, same value', function () {
    $attribute = Attribute::create(['code' => 'bpvg_multi_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'bpvg_multi_group_a']);
    $groupB = AttributeGroup::create(['code' => 'bpvg_multi_group_b']);
    $family = AttributeFamily::create(['code' => 'bpvg_multi_family', 'name' => 'Multi']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);

    $category = Category::create(['code' => 'bpvg_multi_category', 'name' => 'Multi Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'BPVG-MULTI-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'shared text']);

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();

    $rows = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->get();
    expect($rows)->toHaveCount(2);
    expect($rows->pluck('attribute_group_id')->sort()->values()->all())->toBe(collect([$groupA->id, $groupB->id])->sort()->values()->all());
    expect($rows->pluck('value')->unique()->all())->toBe(['shared text']);
});

test('a value for a product not bound to any family is left ungrouped', function () {
    $attribute = Attribute::create(['code' => 'bpvg_nofamily_attr', 'type' => 'text']);
    $product = Product::create(['sku' => 'BPVG-NOFAMILY-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'orphan']);

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();

    $row = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->first();
    expect($row->attribute_group_id)->toBeNull();
});

test('a value for an attribute never bound to any group at all is left ungrouped (system/master attribute)', function () {
    $attribute = Attribute::create(['code' => 'bpvg_system_attr', 'type' => 'text']);
    $family = AttributeFamily::create(['code' => 'bpvg_system_family', 'name' => 'System']);
    $category = Category::create(['code' => 'bpvg_system_category', 'name' => 'System Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'BPVG-SYSTEM-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'pcatname-like']);

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();

    $row = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->first();
    expect($row->attribute_group_id)->toBeNull();
});

test('running the command twice is idempotent', function () {
    $attribute = Attribute::create(['code' => 'bpvg_idempotent_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'bpvg_idempotent_group_a']);
    $groupB = AttributeGroup::create(['code' => 'bpvg_idempotent_group_b']);
    $family = AttributeFamily::create(['code' => 'bpvg_idempotent_family', 'name' => 'Idempotent']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);

    $category = Category::create(['code' => 'bpvg_idempotent_category', 'name' => 'Idempotent Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'BPVG-IDEMPOTENT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'stable']);

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();
    $countAfterFirstRun = ProductValue::where('product_id', $product->id)->count();

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();
    $countAfterSecondRun = ProductValue::where('product_id', $product->id)->count();

    expect($countAfterSecondRun)->toBe($countAfterFirstRun);
    expect($countAfterFirstRun)->toBe(2);
});

test('a newly-added second placement after backfill starts blank instead of being retroactively duplicated', function () {
    $attribute = Attribute::create(['code' => 'bpvg_late_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'bpvg_late_group_a']);
    $groupB = AttributeGroup::create(['code' => 'bpvg_late_group_b']);
    $family = AttributeFamily::create(['code' => 'bpvg_late_family', 'name' => 'Late']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'bpvg_late_category', 'name' => 'Late Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'BPVG-LATE-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'first group only']);

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();
    expect(ProductValue::where('product_id', $product->id)->count())->toBe(1);

    // Admin adds a second group placement for the same attribute AFTER the backfill ran.
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);

    $this->artisan('pim:backfill-product-value-groups')->assertSuccessful();

    // The existing row (already has a group) is untouched, and no row was
    // fabricated for the new placement — it correctly starts blank.
    $rows = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->get();
    expect($rows)->toHaveCount(1);
    expect($rows->first()->attribute_group_id)->toBe($groupA->id);
});
