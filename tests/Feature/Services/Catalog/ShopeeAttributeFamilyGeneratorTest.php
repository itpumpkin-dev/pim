<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\SalesPlatform;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeCategory;
use App\Models\ShopeeCategoryAttribute;
use App\Services\Catalog\ShopeeAttributeFamilyGenerator;

function makeCategory(array $attributes = []): Category
{
    if (isset($attributes['shopee_category_id'])) {
        ShopeeCategory::firstOrCreate(['id' => $attributes['shopee_category_id']], ['name' => 'Test Shopee Category', 'is_leaf' => true]);
    }

    return Category::create(array_merge(['code' => 'cat_'.uniqid(), 'name' => 'Test Category'], $attributes));
}

function mapShopeeAttribute(int $shopeeCategoryId, string $attributeCode, int $shopeeAttributeId, int $sortOrder = 0): Attribute
{
    $attribute = Attribute::create(['code' => $attributeCode, 'type' => 'text']);

    ShopeeAttribute::firstOrCreate(['id' => $shopeeAttributeId], ['name' => 'Test Shopee Attribute '.$shopeeAttributeId, 'input_type' => 1]);
    ShopeeCategoryAttribute::create(['category_id' => $shopeeCategoryId, 'shopee_attribute_id' => $shopeeAttributeId]);
    ShopeeAttributeMapping::create([
        'attribute_id' => $attribute->id,
        'target_field' => 'shopee_attribute',
        'shopee_attribute_id' => $shopeeAttributeId,
        'sort_order' => $sortOrder,
    ]);

    return $attribute;
}

beforeEach(function () {
    $this->generator = new ShopeeAttributeFamilyGenerator();

    // attribute_groups.platform has a real FK to sales_platforms.code — that
    // lookup row is normally seeded (DatabaseSeeder) or created by hand on
    // the real dev DB, but RefreshDatabase (used here) doesn't seed.
    SalesPlatform::firstOrCreate(['code' => 'shopee'], ['name' => 'Shopee']);
});

test('throws when the category has no shopee_category_id yet', function () {
    $category = makeCategory();

    $this->generator->syncForCategory($category);
})->throws(RuntimeException::class, 'not mapped to a Shopee category yet');

test('throws when the shopee category has no PIM attribute mapped to it yet', function () {
    $category = makeCategory(['shopee_category_id' => 555]);

    $this->generator->syncForCategory($category);
})->throws(RuntimeException::class, 'map at least one first');

test('a successful sync creates the shopee group, a family, and attaches it to the category', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);
    mapShopeeAttribute(100, 'psize', 2, sortOrder: 1);

    $result = $this->generator->syncForCategory($category);

    expect($result['attribute_count'])->toBe(2);

    $group = AttributeGroup::where('code', 'shopee')->first();
    expect($group)->not->toBeNull();
    expect($group->platform)->toBe('shopee');

    $family = AttributeFamily::where('shopee_category_id', 100)->first();
    expect($family)->not->toBeNull();
    expect($family->id)->toBe($result['family']->id);

    $attributeIds = FamilyAttribute::where('family_id', $family->id)->orderBy('sort_order')->pluck('attribute_id')->all();
    expect($attributeIds)->toHaveCount(2);

    expect($category->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$family->id]);
});

test('re-syncing the same category reuses the existing family instead of creating a duplicate', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $first = $this->generator->syncForCategory($category);
    $second = $this->generator->syncForCategory($category->fresh());

    expect($second['family']->id)->toBe($first['family']->id);
    expect(AttributeFamily::where('shopee_category_id', 100)->count())->toBe(1);
});

test('re-syncing never overwrites a family name the admin already edited by hand', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $result = $this->generator->syncForCategory($category);
    $result['family']->update(['name' => 'Renamed by admin']);

    $this->generator->syncForCategory($category->fresh());

    expect(AttributeFamily::find($result['family']->id)->name)->toBe('Renamed by admin');
});

test('creating a brand-new family logs exactly one "created" audit entry, not a duplicate', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $result = $this->generator->syncForCategory($category);

    $createdLogs = AuditLog::where('auditable_type', (new AttributeFamily())->getMorphClass())
        ->where('auditable_id', $result['family']->id)
        ->where('event', 'created')
        ->count();

    expect($createdLogs)->toBe(1);

    // The "re-sync" audit event must not also fire on the very first sync —
    // only on a genuine re-sync of an already-existing family.
    $syncedLogs = AuditLog::where('event', 'shopee_synced')
        ->where('auditable_id', $result['family']->id)
        ->count();
    expect($syncedLogs)->toBe(0);
});

test('re-syncing an existing family logs a "shopee_synced" audit entry', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $syncedLogs = AuditLog::where('event', 'shopee_synced')
        ->where('auditable_id', $result['family']->id)
        ->count();
    expect($syncedLogs)->toBe(1);
});

test('re-syncing with an unchanged attribute set does not log noise', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'shopee_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->count();

    // Only the very first (create) round is a real change from [] -> [pcolor].
    expect($attributeSyncLogs)->toBe(1);
});

test('re-syncing after mapping a new attribute logs the before/after attribute diff', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $result = $this->generator->syncForCategory($category);
    mapShopeeAttribute(100, 'psize', 2, sortOrder: 1);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'shopee_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->orderBy('id')
        ->get();

    expect($attributeSyncLogs)->toHaveCount(2);
    expect($attributeSyncLogs->last()->new_values['attribute_ids'])->toHaveCount(2);
});

test('attaching a newly generated family appends after existing families instead of displacing the default one', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $defaultFamily = AttributeFamily::create(['code' => 'default_family', 'name' => 'Default']);
    $category->attributeFamilies()->attach($defaultFamily->id, ['sort_order' => 0]);

    $result = $this->generator->syncForCategory($category->fresh());

    $ordered = $category->attributeFamilies()->orderByPivot('sort_order')->pluck('attribute_families.id')->all();
    expect($ordered)->toBe([$defaultFamily->id, $result['family']->id]);
});

test('re-syncing an already-attached family does not log a duplicate "attached" audit entry', function () {
    $category = makeCategory(['shopee_category_id' => 100]);
    mapShopeeAttribute(100, 'pcolor', 1);

    $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attachedLogs = AuditLog::where('event', 'shopee_family_attached_to_category')
        ->where('auditable_type', $category->getMorphClass())
        ->where('auditable_id', $category->id)
        ->count();

    expect($attachedLogs)->toBe(1);
});
