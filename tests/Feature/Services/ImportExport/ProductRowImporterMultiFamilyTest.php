<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Services\ImportExport\Importers\ProductRowImporter;

/**
 * Import wizard's "family" step now resolves the Attribute Family/Families
 * bound to a chosen Product Group (a leaf Category) via
 * category_attribute_family, instead of a flat single-family picker — and a
 * Product Group can bind more than one family (confirmed against real data:
 * category 210 binds both family_1 and general_chemical_product-copy_1).
 * $familyCode can therefore hold a comma-separated list, and columns()
 * must return the *union* of every listed family's attributes.
 */
test('columns() unions attributes across a comma-separated list of family codes', function () {
    $attrA = Attribute::create(['code' => 'mf_attr_a', 'type' => 'text']);
    $attrB = Attribute::create(['code' => 'mf_attr_b', 'type' => 'text']);
    $attrC = Attribute::create(['code' => 'mf_attr_c', 'type' => 'text']);

    $group = AttributeGroup::create(['code' => 'mf_group']);
    $familyA = AttributeFamily::create(['code' => 'mf_family_a', 'name' => 'Family A']);
    $familyB = AttributeFamily::create(['code' => 'mf_family_b', 'name' => 'Family B']);
    $familyA->attributes()->attach([
        $attrA->id => ['attribute_group_id' => $group->id],
        $attrB->id => ['attribute_group_id' => $group->id],
    ]);
    $familyB->attributes()->attach([
        $attrB->id => ['attribute_group_id' => $group->id],
        $attrC->id => ['attribute_group_id' => $group->id],
    ]);

    $importer = new ProductRowImporter(null, null, 'mf_family_a,mf_family_b');
    $columns = $importer->columns();

    expect($columns)->toContain('mf_attr_a', 'mf_attr_b', 'mf_attr_c');
});

test('columns() still narrows to a single family when only one code is given', function () {
    $attrA = Attribute::create(['code' => 'mf_solo_a', 'type' => 'text']);
    $attrB = Attribute::create(['code' => 'mf_solo_b', 'type' => 'text']);

    $group = AttributeGroup::create(['code' => 'mf_solo_group']);
    $family = AttributeFamily::create(['code' => 'mf_solo_family', 'name' => 'Solo Family']);
    $family->attributes()->attach([$attrA->id => ['attribute_group_id' => $group->id]]);

    $importer = new ProductRowImporter(null, null, 'mf_solo_family');
    $columns = $importer->columns();

    expect($columns)->toContain('mf_solo_a')->not->toContain('mf_solo_b');
});

test('columns() applies no family scoping when family_code is blank', function () {
    Attribute::create(['code' => 'mf_unscoped_a', 'type' => 'text']);

    $importer = new ProductRowImporter(null, null, null);

    expect($importer->columns())->toContain('mf_unscoped_a');
});

test('columns() lists locale-based family attributes, in family sort order', function () {
    $second = Attribute::create(['code' => 'mf_loc_second', 'type' => 'text', 'is_locale_based' => true]);
    $first = Attribute::create(['code' => 'mf_loc_first', 'type' => 'text', 'is_locale_based' => true]);
    $channel = Attribute::create(['code' => 'mf_loc_channel', 'type' => 'text', 'is_channel_based' => true]);

    $group = AttributeGroup::create(['code' => 'mf_loc_group']);
    $family = AttributeFamily::create(['code' => 'mf_loc_family', 'name' => 'Locale Family']);
    $family->attributes()->attach([
        $second->id => ['attribute_group_id' => $group->id, 'sort_order' => 2],
        $first->id => ['attribute_group_id' => $group->id, 'sort_order' => 1],
        $channel->id => ['attribute_group_id' => $group->id, 'sort_order' => 3],
    ]);

    $columns = (new ProductRowImporter(null, null, 'mf_loc_family'))->columns();

    $familyColumns = array_values(array_filter($columns, fn ($c) => str_starts_with($c, 'mf_loc_')));
    // locale-based now importable (lands in the global scope); channel-based still not
    expect($familyColumns)->toBe(['mf_loc_first', 'mf_loc_second']);
});

test('columns() always offers the category columns first, even when scoped to a family that lacks them', function () {
    foreach (ProductRowImporter::CATEGORY_COLUMNS as $code) {
        Attribute::firstOrCreate(['code' => $code], ['type' => 'select', 'is_locale_based' => true]);
    }
    $attr = Attribute::create(['code' => 'mf_cat_attr', 'type' => 'text']);
    $group = AttributeGroup::create(['code' => 'mf_cat_group']);
    $family = AttributeFamily::create(['code' => 'mf_cat_family', 'name' => 'Cat Family']);
    $family->attributes()->attach([$attr->id => ['attribute_group_id' => $group->id]]);

    $columns = (new ProductRowImporter(null, null, 'mf_cat_family'))->columns();

    expect(array_slice($columns, 0, 8))->toBe([
        'sku', 'type', 'enabled', 'status', 'pcatname', 'psubcatname', 'productgroupname', 'mf_cat_attr',
    ]);
});
