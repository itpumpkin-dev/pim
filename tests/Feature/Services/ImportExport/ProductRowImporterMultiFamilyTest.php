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
