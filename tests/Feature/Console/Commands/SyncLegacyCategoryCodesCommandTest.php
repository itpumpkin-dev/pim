<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * pim:sync-legacy-category-codes rewrites pcatname/psubcatname/productgroupname
 * from the product_category tree via the same
 * ProductCategoryLinker::deriveLegacyCodesFromCategories() the product edit
 * page's Save uses — and must leave products with no category untouched.
 */
function slccSetup(): array
{
    $attributes = [];
    foreach (['pcatname', 'psubcatname', 'productgroupname'] as $code) {
        $attributes[$code] = Attribute::firstOrCreate(['code' => $code], ['type' => 'select']);
    }

    $root = Category::create(['code' => 'slccr', 'name' => 'Root']);
    $sub = Category::create(['code' => 'slccr001', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'slccr001001', 'name' => 'Group', 'parent_id' => $sub->id]);

    AttributeOption::create(['attribute_id' => $attributes['pcatname']->id, 'code' => 'slccr']);
    AttributeOption::create(['attribute_id' => $attributes['psubcatname']->id, 'code' => 'slccr001']);
    AttributeOption::create(['attribute_id' => $attributes['productgroupname']->id, 'code' => 'slccr001001']);

    return [$attributes, $group];
}

function slccValue(Product $product, Attribute $attribute): ?string
{
    return ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->value('value');
}

test('writes all three codes from the category tree, overwriting a stale value', function () {
    [$attributes, $group] = slccSetup();

    $product = Product::create(['sku' => 'SLCC-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    $product->categories()->attach($group->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['pcatname']->id, 'value' => 'stale']);

    $this->artisan('pim:sync-legacy-category-codes', ['--sku' => [$product->sku]])->assertSuccessful();

    expect(slccValue($product, $attributes['pcatname']))->toBe('slccr');
    expect(slccValue($product, $attributes['psubcatname']))->toBe('slccr001');
    expect(slccValue($product, $attributes['productgroupname']))->toBe('slccr001001');
});

test('--dry-run writes nothing', function () {
    [$attributes, $group] = slccSetup();

    $product = Product::create(['sku' => 'SLCC-DRY-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    $product->categories()->attach($group->id);

    $this->artisan('pim:sync-legacy-category-codes', ['--sku' => [$product->sku], '--dry-run' => true])->assertSuccessful();

    expect(slccValue($product, $attributes['pcatname']))->toBeNull();
    expect(slccValue($product, $attributes['productgroupname']))->toBeNull();
});

test('a product with no category keeps its existing codes', function () {
    [$attributes] = slccSetup();

    $product = Product::create(['sku' => 'SLCC-NOCAT-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['pcatname']->id, 'value' => 'slccr']);

    $this->artisan('pim:sync-legacy-category-codes', ['--sku' => [$product->sku]])->assertSuccessful();

    expect(slccValue($product, $attributes['pcatname']))->toBe('slccr');
});
