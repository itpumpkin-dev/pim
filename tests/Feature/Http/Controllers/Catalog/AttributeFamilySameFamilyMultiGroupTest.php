<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The user asked for attribute reuse WITHIN the same family (across its own
 * groups) — not across families. family_attributes used to have a composite
 * primary key (family_id, attribute_id), which made this physically
 * impossible (only ever one row per family+attribute pair). Migration
 * 2026_09_22_000002_allow_same_family_multi_group_family_attributes swaps
 * that for a surrogate `id` PK + a (family_id, attribute_id, attribute_group_id)
 * unique constraint, so the same attribute can now sit in two different
 * groups of one family. These tests lock that in at the controller level.
 */
function afmController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

test('store() can place the same attribute into two different groups of the same new family', function () {
    $attribute = Attribute::create(['code' => 'multi_group_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'group_a']);
    $groupB = AttributeGroup::create(['code' => 'group_b']);

    $request = Request::create('/catalog/attributeFamilies', 'POST', [
        'group_attributes' => [
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id],
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id],
        ],
    ]);

    afmController()->store($request);

    $family = AttributeFamily::firstOrFail();
    $rows = FamilyAttribute::where('family_id', $family->id)->where('attribute_id', $attribute->id)->get();
    expect($rows)->toHaveCount(2);
    $expected = collect([$groupA->id, $groupB->id])->sort()->values()->all();
    expect($rows->pluck('attribute_group_id')->sort()->values()->all())->toBe($expected);
});

test('update() can add a second group placement for an attribute already in the family', function () {
    $attribute = Attribute::create(['code' => 'multi_group_attr2', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'group_a2']);
    $groupB = AttributeGroup::create(['code' => 'group_b2']);
    $family = AttributeFamily::create(['code' => 'multi_group_family', 'name' => 'Multi Group Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);

    $request = Request::create("/catalog/attributeFamilies/{$family->id}", 'PUT', [
        'group_attributes' => [
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id],
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id],
        ],
    ]);

    afmController()->update($request, $family);

    $rows = FamilyAttribute::where('family_id', $family->id)->where('attribute_id', $attribute->id)->get();
    expect($rows)->toHaveCount(2);
});

test('store() rejects the exact same (attribute_id, attribute_group_id) pair submitted twice', function () {
    $attribute = Attribute::create(['code' => 'dup_pair_attr', 'type' => 'text']);
    $group = AttributeGroup::create(['code' => 'dup_pair_group']);

    $request = Request::create('/catalog/attributeFamilies', 'POST', [
        'group_attributes' => [
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $group->id],
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $group->id],
        ],
    ]);

    expect(fn () => afmController()->store($request))->toThrow(ValidationException::class);
    expect(AttributeFamily::count())->toBe(0);
});

test('update() rejects the exact same (attribute_id, attribute_group_id) pair submitted twice', function () {
    $attribute = Attribute::create(['code' => 'dup_pair_attr2', 'type' => 'text']);
    $group = AttributeGroup::create(['code' => 'dup_pair_group2']);
    $family = AttributeFamily::create(['code' => 'dup_pair_family', 'name' => 'Dup Pair Family']);

    $request = Request::create("/catalog/attributeFamilies/{$family->id}", 'PUT', [
        'group_attributes' => [
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $group->id],
            ['attribute_id' => $attribute->id, 'attribute_group_id' => $group->id],
        ],
    ]);

    expect(fn () => afmController()->update($request, $family))->toThrow(ValidationException::class);
    expect(FamilyAttribute::where('family_id', $family->id)->count())->toBe(0);
});
