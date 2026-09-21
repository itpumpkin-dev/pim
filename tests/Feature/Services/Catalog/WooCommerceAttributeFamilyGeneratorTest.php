<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\SalesPlatform;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use App\Services\Catalog\WooCommerceAttributeFamilyGenerator;

function makeWooCategory(array $attributes = []): Category
{
    return Category::create(array_merge(['code' => 'cat_'.uniqid(), 'name' => 'Test Category'], $attributes));
}

/** Unlike Lazada/Shopee/TikTok, WooCommerce attributes are global — mapping one has nothing to do with any category. */
function mapWooAttribute(string $attributeCode, int $wooAttributeId, int $sortOrder = 0): Attribute
{
    $attribute = Attribute::create(['code' => $attributeCode, 'type' => 'text']);

    WooCommerceAttribute::firstOrCreate(['id' => $wooAttributeId], ['name' => 'wc_attr_'.$wooAttributeId]);
    WooCommerceAttributeMapping::create([
        'attribute_id' => $attribute->id,
        'target_field' => 'wc_attribute',
        'woocommerce_attribute_id' => $wooAttributeId,
        'sort_order' => $sortOrder,
    ]);

    return $attribute;
}

beforeEach(function () {
    $this->generator = new WooCommerceAttributeFamilyGenerator();

    // attribute_groups.platform has a real FK to sales_platforms.code — see
    // LazadaAttributeFamilyGeneratorTest's identical setup note.
    SalesPlatform::firstOrCreate(['code' => 'woocommerce'], ['name' => 'WooCommerce']);
});

test('throws when no PIM attribute is mapped to a WooCommerce attribute yet', function () {
    $category = makeWooCategory();

    $this->generator->syncForCategory($category);
})->throws(RuntimeException::class, 'map at least one first');

test('does not require the category to be mapped to a WooCommerce category first (unlike Lazada/Shopee/TikTok)', function () {
    $category = makeWooCategory(); // no woocommerce_category_id at all
    mapWooAttribute('pcolor', 501);

    $result = $this->generator->syncForCategory($category);

    expect($result['attribute_count'])->toBe(1);
});

test('a successful sync creates the woocommerce group, a family, and attaches it to the category', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);
    mapWooAttribute('psize', 502, sortOrder: 1);

    $result = $this->generator->syncForCategory($category);

    expect($result['attribute_count'])->toBe(2);

    $group = AttributeGroup::where('code', 'woocommerce')->first();
    expect($group)->not->toBeNull();
    expect($group->platform)->toBe('woocommerce');

    $family = AttributeFamily::where('code', 'woocommerce_family')->first();
    expect($family)->not->toBeNull();
    expect($family->name)->toBe('WooCommerce');
    expect($family->id)->toBe($result['family']->id);

    expect(FamilyAttribute::where('family_id', $family->id)->count())->toBe(2);
    expect($category->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$family->id]);
});

test('resolves every globally-mapped attribute, regardless of which category is being synced', function () {
    $categoryA = makeWooCategory();
    $categoryB = makeWooCategory();
    mapWooAttribute('pcolor', 501);
    mapWooAttribute('psize', 502, sortOrder: 1);

    $resultA = $this->generator->syncForCategory($categoryA);
    $resultB = $this->generator->syncForCategory($categoryB->fresh());

    // Same single family, attached to BOTH categories — there is only ever
    // one WooCommerce family in the whole system, unlike Lazada/Shopee/TikTok
    // which mint one family per marketplace category.
    expect($resultB['family']->id)->toBe($resultA['family']->id);
    expect(AttributeFamily::where('code', 'woocommerce_family')->count())->toBe(1);
    expect($categoryA->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$resultA['family']->id]);
    expect($categoryB->attributeFamilies()->pluck('attribute_families.id')->all())->toBe([$resultA['family']->id]);
});

test('re-syncing the same category reuses the existing family instead of creating a duplicate', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $first = $this->generator->syncForCategory($category);
    $second = $this->generator->syncForCategory($category->fresh());

    expect($second['family']->id)->toBe($first['family']->id);
    expect(AttributeFamily::where('code', 'woocommerce_family')->count())->toBe(1);
});

test('re-syncing never overwrites a family name the admin already edited by hand', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $result = $this->generator->syncForCategory($category);
    $result['family']->update(['name' => 'Renamed by admin']);

    $this->generator->syncForCategory($category->fresh());

    expect(AttributeFamily::find($result['family']->id)->name)->toBe('Renamed by admin');
});

test('creating a brand-new family logs exactly one "created" audit entry, not a duplicate', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $result = $this->generator->syncForCategory($category);

    $createdLogs = AuditLog::where('auditable_type', (new AttributeFamily())->getMorphClass())
        ->where('auditable_id', $result['family']->id)
        ->where('event', 'created')
        ->count();
    expect($createdLogs)->toBe(1);

    $syncedLogs = AuditLog::where('event', 'woocommerce_synced')->where('auditable_id', $result['family']->id)->count();
    expect($syncedLogs)->toBe(0);
});

test('re-syncing an existing family logs a "woocommerce_synced" audit entry', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $syncedLogs = AuditLog::where('event', 'woocommerce_synced')->where('auditable_id', $result['family']->id)->count();
    expect($syncedLogs)->toBe(1);
});

test('re-syncing with an unchanged attribute set does not log noise', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $result = $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'woocommerce_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->count();
    expect($attributeSyncLogs)->toBe(1);
});

test('re-syncing after mapping a new attribute logs the before/after attribute diff', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $result = $this->generator->syncForCategory($category);
    mapWooAttribute('psize', 502, sortOrder: 1);
    $this->generator->syncForCategory($category->fresh());

    $attributeSyncLogs = AuditLog::where('event', 'woocommerce_family_attributes_synced')
        ->where('auditable_id', $result['family']->id)
        ->orderBy('id')
        ->get();

    expect($attributeSyncLogs)->toHaveCount(2);
    expect($attributeSyncLogs->last()->new_values['attribute_ids'])->toHaveCount(2);
});

test('attaching a newly generated family appends after existing families instead of displacing the default one', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $defaultFamily = AttributeFamily::create(['code' => 'default_family', 'name' => 'Default']);
    $category->attributeFamilies()->attach($defaultFamily->id, ['sort_order' => 0]);

    $result = $this->generator->syncForCategory($category->fresh());

    $ordered = $category->attributeFamilies()->orderByPivot('sort_order')->pluck('attribute_families.id')->all();
    expect($ordered)->toBe([$defaultFamily->id, $result['family']->id]);
});

test('re-syncing an already-attached family does not log a duplicate "attached" audit entry', function () {
    $category = makeWooCategory();
    mapWooAttribute('pcolor', 501);

    $this->generator->syncForCategory($category);
    $this->generator->syncForCategory($category->fresh());

    $attachedLogs = AuditLog::where('event', 'woocommerce_family_attached_to_category')
        ->where('auditable_type', $category->getMorphClass())
        ->where('auditable_id', $category->id)
        ->count();
    expect($attachedLogs)->toBe(1);
});
