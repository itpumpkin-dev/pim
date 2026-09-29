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
});
