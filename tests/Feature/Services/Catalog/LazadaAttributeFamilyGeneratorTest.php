<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaCategory;
use App\Models\LazadaCategoryAttribute;
use App\Models\SalesPlatform;
use App\Services\Catalog\LazadaAttributeFamilyGenerator;

function makeLazadaCategory(array $attributes = []): Category
{
    if (isset($attributes['lazada_category_id'])) {
        LazadaCategory::firstOrCreate(['id' => $attributes['lazada_category_id']], ['name' => 'Test Lazada Category', 'is_leaf' => true]);
    }

    return Category::create(array_merge(['code' => 'cat_'.uniqid(), 'name' => 'Test Category'], $attributes));
}

function mapLazadaAttribute(int $lazadaCategoryId, string $attributeCode, string $lazadaAttributeName, int $sortOrder = 0): Attribute
{
    $attribute = Attribute::create(['code' => $attributeCode, 'type' => 'text']);

    LazadaAttribute::firstOrCreate(['name' => $lazadaAttributeName], ['label' => $lazadaAttributeName, 'input_type' => 'text']);
    LazadaCategoryAttribute::create(['category_id' => $lazadaCategoryId, 'lazada_attribute_name' => $lazadaAttributeName]);
    LazadaAttributeMapping::create([
        'attribute_id' => $attribute->id,
        'target_field' => 'lazada_attribute',
        'lazada_attribute_name' => $lazadaAttributeName,
        'sort_order' => $sortOrder,
    ]);

    return $attribute;
}

beforeEach(function () {
    $this->generator = new LazadaAttributeFamilyGenerator();

    // attribute_groups.platform has a real FK to sales_platforms.code — that
    // lookup row is normally seeded (DatabaseSeeder) or created by hand on
    // the real dev DB, but RefreshDatabase (used here) doesn't seed.
    SalesPlatform::firstOrCreate(['code' => 'lazada'], ['name' => 'Lazada']);
});

test('throws when the category has no lazada_category_id yet', function () {
    $category = makeLazadaCategory();

    $this->generator->syncForCategory($category);
})->throws(RuntimeException::class, 'not mapped to a Lazada category yet');

test('throws when the lazada category has no PIM attribute mapped to it yet', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 555]);

    $this->generator->syncForCategory($category);
})->throws(RuntimeException::class, 'map at least one first');

test('a successful sync creates the lazada group, a family, and attaches it to the category', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');
    mapLazadaAttribute(100, 'psize', 'Size', sortOrder: 1);

    $result = $this->generator->syncForCategory($category);

    expect($result['attribute_count'])->toBe(2);

    $group = AttributeGroup::where('code', 'lazada')->first();
    expect($group)->not->toBeNull();
    expect($group->platform)->toBe('lazada');

    $family = AttributeFamily::where('lazada_category_id', 100)->first();
    expect($family)->not->toBeNull();
    expect($family->id)->toBe($result['family']->id);

    expect(FamilyAttribute::where('family_id', $family->id)->count())->toBe(2);
    expect($category->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$family->id]);
});

test('re-syncing the same category reuses the existing family instead of creating a duplicate', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $first = $this->generator->syncForCategory($category);
    $second = $this->generator->syncForCategory($category->fresh());

    expect($second['family']->id)->toBe($first['family']->id);
    expect(AttributeFamily::where('lazada_category_id', 100)->count())->toBe(1);
});

test('re-syncing never overwrites a family name the admin already edited by hand', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $result = $this->generator->syncForCategory($category);
    $result['family']->update(['name' => 'Renamed by admin']);

    $this->generator->syncForCategory($category->fresh());

    expect(AttributeFamily::find($result['family']->id)->name)->toBe('Renamed by admin');
});

test('creating a brand-new family logs exactly one "created" audit entry, not a duplicate', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $result = $this->generator->syncForCategory($category);

    $createdLogs = AuditLog::where('auditable_type', (new AttributeFamily())->getMorphClass())
        ->where('auditable_id', $result['family']->id)
        ->where('event', 'created')
        ->count();
    expect($createdLogs)->toBe(1);

    $syncedLogs = AuditLog::where('event', 'lazada_synced')->where('auditable_id', $result['family']->id)->count();
    expect($syncedLogs)->toBe(0);
});

test('re-syncing an existing family logs a "lazada_synced" audit entry', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $syncedLogs = AuditLog::where('event', 'lazada_synced')->where('auditable_id', $result['family']->id)->count();
    expect($syncedLogs)->toBe(1);
});

test('re-syncing with an unchanged attribute set does not log noise', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'lazada_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->count();
    expect($attributeSyncLogs)->toBe(1);
});

test('re-syncing after mapping a new attribute logs the before/after attribute diff', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $result = $this->generator->syncForCategory($category);
    mapLazadaAttribute(100, 'psize', 'Size', sortOrder: 1);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'lazada_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->orderBy('id')
        ->get();

    expect($attributeSyncLogs)->toHaveCount(2);
    expect($attributeSyncLogs->last()->new_values['attribute_ids'])->toHaveCount(2);
});

test('attaching a newly generated family appends after existing families instead of displacing the default one', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $defaultFamily = AttributeFamily::create(['code' => 'default_family', 'name' => 'Default']);
    $category->attributeFamilies()->attach($defaultFamily->id, ['sort_order' => 0]);

    $result = $this->generator->syncForCategory($category->fresh());

    $ordered = $category->attributeFamilies()->orderByPivot('sort_order')->pluck('attribute_families.id')->all();
    expect($ordered)->toBe([$defaultFamily->id, $result['family']->id]);
});

test('re-syncing an already-attached family does not log a duplicate "attached" audit entry', function () {
    $category = makeLazadaCategory(['lazada_category_id' => 100]);
    mapLazadaAttribute(100, 'pcolor', 'Color');

    $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attachedLogs = AuditLog::where('event', 'lazada_family_attached_to_category')
        ->where('auditable_type', $category->getMorphClass())
        ->where('auditable_id', $category->id)
        ->count();
    expect($attachedLogs)->toBe(1);
});
