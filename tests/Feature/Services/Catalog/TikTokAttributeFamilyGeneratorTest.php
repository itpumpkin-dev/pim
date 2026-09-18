<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\SalesPlatform;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokCategory;
use App\Models\TikTokCategoryAttribute;
use App\Services\Catalog\TikTokAttributeFamilyGenerator;

function makeTikTokCategory(array $attributes = []): Category
{
    if (isset($attributes['tiktok_category_id'])) {
        TikTokCategory::firstOrCreate(['id' => $attributes['tiktok_category_id']], ['name' => 'Test TikTok Category', 'is_leaf' => true]);
    }

    return Category::create(array_merge(['code' => 'cat_'.uniqid(), 'name' => 'Test Category'], $attributes));
}

function mapTikTokAttribute(int $tiktokCategoryId, string $attributeCode, string $tiktokAttributeId, int $sortOrder = 0): Attribute
{
    $attribute = Attribute::create(['code' => $attributeCode, 'type' => 'text']);

    TikTokAttribute::firstOrCreate(['id' => $tiktokAttributeId], ['name' => 'Test TikTok Attribute '.$tiktokAttributeId]);
    TikTokCategoryAttribute::create(['category_id' => $tiktokCategoryId, 'tiktok_attribute_id' => $tiktokAttributeId]);
    TikTokAttributeMapping::create([
        'attribute_id' => $attribute->id,
        'target_field' => 'tiktok_attribute',
        'tiktok_attribute_id' => $tiktokAttributeId,
        'sort_order' => $sortOrder,
    ]);

    return $attribute;
}

beforeEach(function () {
    $this->generator = new TikTokAttributeFamilyGenerator();

    // attribute_groups.platform has a real FK to sales_platforms.code — that
    // lookup row is normally seeded (DatabaseSeeder) or created by hand on
    // the real dev DB, but RefreshDatabase (used here) doesn't seed.
    SalesPlatform::firstOrCreate(['code' => 'tiktok'], ['name' => 'TikTok']);
});

test('throws when the category has no tiktok_category_id yet', function () {
    $category = makeTikTokCategory();

    $this->generator->syncForCategory($category);
})->throws(RuntimeException::class, 'not mapped to a TikTok category yet');

test('throws when the tiktok category has no PIM attribute mapped to it yet', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 555]);

    $this->generator->syncForCategory($category);
})->throws(RuntimeException::class, 'map at least one first');

test('a successful sync creates the tiktok group, a family, and attaches it to the category', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');
    mapTikTokAttribute(100, 'psize', 'attr_size', sortOrder: 1);

    $result = $this->generator->syncForCategory($category);

    expect($result['attribute_count'])->toBe(2);

    $group = AttributeGroup::where('code', 'tiktok')->first();
    expect($group)->not->toBeNull();
    expect($group->platform)->toBe('tiktok');

    $family = AttributeFamily::where('tiktok_category_id', 100)->first();
    expect($family)->not->toBeNull();
    expect($family->id)->toBe($result['family']->id);

    expect(FamilyAttribute::where('family_id', $family->id)->count())->toBe(2);
    expect($category->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$family->id]);
});

test('re-syncing the same category reuses the existing family instead of creating a duplicate', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $first = $this->generator->syncForCategory($category);
    $second = $this->generator->syncForCategory($category->fresh());

    expect($second['family']->id)->toBe($first['family']->id);
    expect(AttributeFamily::where('tiktok_category_id', 100)->count())->toBe(1);
});

test('re-syncing never overwrites a family name the admin already edited by hand', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $result = $this->generator->syncForCategory($category);
    $result['family']->update(['name' => 'Renamed by admin']);

    $this->generator->syncForCategory($category->fresh());

    expect(AttributeFamily::find($result['family']->id)->name)->toBe('Renamed by admin');
});

test('creating a brand-new family logs exactly one "created" audit entry, not a duplicate', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $result = $this->generator->syncForCategory($category);

    $createdLogs = AuditLog::where('auditable_type', (new AttributeFamily())->getMorphClass())
        ->where('auditable_id', $result['family']->id)
        ->where('event', 'created')
        ->count();
    expect($createdLogs)->toBe(1);

    $syncedLogs = AuditLog::where('event', 'tiktok_synced')->where('auditable_id', $result['family']->id)->count();
    expect($syncedLogs)->toBe(0);
});

test('re-syncing an existing family logs a "tiktok_synced" audit entry', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $syncedLogs = AuditLog::where('event', 'tiktok_synced')->where('auditable_id', $result['family']->id)->count();
    expect($syncedLogs)->toBe(1);
});

test('re-syncing with an unchanged attribute set does not log noise', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'tiktok_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->count();
    expect($attributeSyncLogs)->toBe(1);
});

test('re-syncing after mapping a new attribute logs the before/after attribute diff', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $result = $this->generator->syncForCategory($category);
    mapTikTokAttribute(100, 'psize', 'attr_size', sortOrder: 1);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'tiktok_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->orderBy('id')
        ->get();

    expect($attributeSyncLogs)->toHaveCount(2);
    expect($attributeSyncLogs->last()->new_values['attribute_ids'])->toHaveCount(2);
});

test('attaching a newly generated family appends after existing families instead of displacing the default one', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $defaultFamily = AttributeFamily::create(['code' => 'default_family', 'name' => 'Default']);
    $category->attributeFamilies()->attach($defaultFamily->id, ['sort_order' => 0]);

    $result = $this->generator->syncForCategory($category->fresh());

    $ordered = $category->attributeFamilies()->orderByPivot('sort_order')->pluck('attribute_families.id')->all();
    expect($ordered)->toBe([$defaultFamily->id, $result['family']->id]);
});

test('re-syncing an already-attached family does not log a duplicate "attached" audit entry', function () {
    $category = makeTikTokCategory(['tiktok_category_id' => 100]);
    mapTikTokAttribute(100, 'pcolor', 'attr_color');

    $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attachedLogs = AuditLog::where('event', 'tiktok_family_attached_to_category')
        ->where('auditable_type', $category->getMorphClass())
        ->where('auditable_id', $category->id)
        ->count();
    expect($attachedLogs)->toBe(1);
});
