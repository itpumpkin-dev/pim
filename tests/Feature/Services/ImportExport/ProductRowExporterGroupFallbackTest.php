<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\ExportConfig;
use App\Models\FamilyAttribute;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\ImportExport\Exporters\ProductRowExporter;

/**
 * ProductRowExporter::rows() used to pluck('value', 'attribute_id') — a
 * scalar per-attribute lookup that silently picked whichever of N rows the
 * DB happened to return last once an attribute could hold more than one
 * value (one per attribute_group_id placement, see migration
 * 2026_09_23_000001_add_attribute_group_id_to_product_values_table). It now
 * orders so the primary (lowest group id, NULL first) placement always wins
 * deterministically, matching EffectiveFamilyAttributeResolver::primaryGroupIdFor().
 */
test('rows() exports the primary (lowest id) group placement value for a multi-group attribute', function () {
    $attribute = Attribute::create(['code' => 'prexp_multi_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'prexp_group_a']);
    $groupB = AttributeGroup::create(['code' => 'prexp_group_b']);
    $family = AttributeFamily::create(['code' => 'prexp_family', 'name' => 'PREXP Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);
    expect($groupA->id)->toBeLessThan($groupB->id);

    $category = Category::create(['code' => 'prexp_category', 'name' => 'PREXP Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'PREXP-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'value' => 'From group B']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'value' => 'From group A']);

    $exporter = new ProductRowExporter();
    $rows = iterator_to_array($exporter->rows(new ExportConfig()));
    $row = collect($rows)->firstWhere('sku', $product->sku);

    expect($row['prexp_multi_attr'])->toBe('From group A');
});
