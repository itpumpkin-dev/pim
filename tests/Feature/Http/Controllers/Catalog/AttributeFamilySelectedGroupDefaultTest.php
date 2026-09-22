<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\AttributeFamily;
use App\Models\Category;
use Illuminate\Http\Request;

/**
 * "กำหนดค่าเริ่มต้นบางกลุ่มสินค้า" — the new picker-driven counterpart to the
 * existing "set as default for ALL groups" button. Covers the two new
 * endpoints: the JSON picker listing (productGroupsForDefaultPicker) and the
 * write action (setDefaultForSelectedGroups).
 */
function afsController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

function afsProductGroup(string $name = 'Group'): Category
{
    $root = Category::create(['code' => 'root_'.uniqid(), 'name' => 'Root']);
    $sub = Category::create(['code' => 'sub_'.uniqid(), 'name' => 'Sub', 'parent_id' => $root->id]);

    return Category::create(['code' => 'grp_'.uniqid(), 'name' => $name, 'parent_id' => $sub->id]);
}

test('productGroupsForDefaultPicker() flags which product groups already have this family as default', function () {
    $family = AttributeFamily::create(['code' => 'picker_fam1']);
    $other = AttributeFamily::create(['code' => 'picker_other']);
    $alreadyDefault = afsProductGroup('Already Default');
    $alreadyDefault->attributeFamilies()->attach($family->id, ['sort_order' => 0]);
    $notDefault = afsProductGroup('Not Default');
    $notDefault->attributeFamilies()->attach($other->id, ['sort_order' => 0]);
    $noFamilyAtAll = afsProductGroup('No Family');

    $response = afsController()->productGroupsForDefaultPicker(Request::create('/'), $family);
    $payload = json_decode($response->getContent(), true);
    $byId = collect($payload['data'])->keyBy('id');

    expect($byId[$alreadyDefault->id]['is_default'])->toBeTrue();
    expect($byId[$notDefault->id]['is_default'])->toBeFalse();
    expect($byId[$noFamilyAtAll->id]['is_default'])->toBeFalse();
});

test('productGroupsForDefaultPicker() search filters by product group name', function () {
    $family = AttributeFamily::create(['code' => 'picker_fam2']);
    $match = afsProductGroup('Findable Widget');
    afsProductGroup('Something Else Entirely');

    $response = afsController()->productGroupsForDefaultPicker(Request::create('/', 'GET', ['search' => 'Findable']), $family);
    $payload = json_decode($response->getContent(), true);
    $ids = collect($payload['data'])->pluck('id')->all();

    expect($ids)->toBe([$match->id]);
});

test('setDefaultForSelectedGroups() applies only to the selected product groups', function () {
    $family = AttributeFamily::create(['code' => 'select_fam1']);
    $selected = afsProductGroup('Selected');
    $untouched = afsProductGroup('Untouched');

    $request = Request::create('/', 'POST', ['category_ids' => [$selected->id]]);
    afsController()->setDefaultForSelectedGroups($request, $family, app(\App\Services\Catalog\DefaultAttributeFamilyAssigner::class));

    expect($selected->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$family->id]);
    expect($untouched->attributeFamilies()->count())->toBe(0);
});

test('setDefaultForSelectedGroups() ignores a submitted category_id that is not a real leaf-level product group', function () {
    $family = AttributeFamily::create(['code' => 'select_fam2']);
    $root = Category::create(['code' => 'select_root_'.uniqid(), 'name' => 'A Root']);

    $request = Request::create('/', 'POST', ['category_ids' => [$root->id]]);
    afsController()->setDefaultForSelectedGroups($request, $family, app(\App\Services\Catalog\DefaultAttributeFamilyAssigner::class));

    expect($root->attributeFamilies()->count())->toBe(0);
});

test('setDefaultForSelectedGroups() rejects an empty category_ids list', function () {
    $family = AttributeFamily::create(['code' => 'select_fam3']);

    $request = Request::create('/', 'POST', ['category_ids' => []]);

    expect(fn () => afsController()->setDefaultForSelectedGroups($request, $family, app(\App\Services\Catalog\DefaultAttributeFamilyAssigner::class)))
        ->toThrow(\Illuminate\Validation\ValidationException::class);
});
