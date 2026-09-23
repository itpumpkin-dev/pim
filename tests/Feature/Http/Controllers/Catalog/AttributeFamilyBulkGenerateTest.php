<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use Illuminate\Http\Request;

/**
 * "สร้างตามกลุ่มสินค้า" — one Attribute Family per selected Product Group,
 * named from a user pattern (the "{name}" token), optionally cloning another
 * family's groups/attributes into every one created. See
 * AttributeFamilyBulkGenerator for the actual generation logic; this covers
 * the controller's own validation/wiring plus the picker endpoint.
 */
function abgController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

function abgLeafCategory(string $code, string $name): Category
{
    $root = Category::create(['code' => $code.'_root', 'name' => $code.' root']);
    $sub = Category::create(['code' => $code.'_sub', 'name' => $code.' sub', 'parent_id' => $root->id]);

    return Category::create(['code' => $code, 'name' => $name, 'parent_id' => $sub->id]);
}

test('productGroupsForBulkGenerate() lists product groups regardless of whether they already have a family', function () {
    $withFamily = abgLeafCategory('abg_with_family', 'Has Family');
    $withoutFamily = abgLeafCategory('abg_without_family', 'No Family');

    $family = AttributeFamily::create(['code' => 'abg_existing', 'name' => 'Existing']);
    DB::table('category_attribute_family')->insert(['category_id' => $withFamily->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $response = abgController()->productGroupsForBulkGenerate(Request::create('/'));
    $payload = json_decode($response->getContent(), true);
    $ids = collect($payload['data'])->pluck('id')->all();

    expect($ids)->toContain($withoutFamily->id)
        ->and($ids)->toContain($withFamily->id);
});

test('productGroupsForBulkGenerateIds() returns every matching id unpaginated, for the dialog\'s "select all" action', function () {
    $matching = abgLeafCategory('abg_ids_findme', 'Findable Widget');
    $other = abgLeafCategory('abg_ids_other', 'Something Else');

    $response = abgController()->productGroupsForBulkGenerateIds(Request::create('/', 'GET', ['search' => 'Findable']));
    $payload = json_decode($response->getContent(), true);

    expect($payload['ids'])->toContain($matching->id)
        ->and($payload['ids'])->not->toContain($other->id);
});

test('bulkGenerate() creates one family per selected product group, named from the pattern', function () {
    $groupA = abgLeafCategory('abg_glue_a', 'กาวซิลิโคน');
    $groupB = abgLeafCategory('abg_glue_b', 'กาวอีพ็อกซี่');

    $request = Request::create('/', 'POST', [
        'category_ids' => [$groupA->id, $groupB->id],
        'name_pattern' => 'สเปค-{name}',
    ]);

    abgController()->bulkGenerate($request, app(App\Services\Catalog\AttributeFamilyBulkGenerator::class));

    $groupA->refresh();
    $groupB->refresh();

    $familyA = $groupA->attributeFamilies()->first();
    $familyB = $groupB->attributeFamilies()->first();

    expect($familyA)->not->toBeNull()
        ->and($familyA->name)->toBe('สเปค-กาวซิลิโคน')
        ->and($familyB)->not->toBeNull()
        ->and($familyB->name)->toBe('สเปค-กาวอีพ็อกซี่');
});

test('bulkGenerate() appends the new family after an existing one instead of replacing it', function () {
    $group = abgLeafCategory('abg_already_bound', 'Already Bound');
    $existing = AttributeFamily::create(['code' => 'abg_pre_existing', 'name' => 'Pre-existing']);
    DB::table('category_attribute_family')->insert(['category_id' => $group->id, 'family_id' => $existing->id, 'sort_order' => 0]);

    $request = Request::create('/', 'POST', [
        'category_ids' => [$group->id],
        'name_pattern' => 'สเปค-{name}',
    ]);

    abgController()->bulkGenerate($request, app(App\Services\Catalog\AttributeFamilyBulkGenerator::class));

    $group->refresh();
    $families = $group->attributeFamilies;

    expect($families)->toHaveCount(2)
        // sort_order 0 (the "default") must still be the pre-existing family — untouched.
        ->and($families->first()->id)->toBe($existing->id)
        ->and($families->last()->name)->toBe('สเปค-Already Bound');
});

test('bulkGenerate() clones the template family\'s groups/attributes but not its name', function () {
    $group = abgLeafCategory('abg_template_target', 'Template Target');
    $attributeGroup = AttributeGroup::create(['code' => 'abg_group']);
    $attribute = Attribute::create(['code' => 'abg_attr', 'type' => 'text']);

    $template = AttributeFamily::create(['code' => 'abg_template', 'name' => 'Template Family']);
    FamilyAttribute::create([
        'family_id' => $template->id,
        'attribute_id' => $attribute->id,
        'attribute_group_id' => $attributeGroup->id,
        'sort_order' => 0,
    ]);

    $request = Request::create('/', 'POST', [
        'category_ids' => [$group->id],
        'name_pattern' => 'สเปค-{name}',
        'template_family_id' => $template->id,
    ]);

    abgController()->bulkGenerate($request, app(App\Services\Catalog\AttributeFamilyBulkGenerator::class));

    $group->refresh();
    $newFamily = $group->attributeFamilies()->first();

    expect($newFamily->name)->toBe('สเปค-Template Target')
        ->and(FamilyAttribute::where('family_id', $newFamily->id)->count())->toBe(1)
        ->and(FamilyAttribute::where('family_id', $newFamily->id)->first()->attribute_id)->toBe($attribute->id);
});

test('bulkGenerate() rejects a name pattern without the {name} token', function () {
    $group = abgLeafCategory('abg_bad_pattern', 'Bad Pattern');

    $request = Request::create('/', 'POST', [
        'category_ids' => [$group->id],
        'name_pattern' => 'สเปค-ไม่มี token',
    ]);

    expect(fn () => abgController()->bulkGenerate($request, app(App\Services\Catalog\AttributeFamilyBulkGenerator::class)))
        ->toThrow(\Illuminate\Validation\ValidationException::class);
});

test('bulkGenerate() generates unique codes when two selected groups share the same name', function () {
    $groupA = abgLeafCategory('abg_dup_a', 'Duplicate Name');
    $groupB = abgLeafCategory('abg_dup_b', 'Duplicate Name');

    $request = Request::create('/', 'POST', [
        'category_ids' => [$groupA->id, $groupB->id],
        'name_pattern' => 'สเปค-{name}',
    ]);

    abgController()->bulkGenerate($request, app(App\Services\Catalog\AttributeFamilyBulkGenerator::class));

    $groupA->refresh();
    $groupB->refresh();
    $codeA = $groupA->attributeFamilies()->first()->code;
    $codeB = $groupB->attributeFamilies()->first()->code;

    expect($codeA)->not->toBe($codeB);
});
