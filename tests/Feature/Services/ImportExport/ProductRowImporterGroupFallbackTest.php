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

test('importRow() places a brand-new SKU\'s values in the right group on the first pass (category linked before resolving groups)', function () {
    $attribute = Attribute::create(['code' => 'pri_new_sku_attr', 'type' => 'text']);
    $group = AttributeGroup::create(['code' => 'pri_new_sku_group']);
    $family = AttributeFamily::create(['code' => 'pri_new_sku_family', 'name' => 'PRI New SKU Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'pri_new_sku_cat', 'name' => 'PRI New SKU Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $sku = 'PRI-NEW-'.uniqid();
    expect(Product::where('sku', $sku)->exists())->toBeFalse();

    $importer = new ProductRowImporter();
    $importer->importRow(['sku' => $sku, 'type' => 'simple', 'enabled' => '1', 'productgroupname' => 'pri_new_sku_cat', 'pri_new_sku_attr' => 'first pass'], priImportConfig());

    $product = Product::where('sku', $sku)->firstOrFail();
    $rows = ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->get();

    expect($product->categories()->pluck('categories.id')->all())->toBe([$category->id]);
    expect($rows)->toHaveCount(1);
    expect($rows->first()->attribute_group_id)->toBe($group->id);
    expect($rows->first()->value)->toBe('first pass');
});

test('importRow() warns about category codes that match no category, and about a product left with no family', function () {
    $category = Category::create(['code' => 'pri_warn_cat', 'name' => 'PRI Warn Category']);
    $sku = 'PRI-WARN-'.uniqid();

    $warnings = (new ProductRowImporter())->importRow(
        ['sku' => $sku, 'type' => 'simple', 'enabled' => '1', 'psubcatname' => 'pri_warn_cat', 'productgroupname' => 'PRI_WARN_TYPO'],
        priImportConfig()
    );

    // the valid code is still linked — only the typo is reported
    $product = Product::where('sku', $sku)->firstOrFail();
    expect($product->categories()->pluck('categories.id')->all())->toBe([$category->id]);

    expect($warnings)->toContain('Category code(s) not found, product not linked to them: PRI_WARN_TYPO');
    // pri_warn_cat is bound to no family, so the product resolves none
    expect(collect($warnings)->contains(fn ($w) => str_starts_with($w, 'No Attribute Family resolved for this product')))->toBeTrue();
});

test('importRow() raises no category/family warning when the product group resolves a family', function () {
    $family = AttributeFamily::create(['code' => 'pri_ok_family', 'name' => 'PRI OK Family']);
    $category = Category::create(['code' => 'pri_ok_cat', 'name' => 'PRI OK Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $warnings = (new ProductRowImporter())->importRow(
        ['sku' => 'PRI-OK-'.uniqid(), 'type' => 'simple', 'enabled' => '1', 'productgroupname' => 'pri_ok_cat'],
        priImportConfig()
    );

    expect(collect($warnings)->contains(fn ($w) => str_starts_with($w, 'Category code(s) not found')))->toBeFalse();
    expect(collect($warnings)->contains(fn ($w) => str_starts_with($w, 'No Attribute Family resolved')))->toBeFalse();
});

test('importRow() skips a unique value already used by another product, but imports the rest of the row', function () {
    $barcode = Attribute::create(['code' => 'pri_uq_barcode', 'type' => 'text', 'is_unique' => true]);
    $other = Attribute::create(['code' => 'pri_uq_other', 'type' => 'text']);

    $owner = Product::create(['sku' => 'PRI-UQ-OWNER-'.uniqid(), 'type' => 'simple', 'enabled' => true]);
    ProductValue::create(['product_id' => $owner->id, 'attribute_id' => $barcode->id, 'value' => '8850000000001']);

    $sku = 'PRI-UQ-NEW-'.uniqid();
    $warnings = (new ProductRowImporter())->importRow(
        ['sku' => $sku, 'type' => 'simple', 'enabled' => '1', 'pri_uq_barcode' => '8850000000001', 'pri_uq_other' => 'kept'],
        priImportConfig()
    );

    $product = Product::where('sku', $sku)->firstOrFail();
    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $barcode->id)->exists())->toBeFalse();
    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $other->id)->value('value'))->toBe('kept');
    expect($warnings)->toContain("Value(s) must be unique but are already used by another product, not imported: pri_uq_barcode \"8850000000001\" (SKU {$owner->sku})");

    // re-importing the owner's own value is not a conflict
    $ownerWarnings = (new ProductRowImporter())->importRow(
        ['sku' => $owner->sku, 'type' => 'simple', 'enabled' => '1', 'pri_uq_barcode' => '8850000000001'],
        priImportConfig()
    );
    expect(collect($ownerWarnings)->contains(fn ($w) => str_starts_with($w, 'Value(s) must be unique')))->toBeFalse();
});

test('importRow() warns when a SKU repeats within the same file, naming the earlier row', function () {
    $attribute = Attribute::create(['code' => 'pri_dupsku_attr', 'type' => 'text']);
    $sku = 'PRI-DUPSKU-'.uniqid();
    $importer = new ProductRowImporter();
    $config = priImportConfig();

    $first = $importer->importRow(['sku' => $sku, 'pri_dupsku_attr' => 'first'], $config);                    // row 2
    $unrelated = $importer->importRow(['sku' => 'PRI-DUPSKU-OTHER-'.uniqid(), 'pri_dupsku_attr' => 'x'], $config); // row 3
    $repeat = $importer->importRow(['sku' => $sku, 'pri_dupsku_attr' => 'second'], $config);                   // row 4

    $isDupWarning = fn ($w) => str_contains($w, 'already appeared earlier in this file');
    expect(collect($first)->contains($isDupWarning))->toBeFalse();
    expect(collect($unrelated)->contains($isDupWarning))->toBeFalse();
    expect($repeat)->toContain("SKU {$sku} already appeared earlier in this file (row 2) — this row's values overwrite that row's.");

    // behavior unchanged: the later row still wins
    $product = Product::where('sku', $sku)->firstOrFail();
    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->value('value'))->toBe('second');
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
