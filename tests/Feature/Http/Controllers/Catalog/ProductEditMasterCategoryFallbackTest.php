<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\Request;

/**
 * Bug: a product with a real `product_category` pivot row but no
 * pcatname/psubcatname/productgroupname ProductValue rows (e.g. the pivot
 * was synced from elsewhere and ProductCategoryLinker::
 * deriveLegacyCodesFromCategories() never ran for it) rendered the "หมวดหมู่/
 * หมวดหมู่ย่อย/กลุ่มสินค้า" panel on the Edit Product page completely empty,
 * even though the product IS assigned to a category. buildProductFormProps()
 * now falls back to ProductCategoryLinker::legacyCodesFromCategories() (read
 * -only, no DB write) whenever the ProductValue-backed value is missing.
 */
function pemcController(): ProductController
{
    return app(ProductController::class);
}

function pemcInertiaProps(\Inertia\Response $response): array
{
    $request = Request::create('/');
    $request->headers->set('X-Inertia', 'true');

    return json_decode($response->toResponse($request)->getContent(), true)['props'];
}

test('the master category panel falls back to the category pivot when no ProductValue exists for it', function () {
    $pcatname = Attribute::create(['code' => 'pcatname', 'type' => 'select']);
    $psubcatname = Attribute::create(['code' => 'psubcatname', 'type' => 'select']);
    $productgroupname = Attribute::create(['code' => 'productgroupname', 'type' => 'select']);

    $root = Category::create(['code' => 'pemc_root', 'name' => 'Root']);
    $sub = Category::create(['code' => 'pemc_sub', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'pemc_group', 'name' => 'Group', 'parent_id' => $sub->id]);

    AttributeOption::create(['attribute_id' => $pcatname->id, 'code' => 'pemc_root', 'admin_label' => 'Root']);
    AttributeOption::create(['attribute_id' => $psubcatname->id, 'code' => 'pemc_sub', 'admin_label' => 'Sub']);
    AttributeOption::create(['attribute_id' => $productgroupname->id, 'code' => 'pemc_group', 'admin_label' => 'Group']);

    $product = Product::create(['sku' => 'PEMC-PRODUCT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    // Only the pivot is set — no ProductValue rows for pcatname/psubcatname/
    // productgroupname at all, reproducing the reported drift.
    $product->categories()->attach($group->id);

    $props = pemcInertiaProps(pemcController()->edit(Request::create('/'), $product));

    expect($props['categoryIds'])->toBe([$group->id]);

    $valueFor = fn (int $attributeId) => collect($props['productValues'][$attributeId]['ungrouped'] ?? [])
        ->flatMap(fn ($byLocale) => $byLocale)
        ->first(fn ($v) => is_string($v) && $v !== '');

    expect($valueFor($pcatname->id))->toBe('pemc_root');
    expect($valueFor($psubcatname->id))->toBe('pemc_sub');
    expect($valueFor($productgroupname->id))->toBe('pemc_group');

    // Nothing was persisted by merely loading the Edit page (GET should stay
    // read-only) — the fallback is computed in-memory only.
    expect(\App\Models\ProductValue::where('product_id', $product->id)->count())->toBe(0);
});

test('the master category panel prefers an existing ProductValue over the pivot-derived fallback', function () {
    $pcatname = Attribute::create(['code' => 'pcatname', 'type' => 'select']);
    $root = Category::create(['code' => 'pemc_root2', 'name' => 'Root']);
    $otherRoot = Category::create(['code' => 'pemc_other_root2', 'name' => 'Other Root']);

    AttributeOption::create(['attribute_id' => $pcatname->id, 'code' => 'pemc_root2', 'admin_label' => 'Root']);
    AttributeOption::create(['attribute_id' => $pcatname->id, 'code' => 'pemc_other_root2', 'admin_label' => 'Other Root']);

    $product = Product::create(['sku' => 'PEMC-PRODUCT2-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($root->id);
    \App\Models\ProductValue::create(['product_id' => $product->id, 'attribute_id' => $pcatname->id, 'value' => 'pemc_other_root2']);

    $props = pemcInertiaProps(pemcController()->edit(Request::create('/'), $product));

    $valueFor = fn (int $attributeId) => collect($props['productValues'][$attributeId]['ungrouped'] ?? [])
        ->flatMap(fn ($byLocale) => $byLocale)
        ->first(fn ($v) => is_string($v) && $v !== '');

    expect($valueFor($pcatname->id))->toBe('pemc_other_root2');
});
