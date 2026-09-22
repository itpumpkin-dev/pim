<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\Attribute;
use App\Models\AttributeGroup;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The whole NULL-sentinel design for product_values.attribute_group_id
 * (see migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table)
 * depends on system/master-category/variant-axis attributes never being
 * assignable into a family_attributes group. Previously that was only a
 * convention — nothing stopped an admin from doing it. These tests confirm
 * the picker excludes them and the write path rejects them outright.
 */
function asaeController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

test('create() excludes system attribute codes from the attribute picker', function () {
    $pcatname = Attribute::firstOrCreate(['code' => 'pcatname'], ['type' => 'select']);
    $regular = Attribute::create(['code' => 'asae_regular', 'type' => 'text']);

    $response = asaeController()->create();
    $props = $response->toResponse(Request::create('/', 'GET', [], [], [], ['HTTP_X_INERTIA' => 'true']))->getContent();
    $props = json_decode($props, true)['props'];

    $codes = collect($props['attributes'])->pluck('code');

    expect($codes)->not->toContain('pcatname');
    expect($codes)->toContain('asae_regular');
});

test('store() rejects a group_attributes entry pointing at a system attribute', function () {
    $group = AttributeGroup::create(['code' => 'asae_group']);
    $producttype = Attribute::firstOrCreate(['code' => 'producttype'], ['type' => 'select']);

    $request = Request::create('/catalog/attributeFamilies', 'POST', [
        'group_attributes' => [
            ['attribute_id' => $producttype->id, 'attribute_group_id' => $group->id],
        ],
    ]);

    expect(fn () => asaeController()->store($request))->toThrow(ValidationException::class);
});
