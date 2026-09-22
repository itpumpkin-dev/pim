<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use Illuminate\Http\Request;

/**
 * The "attribute picker" on the Attribute Family create/edit pages must not
 * offer an attribute that is already attached to a DIFFERENT family — the
 * user reported that attributes get silently "fought over" between families
 * otherwise (family_attributes has no exclusivity constraint at the DB level:
 * its primary key is the composite (family_id, attribute_id), so the same
 * attribute_id can legally sit under many families at once).
 *
 * No route/permission-middleware test precedent exists in this codebase (see
 * ProductControllerSkuAndTemplateTest.php) — these call the controller
 * methods directly and decode the Inertia JSON response (X-Inertia header)
 * to inspect the `attributes` prop, the same workaround used there.
 */
function afcController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

function afcInertiaProps(\Inertia\Response $response): array
{
    $request = Request::create('/');
    $request->headers->set('X-Inertia', 'true');

    return json_decode($response->toResponse($request)->getContent(), true)['props'];
}

test('create() offers only attributes that are not attached to any family yet', function () {
    $unassigned = Attribute::create(['code' => 'free_attr', 'type' => 'text']);
    $claimed = Attribute::create(['code' => 'claimed_attr', 'type' => 'text']);

    $otherFamily = AttributeFamily::create(['code' => 'other_family', 'name' => 'Other Family']);
    $group = AttributeGroup::create(['code' => 'general']);
    FamilyAttribute::create([
        'family_id' => $otherFamily->id,
        'attribute_id' => $claimed->id,
        'attribute_group_id' => $group->id,
        'sort_order' => 0,
    ]);

    $props = afcInertiaProps(afcController()->create());
    $offeredIds = collect($props['attributes'])->pluck('id')->all();

    expect($offeredIds)->toContain($unassigned->id);
    expect($offeredIds)->not->toContain($claimed->id);
});

test('edit() offers unclaimed attributes and this family\'s own attributes, but not another family\'s', function () {
    $unassigned = Attribute::create(['code' => 'free_attr2', 'type' => 'text']);
    $ownAttr = Attribute::create(['code' => 'own_attr', 'type' => 'text']);
    $stolenFromOther = Attribute::create(['code' => 'other_attr', 'type' => 'text']);

    $thisFamily = AttributeFamily::create(['code' => 'this_family', 'name' => 'This Family']);
    $otherFamily = AttributeFamily::create(['code' => 'other_family2', 'name' => 'Other Family 2']);
    $group = AttributeGroup::create(['code' => 'general2']);

    FamilyAttribute::create([
        'family_id' => $thisFamily->id,
        'attribute_id' => $ownAttr->id,
        'attribute_group_id' => $group->id,
        'sort_order' => 0,
    ]);
    FamilyAttribute::create([
        'family_id' => $otherFamily->id,
        'attribute_id' => $stolenFromOther->id,
        'attribute_group_id' => $group->id,
        'sort_order' => 0,
    ]);

    $props = afcInertiaProps(afcController()->edit($thisFamily));
    $offeredIds = collect($props['attributes'])->pluck('id')->all();

    expect($offeredIds)->toContain($unassigned->id);
    expect($offeredIds)->toContain($ownAttr->id);
    expect($offeredIds)->not->toContain($stolenFromOther->id);
});

test('create() still offers an attribute already attached to another family when it is marked is_shared', function () {
    $shared = Attribute::create(['code' => 'shared_attr', 'type' => 'text', 'is_shared' => true]);

    $otherFamily = AttributeFamily::create(['code' => 'other_family3', 'name' => 'Other Family 3']);
    $group = AttributeGroup::create(['code' => 'general3']);
    FamilyAttribute::create([
        'family_id' => $otherFamily->id,
        'attribute_id' => $shared->id,
        'attribute_group_id' => $group->id,
        'sort_order' => 0,
    ]);

    $props = afcInertiaProps(afcController()->create());
    $offeredIds = collect($props['attributes'])->pluck('id')->all();

    expect($offeredIds)->toContain($shared->id);
});

test('edit() of a different family still offers an is_shared attribute already attached elsewhere', function () {
    $shared = Attribute::create(['code' => 'shared_attr2', 'type' => 'text', 'is_shared' => true]);

    $thisFamily = AttributeFamily::create(['code' => 'this_family2', 'name' => 'This Family 2']);
    $otherFamily = AttributeFamily::create(['code' => 'other_family4', 'name' => 'Other Family 4']);
    $group = AttributeGroup::create(['code' => 'general4']);
    FamilyAttribute::create([
        'family_id' => $otherFamily->id,
        'attribute_id' => $shared->id,
        'attribute_group_id' => $group->id,
        'sort_order' => 0,
    ]);

    $props = afcInertiaProps(afcController()->edit($thisFamily));
    $offeredIds = collect($props['attributes'])->pluck('id')->all();

    expect($offeredIds)->toContain($shared->id);
});
