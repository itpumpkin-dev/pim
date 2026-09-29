<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\AttributeFamily;
use App\Models\Category;
use Illuminate\Http\Request;

/**
 * แท็บ "จัดการ" บนหน้า index ตระกูลแอตทริบิวต์ — defaultAssignments() คืนหนึ่งแถว
 * ต่อกลุ่มสินค้า พร้อมตระกูลที่เป็นค่าเริ่มต้น (sort_order ต่ำสุด) ของกลุ่มนั้น
 */
function dafAssignments(array $query = []): array
{
    $response = app(AttributeFamilyController::class)->defaultAssignments(Request::create('/', 'GET', $query));

    return json_decode($response->getContent(), true);
}

function dafProductGroup(string $name = 'Group'): Category
{
    $root = Category::create(['code' => 'root_'.uniqid(), 'name' => 'Root']);
    $sub = Category::create(['code' => 'sub_'.uniqid(), 'name' => 'Sub', 'parent_id' => $root->id]);

    return Category::create(['code' => 'grp_'.uniqid(), 'name' => $name, 'parent_id' => $sub->id]);
}

test('defaultAssignments() lists only the default (first) family per product group', function () {
    $default = AttributeFamily::create(['code' => 'daf_default', 'name' => 'Default Fam']);
    $extra = AttributeFamily::create(['code' => 'daf_extra', 'name' => 'Extra Fam']);
    $group = dafProductGroup('Shoes');
    $group->attributeFamilies()->attach([$default->id => ['sort_order' => 0], $extra->id => ['sort_order' => 1]]);
    dafProductGroup('No Family');

    $payload = dafAssignments();

    expect($payload['total'])->toBe(1);
    expect($payload['data'][0])->toMatchArray([
        'family_id' => $default->id,
        'family_code' => 'daf_default',
        'group_id' => $group->id,
        'group_name' => 'Shoes',
        'subcategory_name' => 'Sub',
        'category_name' => 'Root',
    ]);
});

test('defaultAssignments() filters by family_id and by search on family or group', function () {
    $famA = AttributeFamily::create(['code' => 'daf_a', 'name' => 'Alpha']);
    $famB = AttributeFamily::create(['code' => 'daf_b', 'name' => 'Beta']);
    $g1 = dafProductGroup('Findable Widget');
    $g1->attributeFamilies()->attach($famA->id, ['sort_order' => 0]);
    $g2 = dafProductGroup('Other');
    $g2->attributeFamilies()->attach($famB->id, ['sort_order' => 0]);

    expect(collect(dafAssignments(['family_id' => $famB->id])['data'])->pluck('group_id')->all())->toBe([$g2->id]);
    expect(collect(dafAssignments(['search' => 'Findable'])['data'])->pluck('group_id')->all())->toBe([$g1->id]);
    expect(collect(dafAssignments(['search' => 'daf_b'])['data'])->pluck('group_id')->all())->toBe([$g2->id]);
});
