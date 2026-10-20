<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use Illuminate\Http\Request;

/**
 * Bug: pcatname/psubcatname/productgroupname are flagged is_locale_based in the
 * real DB, so the Edit Product form submits their values under a locale id
 * (e.g. '1') instead of 'default'. update() only read ['global']['default'],
 * saw all three as empty, and relinkMasterCategoryCodes() detached every
 * category — Save Product wiped what the Master Categories panel had saved.
 */
test('update() keeps the product group when master category values arrive under a locale key', function () {
    $pcatname = Attribute::create(['code' => 'pcatname', 'type' => 'select', 'is_locale_based' => true]);
    $psubcatname = Attribute::create(['code' => 'psubcatname', 'type' => 'select', 'is_locale_based' => true]);
    $productgroupname = Attribute::create(['code' => 'productgroupname', 'type' => 'select', 'is_locale_based' => true]);

    $root = Category::create(['code' => 'pulb_root', 'name' => 'Root']);
    $sub = Category::create(['code' => 'pulb_sub', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'pulb_group', 'name' => 'Group', 'parent_id' => $sub->id]);

    AttributeOption::create(['attribute_id' => $pcatname->id, 'code' => 'pulb_root', 'admin_label' => 'Root']);
    AttributeOption::create(['attribute_id' => $psubcatname->id, 'code' => 'pulb_sub', 'admin_label' => 'Sub']);
    AttributeOption::create(['attribute_id' => $productgroupname->id, 'code' => 'pulb_group', 'admin_label' => 'Group']);

    $localeKey = (string) Locale::create(['code' => 'th_PULB', 'display_name' => 'Thai', 'enabled' => true])->id;

    $product = Product::create(['sku' => 'PULB-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($group->id);

    $request = Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => $product->sku,
        'type' => 'simple',
        'enabled' => false,
        'category_ids' => [$group->id],
        'values' => [
            $pcatname->id => ['ungrouped' => ['global' => [$localeKey => 'pulb_root']]],
            $psubcatname->id => ['ungrouped' => ['global' => [$localeKey => 'pulb_sub']]],
            $productgroupname->id => ['ungrouped' => ['global' => [$localeKey => 'pulb_group']]],
        ],
    ]);

    app(ProductController::class)->update($request, $product);

    expect($product->fresh()->categories()->pluck('categories.id')->all())->toContain($group->id);
    // the locale-keyed value (older client) is kept as the single canonical row, not lost
    expect(\App\Models\ProductValue::where('product_id', $product->id)->where('attribute_id', $productgroupname->id)->whereNull('locale_id')->value('value'))->toBe('pulb_group');
    expect(\App\Models\ProductValue::where('product_id', $product->id)->where('attribute_id', $productgroupname->id)->whereNotNull('locale_id')->count())->toBe(0);
});

/**
 * Bug: changing the product group with the main Save button left the product
 * linked to the OLD group. The form wrote the new code under the editing
 * locale ('1') while the stored 'default' (locale_id NULL) row still held the
 * old code — update() relinked from 'default', so nothing moved, and the old
 * group's attribute families kept showing. The form now always writes these
 * three under 'default'; stale locale rows are dropped on every save.
 */
test('changing the product group via the main save moves the product to the new group and drops stale locale rows', function () {
    $pcatname = Attribute::create(['code' => 'pcatname', 'type' => 'select', 'is_locale_based' => true]);
    $psubcatname = Attribute::create(['code' => 'psubcatname', 'type' => 'select', 'is_locale_based' => true]);
    $productgroupname = Attribute::create(['code' => 'productgroupname', 'type' => 'select', 'is_locale_based' => true]);

    $root = Category::create(['code' => 'pulb2_root', 'name' => 'Root']);
    $sub = Category::create(['code' => 'pulb2_sub', 'name' => 'Sub', 'parent_id' => $root->id]);
    $oldGroup = Category::create(['code' => 'pulb2_old', 'name' => 'Old group', 'parent_id' => $sub->id]);
    $newGroup = Category::create(['code' => 'pulb2_new', 'name' => 'New group', 'parent_id' => $sub->id]);

    $localeId = Locale::create(['code' => 'th_PULB2', 'display_name' => 'Thai', 'enabled' => true])->id;

    $product = Product::create(['sku' => 'PULB2-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach([$root->id, $sub->id, $oldGroup->id]);
    foreach ([[$pcatname, 'pulb2_root'], [$psubcatname, 'pulb2_sub'], [$productgroupname, 'pulb2_old']] as [$attr, $code]) {
        \App\Models\ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => $code]);
    }
    // stale row left by the old form: the group picked earlier, saved under the editing locale only
    \App\Models\ProductValue::create(['product_id' => $product->id, 'attribute_id' => $productgroupname->id, 'locale_id' => $localeId, 'value' => 'pulb2_old']);

    $request = Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => $product->sku,
        'type' => 'simple',
        'enabled' => false,
        'category_ids' => [$root->id, $sub->id, $oldGroup->id],
        'values' => [
            $pcatname->id => ['ungrouped' => ['global' => ['default' => 'pulb2_root']]],
            $psubcatname->id => ['ungrouped' => ['global' => ['default' => 'pulb2_sub']]],
            // the form sends back the stale locale key too — 'default' must win
            $productgroupname->id => ['ungrouped' => ['global' => ['default' => 'pulb2_new', (string) $localeId => 'pulb2_old']]],
        ],
    ]);

    app(ProductController::class)->update($request, $product);

    $categoryIds = $product->fresh()->categories()->pluck('categories.id')->all();
    expect($categoryIds)->toContain($newGroup->id);
    expect($categoryIds)->not->toContain($oldGroup->id);
    expect(\App\Models\ProductValue::where('product_id', $product->id)->where('attribute_id', $productgroupname->id)->whereNotNull('locale_id')->count())->toBe(0);
    expect(\App\Models\ProductValue::where('product_id', $product->id)->where('attribute_id', $productgroupname->id)->whereNull('locale_id')->value('value'))->toBe('pulb2_new');
});

test('clearing the product group via the main save does not fall back to a stale locale value', function () {
    $productgroupname = Attribute::create(['code' => 'productgroupname', 'type' => 'select', 'is_locale_based' => true]);
    Attribute::create(['code' => 'pcatname', 'type' => 'select', 'is_locale_based' => true]);
    Attribute::create(['code' => 'psubcatname', 'type' => 'select', 'is_locale_based' => true]);

    $group = Category::create(['code' => 'pulb3_group', 'name' => 'Group']);
    $localeId = Locale::create(['code' => 'th_PULB3', 'display_name' => 'Thai', 'enabled' => true])->id;

    $product = Product::create(['sku' => 'PULB3-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($group->id);

    $request = Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => $product->sku,
        'type' => 'simple',
        'enabled' => false,
        'category_ids' => [$group->id],
        'values' => [
            $productgroupname->id => ['ungrouped' => ['global' => ['default' => '', (string) $localeId => 'pulb3_group']]],
        ],
    ]);

    app(ProductController::class)->update($request, $product);

    expect($product->fresh()->categories()->pluck('categories.id')->all())->not->toContain($group->id);
});
