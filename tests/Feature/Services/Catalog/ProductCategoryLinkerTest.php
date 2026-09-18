<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\ProductCategoryLinker;

function makeProduct(): Product
{
    return Product::create(['sku' => 'SKU-'.uniqid()]);
}

// --- linkFromCodes ---

test('links a product to categories matching the given codes, additively', function () {
    $product = makeProduct();
    $cat = Category::create(['code' => 'a025001', 'name' => 'Cat']);
    $existing = Category::create(['code' => 'other', 'name' => 'Existing']);
    $product->categories()->attach($existing->id);

    ProductCategoryLinker::linkFromCodes($product, ['a025001']);

    $linkedIds = $product->categories()->pluck('categories.id')->all();
    expect($linkedIds)->toContain($cat->id, $existing->id);
});

test('codes that match no category are silently ignored', function () {
    $product = makeProduct();

    ProductCategoryLinker::linkFromCodes($product, ['no_such_code']);

    expect($product->categories()->count())->toBe(0);
});

test('blank, non-string, and duplicate codes are filtered out before querying', function () {
    $product = makeProduct();
    $cat = Category::create(['code' => 'a025001', 'name' => 'Cat']);

    ProductCategoryLinker::linkFromCodes($product, ['', 'a025001', 'a025001', null, 123]);

    expect($product->categories()->pluck('categories.id')->all())->toBe([$cat->id]);
});

test('an entirely empty code list is a safe no-op', function () {
    $product = makeProduct();

    ProductCategoryLinker::linkFromCodes($product, []);

    expect($product->categories()->count())->toBe(0);
});

// --- deriveLegacyCodesFromCategories ---

function makeLegacyAttributes(): array
{
    return [
        'pcatid' => Attribute::create(['code' => 'pcatid', 'type' => 'select']),
        'pcatname' => Attribute::create(['code' => 'pcatname', 'type' => 'select']),
        'psubcatname' => Attribute::create(['code' => 'psubcatname', 'type' => 'select']),
        'productgroupname' => Attribute::create(['code' => 'productgroupname', 'type' => 'select']),
    ];
}

test('returns early doing nothing when none of the legacy attributes exist in this environment', function () {
    $product = makeProduct();
    $category = Category::create(['code' => 'a025001', 'name' => 'Cat']);

    ProductCategoryLinker::deriveLegacyCodesFromCategories($product, [$category->id]);

    expect(ProductValue::where('product_id', $product->id)->count())->toBe(0);
});

test('derives pcatname/psubcatname/productgroupname from the 3-level ancestor chain of the deepest category', function () {
    $attributes = makeLegacyAttributes();
    $root = Category::create(['code' => 'a', 'name' => 'Root']);
    $sub = Category::create(['code' => 'a025', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'a025001', 'name' => 'Group', 'parent_id' => $sub->id]);

    foreach (['pcatid' => 'a', 'pcatname' => 'a', 'psubcatname' => 'a025', 'productgroupname' => 'a025001'] as $attrCode => $optionCode) {
        AttributeOption::create(['attribute_id' => $attributes[$attrCode]->id, 'code' => $optionCode, 'admin_label' => $optionCode]);
    }

    $product = makeProduct();

    ProductCategoryLinker::deriveLegacyCodesFromCategories($product, [$group->id]);

    $values = ProductValue::where('product_id', $product->id)->pluck('value', 'attribute_id');
    expect($values[$attributes['pcatid']->id])->toBe('a');
    expect($values[$attributes['pcatname']->id])->toBe('a');
    expect($values[$attributes['psubcatname']->id])->toBe('a025');
    expect($values[$attributes['productgroupname']->id])->toBe('a025001');
});

test('a level whose derived code has no matching AttributeOption is left cleared, not written with a dangling value', function () {
    $attributes = makeLegacyAttributes();
    $root = Category::create(['code' => 'a', 'name' => 'Root']);
    $sub = Category::create(['code' => 'a025', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'a025001', 'name' => 'Group', 'parent_id' => $sub->id]);

    // Only pcatname has a matching option — psubcatname/productgroupname/pcatid don't.
    AttributeOption::create(['attribute_id' => $attributes['pcatname']->id, 'code' => 'a', 'admin_label' => 'a']);

    $product = makeProduct();
    ProductCategoryLinker::deriveLegacyCodesFromCategories($product, [$group->id]);

    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $attributes['pcatname']->id)->exists())->toBeTrue();
    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $attributes['psubcatname']->id)->exists())->toBeFalse();
    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $attributes['productgroupname']->id)->exists())->toBeFalse();
});

test('clearing a product\'s categories (empty categoryIds) clears every previously-derived legacy value', function () {
    $attributes = makeLegacyAttributes();
    $root = Category::create(['code' => 'a', 'name' => 'Root']);
    AttributeOption::create(['attribute_id' => $attributes['pcatname']->id, 'code' => 'a', 'admin_label' => 'a']);

    $product = makeProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['pcatname']->id, 'value' => 'a']);

    ProductCategoryLinker::deriveLegacyCodesFromCategories($product, []);

    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $attributes['pcatname']->id)->exists())->toBeFalse();
});

test('when a product has multiple assigned categories, the deepest one (longest code) drives the derived values', function () {
    $attributes = makeLegacyAttributes();
    $root = Category::create(['code' => 'a', 'name' => 'Root']);
    $sub = Category::create(['code' => 'a025', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'a025001', 'name' => 'Group', 'parent_id' => $sub->id]);
    AttributeOption::create(['attribute_id' => $attributes['productgroupname']->id, 'code' => 'a025001', 'admin_label' => 'x']);

    $product = makeProduct();
    // Pass both the shallow root and the deep group — the group (longer code) must win.
    ProductCategoryLinker::deriveLegacyCodesFromCategories($product, [$root->id, $group->id]);

    $value = ProductValue::where('product_id', $product->id)->where('attribute_id', $attributes['productgroupname']->id)->first();
    expect($value->value)->toBe('a025001');
});

test('re-deriving updates an existing value in place rather than creating a duplicate row', function () {
    $attributes = makeLegacyAttributes();
    $root = Category::create(['code' => 'a', 'name' => 'Root']);
    AttributeOption::create(['attribute_id' => $attributes['pcatname']->id, 'code' => 'a', 'admin_label' => 'a']);
    $otherRoot = Category::create(['code' => 'b', 'name' => 'Root B']);
    AttributeOption::create(['attribute_id' => $attributes['pcatname']->id, 'code' => 'b', 'admin_label' => 'b']);

    $product = makeProduct();
    ProductCategoryLinker::deriveLegacyCodesFromCategories($product, [$root->id]);
    ProductCategoryLinker::deriveLegacyCodesFromCategories($product, [$otherRoot->id]);

    $rows = ProductValue::where('product_id', $product->id)->where('attribute_id', $attributes['pcatname']->id)->get();
    expect($rows)->toHaveCount(1);
    expect($rows->first()->value)->toBe('b');
});
