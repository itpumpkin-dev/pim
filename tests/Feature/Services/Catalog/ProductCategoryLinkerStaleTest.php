<?php

use App\Models\Category;
use App\Models\Product;
use App\Services\Catalog\ProductCategoryLinker;

/**
 * ProductCategoryLinker::staleCategoryIds() — หมวดหมู่ที่ค้างจากการเปลี่ยนหมวดหมู่รอบก่อนๆ
 * (ทำให้สินค้าอยู่ 2 กลุ่มสินค้าพร้อมกัน) และคำสั่ง catalog:prune-stale-product-categories
 */
function staleTree(): array
{
    $root = Category::create(['code' => 'pslt_a_'.uniqid(), 'name' => 'A']);
    $sub = Category::create(['code' => 'pslt_a1_'.uniqid(), 'name' => 'A1', 'parent_id' => $root->id]);
    $groupNew = Category::create(['code' => 'pslt_new_'.uniqid(), 'name' => 'New', 'parent_id' => $sub->id]);
    $groupOld = Category::create(['code' => 'pslt_old_'.uniqid(), 'name' => 'Old', 'parent_id' => $sub->id]);

    return [$root, $sub, $groupNew, $groupOld];
}

test('a product group left over from an earlier change is stale', function () {
    [$root, $sub, $groupNew, $groupOld] = staleTree();
    $product = Product::create(['sku' => 'PSLT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach([$root->id, $sub->id, $groupNew->id, $groupOld->id]);

    expect(ProductCategoryLinker::staleCategoryIds($product, [$root->code, $sub->code, $groupNew->code]))->toBe([$groupOld->id]);
});

test('a deeper category under the deepest chosen code is kept', function () {
    [$root, $sub, $groupNew] = staleTree();
    $product = Product::create(['sku' => 'PSLT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    // no product group chosen, but one is linked under the chosen sub-category (e.g. from an import)
    $product->categories()->attach([$root->id, $sub->id, $groupNew->id]);

    expect(ProductCategoryLinker::staleCategoryIds($product, [$root->code, $sub->code]))->toBe([]);
});

test('the prune command is a dry run unless --apply is passed', function () {
    [$root, $sub, $groupNew, $groupOld] = staleTree();
    $attrs = collect(['pcatname', 'psubcatname', 'productgroupname'])
        ->mapWithKeys(fn ($code) => [$code => \App\Models\Attribute::firstOrCreate(['code' => $code], ['type' => 'select', 'is_locale_based' => true])]);

    $product = Product::create(['sku' => 'PSLT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach([$root->id, $sub->id, $groupNew->id, $groupOld->id]);
    foreach (['pcatname' => $root->code, 'psubcatname' => $sub->code, 'productgroupname' => $groupNew->code] as $code => $value) {
        \App\Models\ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attrs[$code]->id, 'value' => $value]);
    }

    $this->artisan('catalog:prune-stale-product-categories')->assertSuccessful();
    expect($product->categories()->pluck('categories.id')->all())->toContain($groupOld->id);

    $this->artisan('catalog:prune-stale-product-categories --apply')->assertSuccessful();
    $linked = $product->categories()->pluck('categories.id')->all();
    expect($linked)->not->toContain($groupOld->id);
    expect($linked)->toContain($groupNew->id);
});
