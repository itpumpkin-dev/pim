<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use Illuminate\Http\Request;

/**
 * "Use Template From..." button on the Attribute Family edit page — lets an
 * admin pick another family and preview its group/attribute structure
 * before appending it to the one being edited. templatePreview() is the
 * read-only endpoint behind that preview step; edit() additionally exposes
 * the list of candidate template families (every other family).
 */
function atpController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

function atpEditProps(\Inertia\Response $response): array
{
    $request = Request::create('/');
    $request->headers->set('X-Inertia', 'true');

    return json_decode($response->toResponse($request)->getContent(), true)['props'];
}

test('create() lists every existing attribute family as a template candidate', function () {
    $family = AttributeFamily::create(['code' => 'atp_create_candidate', 'name' => 'Create Candidate']);

    $request = Request::create('/');
    $request->headers->set('X-Inertia', 'true');
    $props = json_decode(atpController()->create()->toResponse($request)->getContent(), true)['props'];

    expect(collect($props['otherFamilies'])->pluck('id'))->toContain($family->id);
});

test('edit() lists every other attribute family as a template candidate, excluding itself', function () {
    $current = AttributeFamily::create(['code' => 'atp_current', 'name' => 'Current']);
    $other = AttributeFamily::create(['code' => 'atp_other', 'name' => 'Other']);

    $props = atpEditProps(atpController()->edit($current));

    $ids = collect($props['otherFamilies'])->pluck('id');
    expect($ids)->toContain($other->id);
    expect($ids)->not->toContain($current->id);
});

test('templatePreview() returns the given family\'s group/attribute structure', function () {
    $template = AttributeFamily::create(['code' => 'atp_template', 'name' => 'Template']);
    $group = AttributeGroup::create(['code' => 'atp_template_group']);
    $attribute = Attribute::create(['code' => 'atp_template_attr', 'type' => 'text']);
    FamilyAttribute::create(['family_id' => $template->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);

    $response = atpController()->templatePreview($template);
    $payload = json_decode($response->getContent(), true);

    expect($payload['family']['id'])->toBe($template->id);
    expect($payload['familyAttributes'])->toHaveCount(1);
    expect($payload['familyAttributes'][0]['attribute_group_id'])->toBe($group->id);
    expect($payload['familyAttributes'][0]['attribute']['code'])->toBe('atp_template_attr');
});

test('templatePreview() returns an empty structure for a family with no groups/attributes', function () {
    $emptyTemplate = AttributeFamily::create(['code' => 'atp_empty_template', 'name' => 'Empty']);

    $response = atpController()->templatePreview($emptyTemplate);
    $payload = json_decode($response->getContent(), true);

    expect($payload['familyAttributes'])->toBe([]);
});
