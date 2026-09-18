<?php

use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use App\Services\Catalog\DefaultAttributeFamilyAssigner;

function makeProductGroup(): Category
{
    $root = Category::create(['code' => 'root_'.uniqid(), 'name' => 'Root']);
    $sub = Category::create(['code' => 'sub_'.uniqid(), 'name' => 'Sub', 'parent_id' => $root->id]);

    return Category::create(['code' => 'grp_'.uniqid(), 'name' => 'Group', 'parent_id' => $sub->id]);
}

beforeEach(function () {
    $this->assigner = new DefaultAttributeFamilyAssigner();
});

test('a root or subcategory (not a real depth-3 product group) is never touched', function () {
    $root = Category::create(['code' => 'root_'.uniqid(), 'name' => 'Root']);
    $sub = Category::create(['code' => 'sub_'.uniqid(), 'name' => 'Sub', 'parent_id' => $root->id]);
    $family = AttributeFamily::create(['code' => 'fam1']);

    $result = $this->assigner->assignToAllProductGroups($family);

    expect($result)->toBe(['updated' => 0, 'skipped' => 0]);
    expect($root->attributeFamilies()->count())->toBe(0);
    expect($sub->attributeFamilies()->count())->toBe(0);
});

test('assigns the family as the default (sort_order 0) for a group that has none yet', function () {
    $group = makeProductGroup();
    $family = AttributeFamily::create(['code' => 'fam1']);

    $result = $this->assigner->assignToAllProductGroups($family);

    expect($result)->toBe(['updated' => 1, 'skipped' => 0]);
    expect($group->attributeFamilies()->orderByPivot('sort_order')->pluck('attribute_families.id')->all())->toBe([$family->id]);
});

test('logs the change with the before/after family id list', function () {
    $group = makeProductGroup();
    $existing = AttributeFamily::create(['code' => 'existing']);
    $group->attributeFamilies()->attach($existing->id, ['sort_order' => 0]);
    $family = AttributeFamily::create(['code' => 'fam1']);

    $this->assigner->assignToAllProductGroups($family);

    $log = AuditLog::where('event', 'attribute_families_updated')
        ->where('auditable_type', $group->getMorphClass())
        ->where('auditable_id', $group->id)
        ->first();

    expect($log)->not->toBeNull();
    expect($log->old_values['family_ids'])->toBe([$existing->id]);
    expect($log->new_values['family_ids'])->toBe([$family->id, $existing->id]);
});

test('prepends the family ahead of existing ones instead of replacing them', function () {
    $group = makeProductGroup();
    $existing = AttributeFamily::create(['code' => 'existing']);
    $group->attributeFamilies()->attach($existing->id, ['sort_order' => 0]);
    $family = AttributeFamily::create(['code' => 'fam1']);

    $this->assigner->assignToAllProductGroups($family);

    expect($group->attributeFamilies()->orderByPivot('sort_order')->pluck('attribute_families.id')->all())
        ->toBe([$family->id, $existing->id]);
});

test('a group where the family is already the default is skipped, not re-logged', function () {
    $group = makeProductGroup();
    $family = AttributeFamily::create(['code' => 'fam1']);
    $group->attributeFamilies()->attach($family->id, ['sort_order' => 0]);

    $result = $this->assigner->assignToAllProductGroups($family);

    expect($result)->toBe(['updated' => 0, 'skipped' => 1]);
    expect(AuditLog::where('event', 'attribute_families_updated')->where('auditable_id', $group->id)->exists())->toBeFalse();
});

test('onlyEmpty=true skips a group that already has any family, even if it is a different one at position 0', function () {
    $group = makeProductGroup();
    $other = AttributeFamily::create(['code' => 'other']);
    $group->attributeFamilies()->attach($other->id, ['sort_order' => 0]);
    $family = AttributeFamily::create(['code' => 'fam1']);

    $result = $this->assigner->assignToAllProductGroups($family, onlyEmpty: true);

    expect($result)->toBe(['updated' => 0, 'skipped' => 1]);
    expect($group->attributeFamilies()->orderByPivot('sort_order')->pluck('attribute_families.id')->all())->toBe([$other->id]);
});

test('onlyEmpty=true still assigns to a group that has no family at all', function () {
    $group = makeProductGroup();
    $family = AttributeFamily::create(['code' => 'fam1']);

    $result = $this->assigner->assignToAllProductGroups($family, onlyEmpty: true);

    expect($result)->toBe(['updated' => 1, 'skipped' => 0]);
});

test('dryRun=true counts what would change but persists nothing and logs nothing', function () {
    $group = makeProductGroup();
    $family = AttributeFamily::create(['code' => 'fam1']);

    $result = $this->assigner->assignToAllProductGroups($family, dryRun: true);

    expect($result)->toBe(['updated' => 1, 'skipped' => 0]);
    expect($group->attributeFamilies()->count())->toBe(0);
    expect(AuditLog::where('event', 'attribute_families_updated')->exists())->toBeFalse();
});

test('processes every qualifying product group and totals updated/skipped across all of them', function () {
    $family = AttributeFamily::create(['code' => 'fam1']);
    $freshGroup = makeProductGroup();
    $alreadyDefaultGroup = makeProductGroup();
    $alreadyDefaultGroup->attributeFamilies()->attach($family->id, ['sort_order' => 0]);

    $result = $this->assigner->assignToAllProductGroups($family);

    expect($result)->toBe(['updated' => 1, 'skipped' => 1]);
    expect($freshGroup->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$family->id]);
});
