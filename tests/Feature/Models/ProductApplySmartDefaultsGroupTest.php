<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * Product::applySmartDefaults() (auto-fills pid/pname = SKU on a new/duplicated
 * product) used to write those rows with attribute_group_id always NULL —
 * a real bug once pid/pname are actually bound to a real group in
 * family_attributes (the common case: both are near-universally placed in
 * a "General"/ข้อมูลทั่วไป group). The mismatch (row saved as "ungrouped" while
 * the product edit page renders the field under the real group) meant the
 * field looked blank, and re-saving without touching it sent back the stale
 * 'ungrouped' groupKey, which ProductController::update() rejected outright
 * as "invalid group placement" — blocking a brand-new product from ever
 * being saved. Reproduces the exact real-world case (pid/pname bound to a
 * "general" group via family_attributes).
 */
test('applySmartDefaults() assigns pid/pname to their real bound group, not NULL/ungrouped', function () {
    $pidAttr = Attribute::firstOrCreate(['code' => 'pid'], ['type' => 'text']);
    $pnameAttr = Attribute::firstOrCreate(['code' => 'pname'], ['type' => 'text', 'is_locale_based' => true]);
    $generalGroup = AttributeGroup::create(['code' => 'psd_general_group']);
    $family = AttributeFamily::create(['code' => 'psd_family', 'name' => 'PSD Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $pidAttr->id, 'attribute_group_id' => $generalGroup->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $pnameAttr->id, 'attribute_group_id' => $generalGroup->id, 'sort_order' => 1]);

    $category = Category::create(['code' => 'psd_category', 'name' => 'PSD Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'TH', 'enabled' => true]);

    $product = Product::create(['sku' => 'PSD-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    $product->applySmartDefaults();

    $pidRow = ProductValue::where('product_id', $product->id)->where('attribute_id', $pidAttr->id)->first();
    $pnameRows = ProductValue::where('product_id', $product->id)->where('attribute_id', $pnameAttr->id)->get();

    expect($pidRow)->not->toBeNull();
    expect($pidRow->attribute_group_id)->toBe($generalGroup->id);
    expect($pidRow->value)->toBe($product->sku);

    expect($pnameRows)->not->toBeEmpty();
    foreach ($pnameRows as $row) {
        expect($row->attribute_group_id)->toBe($generalGroup->id);
    }
});

test('applySmartDefaults() leaves attribute_group_id null for a product with no effective family (unchanged behavior)', function () {
    Attribute::firstOrCreate(['code' => 'pid'], ['type' => 'text']);
    Attribute::firstOrCreate(['code' => 'pname'], ['type' => 'text', 'is_locale_based' => true]);
    Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'TH', 'enabled' => true]);

    $product = Product::create(['sku' => 'PSD-NOFAMILY-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    $product->applySmartDefaults();

    $pidAttr = Attribute::where('code', 'pid')->first();
    $row = ProductValue::where('product_id', $product->id)->where('attribute_id', $pidAttr->id)->first();

    expect($row)->not->toBeNull();
    expect($row->attribute_group_id)->toBeNull();
});
