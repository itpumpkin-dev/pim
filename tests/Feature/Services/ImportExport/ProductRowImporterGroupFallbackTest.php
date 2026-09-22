<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\ImportConfig;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\ImportExport\Importers\ProductRowImporter;

/**
 * ProductRowImporter::importRow() used to updateOrCreate() a ProductValue
 * by product_id+attribute_id alone — nondeterministic once an attribute can
 * have more than one row (one per attribute_group_id placement, see
 * migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table):
 * it could silently overwrite whichever of the two group placements the DB
 * happened to match first. It now targets
 * EffectiveFamilyAttributeResolver::primaryGroupIdFor() deterministically
 * and must never touch the other group's row.
 */
function priImportConfig(array $overrides = []): ImportConfig
{
    return ImportConfig::create(array_merge([
        'code' => 'pri_config_'.uniqid(),
        'type' => 'products',
        'file_format' => 'csv',
        'field_separator' => ',',
        'action' => 'create_update',
        'validation_strategy' => 'skip_errors',
        'ai_translate' => false,
        'allowed_errors' => 10,
    ], $overrides));
}

test('importRow() writes to the primary (lowest id) group placement and never touches the other group', function () {
    $attribute = Attribute::create(['code' => 'pri_multi_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'pri_group_a']);
    $groupB = AttributeGroup::create(['code' => 'pri_group_b']);
    $family = AttributeFamily::create(['code' => 'pri_family', 'name' => 'PRI Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);
    expect($groupA->id)->toBeLessThan($groupB->id);

    $category = Category::create(['code' => 'pri_category', 'name' => 'PRI Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $sku = 'PRI-'.uniqid();
    $product = Product::create(['sku' => $sku, 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    // groupB already has its OWN value — must be left completely alone.
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'value' => 'group B text']);

    $importer = new ProductRowImporter();
    $importer->importRow(['sku' => $sku, 'type' => 'simple', 'enabled' => '1', 'pri_multi_attr' => 'imported text'], priImportConfig());

    $groupARow = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->where('attribute_group_id', $groupA->id)->first();
    $groupBRows = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->where('attribute_group_id', $groupB->id)->get();

    expect($groupARow)->not->toBeNull();
    expect($groupARow->value)->toBe('imported text');

    expect($groupBRows)->toHaveCount(1);
    expect($groupBRows->first()->value)->toBe('group B text');
});

test('importRow() still writes an ungrouped attribute with attribute_group_id = null (unchanged behavior)', function () {
    $attribute = Attribute::create(['code' => 'pri_ungrouped_attr', 'type' => 'text']);
    $sku = 'PRI-UNGROUPED-'.uniqid();

    $importer = new ProductRowImporter();
    $importer->importRow(['sku' => $sku, 'type' => 'simple', 'enabled' => '1', 'pri_ungrouped_attr' => 'plain text'], priImportConfig());

    $product = Product::where('sku', $sku)->firstOrFail();
    $row = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->first();

    expect($row)->not->toBeNull();
    expect($row->attribute_group_id)->toBeNull();
    expect($row->value)->toBe('plain text');
});
