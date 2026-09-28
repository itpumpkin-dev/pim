<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\AttributeFamily;
use App\Models\Category;
use Illuminate\Http\Request;

/**
 * "ยกเลิกตั้งตระกูลให้ทุก/บางกลุ่มสินค้า" — the reverse of the existing
 * "set as default" flow covered by AttributeFamilySelectedGroupDefaultTest.
 * Covers the picker listing (productGroupsForUnassignPicker), the "all
 * groups" action (unsetDefaultForAllGroups) and the "selected groups" action
 * (unsetDefaultForSelectedGroups).
 */
function aufController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

function aufProductGroup(string $name = 'Group'): Category
{
    $root = Category::create(['code' => 'root_'.uniqid(), 'name' => 'Root']);
    $sub = Category::create(['code' => 'sub_'.uniqid(), 'name' => 'Sub', 'parent_id' => $root->id]);

    return Category::create(['code' => 'grp_'.uniqid(), 'name' => $name, 'parent_id' => $sub->id]);
}

test('productGroupsForUnassignPicker() only lists product groups this family is currently assigned to', function () {
    $family = AttributeFamily::create(['code' => 'unpicker_fam1']);
    $assigned = aufProductGroup('Assigned');
    $assigned->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
    aufProductGroup('Not Assigned');

    $response = aufController()->productGroupsForUnassignPicker(Request::create('/'), $family);
    $payload = json_decode($response->getContent(), true);
    $ids = collect($payload['data'])->pluck('id')->all();

    expect($ids)->toBe([$assigned->id]);
});

test('productGroupsForUnassignPicker() search filters by product group name', function () {
    $family = AttributeFamily::create(['code' => 'unpicker_fam2']);
    $match = aufProductGroup('Findable Widget');
    $match->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
    $unmatched = aufProductGroup('Something Else Entirely');
    $unmatched->attributeFamilies()->attach($family->id, ['sort_order' => 0]);

    $response = aufController()->productGroupsForUnassignPicker(Request::create('/', 'GET', ['search' => 'Findable']), $family);
    $payload = json_decode($response->getContent(), true);
    $ids = collect($payload['data'])->pluck('id')->all();

    expect($ids)->toBe([$match->id]);
});

test('productGroupsForUnassignPickerIds() returns every matching id unpaginated, for the "select all" button', function () {
    $family = AttributeFamily::create(['code' => 'unpicker_ids_fam1']);
    $assigned = [];
    for ($i = 0; $i < 20; $i++) {
        $group = aufProductGroup("Bulk {$i}");
        $group->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
        $assigned[] = $group->id;
    }
    $notAssigned = aufProductGroup('Not Assigned');

    $response = aufController()->productGroupsForUnassignPickerIds(Request::create('/'), $family);
    $payload = json_decode($response->getContent(), true);

    expect($payload['ids'])->toHaveCount(20);
    expect($payload['ids'])->toEqualCanonicalizing($assigned);
    expect($payload['ids'])->not->toContain($notAssigned->id);
});

test('productGroupsForUnassignPickerIds() honors the search filter', function () {
    $family = AttributeFamily::create(['code' => 'unpicker_ids_fam2']);
    $match = aufProductGroup('Findable Widget');
    $match->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
    $unmatched = aufProductGroup('Something Else Entirely');
    $unmatched->attributeFamilies()->attach($family->id, ['sort_order' => 0]);

    $response = aufController()->productGroupsForUnassignPickerIds(Request::create('/', 'GET', ['search' => 'Findable']), $family);
    $payload = json_decode($response->getContent(), true);

    expect($payload['ids'])->toBe([$match->id]);
});

test('unsetDefaultForAllGroups() detaches the family from every product group it is assigned to', function () {
    $family = AttributeFamily::create(['code' => 'unall_fam1']);
    $groupA = aufProductGroup('A');
    $groupA->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
    $groupB = aufProductGroup('B');
    $groupB->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
    $untouched = aufProductGroup('Untouched');

    aufController()->unsetDefaultForAllGroups($family, app(\App\Services\Catalog\DefaultAttributeFamilyAssigner::class));

    expect($groupA->attributeFamilies()->count())->toBe(0);
    expect($groupB->attributeFamilies()->count())->toBe(0);
    expect($untouched->attributeFamilies()->count())->toBe(0);
});

test('unsetDefaultForSelectedGroups() applies only to the selected product groups', function () {
    $family = AttributeFamily::create(['code' => 'unselect_fam1']);
    $selected = aufProductGroup('Selected');
    $selected->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
    $untouched = aufProductGroup('Untouched');
    $untouched->attributeFamilies()->attach($family->id, ['sort_order' => 0]);

    $request = Request::create('/', 'POST', ['category_ids' => [$selected->id]]);
    aufController()->unsetDefaultForSelectedGroups($request, $family, app(\App\Services\Catalog\DefaultAttributeFamilyAssigner::class));

    expect($selected->attributeFamilies()->count())->toBe(0);
    expect($untouched->attributeFamilies()->count())->toBe(1);
});

test('unsetDefaultForSelectedGroups() ignores a submitted category_id that is not a real leaf-level product group', function () {
    $family = AttributeFamily::create(['code' => 'unselect_fam2']);
    $root = Category::create(['code' => 'unselect_root_'.uniqid(), 'name' => 'A Root']);

    $request = Request::create('/', 'POST', ['category_ids' => [$root->id]]);

    aufController()->unsetDefaultForSelectedGroups($request, $family, app(\App\Services\Catalog\DefaultAttributeFamilyAssigner::class));

    expect($root->attributeFamilies()->count())->toBe(0);
});

test('unsetDefaultForSelectedGroups() rejects an empty category_ids list', function () {
    $family = AttributeFamily::create(['code' => 'unselect_fam3']);

    $request = Request::create('/', 'POST', ['category_ids' => []]);

    expect(fn () => aufController()->unsetDefaultForSelectedGroups($request, $family, app(\App\Services\Catalog\DefaultAttributeFamilyAssigner::class)))
        ->toThrow(\Illuminate\Validation\ValidationException::class);
});
