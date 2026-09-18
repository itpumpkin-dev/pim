<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\BaseUnit;
use App\Models\BaseUnitTranslation;
use App\Models\BusinessType;
use App\Models\Category;
use App\Models\Currency;
use App\Models\Locale;
use App\Models\Vendor;
use App\Services\Catalog\MasterAttributeOptionSync;

function masterAttr(string $masterSource): Attribute
{
    return Attribute::create(['code' => 'attr_'.uniqid(), 'type' => 'select', 'master_source' => $masterSource]);
}

beforeEach(function () {
    $this->sync = new MasterAttributeOptionSync();
});

test('rebuildAttribute with no (or an unrecognized) master_source deletes every existing option', function () {
    $attribute = Attribute::create(['code' => 'plain', 'type' => 'select']);
    AttributeOption::create(['attribute_id' => $attribute->id, 'code' => 'leftover', 'admin_label' => 'x']);

    $this->sync->rebuildAttribute($attribute);

    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(0);
});

test('rebuildAttribute creates one option per master row, using its label', function () {
    // NOTE: migrations bake in real business_types/vendors/currencies rows
    // as seed data (not just schema) — a "fresh" test DB is never actually
    // empty of these, so assertions below check for our two rows among
    // whatever else exists rather than asserting an exact/exhaustive list.
    BusinessType::create(['code' => 'test_retail', 'name' => 'Retail', 'is_active' => true]);
    BusinessType::create(['code' => 'test_wholesale', 'name' => 'Wholesale', 'is_active' => true]);
    $attribute = masterAttr('business_types');

    $this->sync->rebuildAttribute($attribute);

    $options = AttributeOption::where('attribute_id', $attribute->id)->get();
    expect($options->pluck('code')->all())->toContain('test_retail', 'test_wholesale');
    expect($options->firstWhere('code', 'test_retail')->admin_label)->toBe('Retail');
    expect($options->firstWhere('code', 'test_wholesale')->admin_label)->toBe('Wholesale');
});

test('a customized option keeps its own label across a rebuild instead of being overwritten by the master', function () {
    BusinessType::create(['code' => 'retail', 'name' => 'Retail', 'is_active' => true]);
    $attribute = masterAttr('business_types');
    $this->sync->rebuildAttribute($attribute);

    $option = AttributeOption::where('attribute_id', $attribute->id)->where('code', 'retail')->first();
    $option->update(['admin_label' => 'Custom Label', 'is_customized' => true]);

    BusinessType::where('code', 'retail')->first()->update(['name' => 'Renamed In Master']);
    $this->sync->rebuildAttribute($attribute);

    expect($option->refresh()->admin_label)->toBe('Custom Label');
});

test('rebuildAttribute prunes an option whose master row no longer exists at all, even if it was customized', function () {
    $attribute = Attribute::create(['code' => 'attr1', 'type' => 'select', 'master_source' => 'business_types']);
    AttributeOption::create(['attribute_id' => $attribute->id, 'code' => 'deleted_type', 'admin_label' => 'Gone', 'is_customized' => true]);

    $this->sync->rebuildAttribute($attribute);

    expect(AttributeOption::where('attribute_id', $attribute->id)->where('code', 'deleted_type')->exists())->toBeFalse();
});

test('rebuildAll rebuilds every attribute with a master_source and returns how many it processed', function () {
    // Several attributes (pcatname, vendor, purchase_currency, ...) already
    // come bound to a master_source out of the migration history itself —
    // compare against the real count instead of assuming a clean slate.
    BusinessType::create(['code' => 'test_retail', 'name' => 'Retail', 'is_active' => true]);
    $bound = masterAttr('business_types');
    $unbound = Attribute::create(['code' => 'plain', 'type' => 'select']);
    $expectedCount = Attribute::whereNotNull('master_source')->count();

    $count = $this->sync->rebuildAll();

    expect($count)->toBe($expectedCount);
    expect(AttributeOption::where('attribute_id', $bound->id)->exists())->toBeTrue();
    expect(AttributeOption::where('attribute_id', $unbound->id)->exists())->toBeFalse();
});

test('syncModel upserts the option on every attribute bound to that source when a master row is saved', function () {
    $attributeA = masterAttr('business_types');
    $attributeB = masterAttr('business_types');
    $businessType = BusinessType::create(['code' => 'retail', 'name' => 'Retail', 'is_active' => true]);

    $this->sync->syncModel($businessType);

    expect(AttributeOption::where('attribute_id', $attributeA->id)->where('code', 'retail')->exists())->toBeTrue();
    expect(AttributeOption::where('attribute_id', $attributeB->id)->where('code', 'retail')->exists())->toBeTrue();
});

test('syncModel only touches attributes bound to the saved model\'s own source, not any other', function () {
    $businessTypeAttr = masterAttr('business_types');
    $vendorAttr = masterAttr('vendors');
    $businessType = BusinessType::create(['code' => 'test_retail', 'name' => 'Retail', 'is_active' => true]);

    $this->sync->syncModel($businessType);

    expect(AttributeOption::where('attribute_id', $businessTypeAttr->id)->where('code', 'test_retail')->exists())->toBeTrue();
    expect(AttributeOption::where('attribute_id', $vendorAttr->id)->where('code', 'test_retail')->exists())->toBeFalse();
});

test('syncModel does not overwrite a customized option\'s label, but does update a non-customized one', function () {
    $customizedAttr = masterAttr('business_types');
    $plainAttr = masterAttr('business_types');
    $businessType = BusinessType::create(['code' => 'retail', 'name' => 'Retail', 'is_active' => true]);
    $this->sync->syncModel($businessType);

    AttributeOption::where('attribute_id', $customizedAttr->id)->where('code', 'retail')
        ->update(['admin_label' => 'Custom', 'is_customized' => true]);

    $businessType->update(['name' => 'Retail Updated']);
    $this->sync->syncModel($businessType->refresh());

    expect(AttributeOption::where('attribute_id', $customizedAttr->id)->where('code', 'retail')->first()->admin_label)->toBe('Custom');
    expect(AttributeOption::where('attribute_id', $plainAttr->id)->where('code', 'retail')->first()->admin_label)->toBe('Retail Updated');
});

test('syncModel migrates a customized option onto the new code when the master row\'s code changes', function () {
    $attribute = masterAttr('vendors');
    $vendor = Vendor::create(['code' => 'old_code', 'name' => 'Acme']);
    $this->sync->syncModel($vendor);

    $option = AttributeOption::where('attribute_id', $attribute->id)->where('code', 'old_code')->first();
    $option->update(['admin_label' => 'My Custom Label', 'is_customized' => true]);

    $vendor->code = 'new_code';
    $vendor->save();
    $this->sync->syncModel($vendor);

    $migrated = AttributeOption::find($option->id)->refresh();
    expect($migrated->code)->toBe('new_code');
    expect($migrated->admin_label)->toBe('My Custom Label'); // untouched by the rename
    expect(AttributeOption::where('attribute_id', $attribute->id)->where('code', 'old_code')->exists())->toBeFalse();
});

test('syncModel deletes and recreates a non-customized option fresh when the master row\'s code changes', function () {
    $attribute = masterAttr('vendors');
    $vendor = Vendor::create(['code' => 'old_code', 'name' => 'Acme']);
    $this->sync->syncModel($vendor);
    $originalOptionId = AttributeOption::where('attribute_id', $attribute->id)->where('code', 'old_code')->first()->id;

    $vendor->code = 'new_code';
    $vendor->save();
    $this->sync->syncModel($vendor);

    expect(AttributeOption::where('attribute_id', $attribute->id)->where('code', 'old_code')->exists())->toBeFalse();
    $newOption = AttributeOption::where('attribute_id', $attribute->id)->where('code', 'new_code')->first();
    expect($newOption)->not->toBeNull();
    expect($newOption->id)->not->toBe($originalOptionId);
});

test('forgetModel deletes the mirrored option, on every bound attribute, for a deleted master row', function () {
    $attributeA = masterAttr('business_types');
    $attributeB = masterAttr('business_types');
    $businessType = BusinessType::create(['code' => 'retail', 'name' => 'Retail', 'is_active' => true]);
    $this->sync->syncModel($businessType);

    $this->sync->forgetModel($businessType);

    expect(AttributeOption::where('attribute_id', $attributeA->id)->where('code', 'retail')->exists())->toBeFalse();
    expect(AttributeOption::where('attribute_id', $attributeB->id)->where('code', 'retail')->exists())->toBeFalse();
});

test('category depth determines which of categories/subcategories/product_groups a category row mirrors into', function () {
    $root = Category::create(['code' => 'root1', 'name' => 'Root']);
    $sub = Category::create(['code' => 'sub1', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'grp1', 'name' => 'Group', 'parent_id' => $sub->id]);
    $tooDeep = Category::create(['code' => 'deep1', 'name' => 'TooDeep', 'parent_id' => $group->id]);

    $categoriesAttr = masterAttr('categories');
    $subAttr = masterAttr('subcategories');
    $groupAttr = masterAttr('product_groups');

    $this->sync->rebuildAttribute($categoriesAttr);
    $this->sync->rebuildAttribute($subAttr);
    $this->sync->rebuildAttribute($groupAttr);

    expect(AttributeOption::where('attribute_id', $categoriesAttr->id)->pluck('code')->all())->toBe(['root1']);
    expect(AttributeOption::where('attribute_id', $subAttr->id)->pluck('code')->all())->toBe(['sub1']);
    expect(AttributeOption::where('attribute_id', $groupAttr->id)->pluck('code')->all())->toBe(['grp1']);
    // deep1 (depth 3) matches none of the three depth keys.
});

test('base_units mirrors per-locale translations onto AttributeOptionTranslation rows', function () {
    $en = Locale::firstOrCreate(['code' => 'en'], ['enabled' => true]);
    $unit = BaseUnit::create(['code' => 'pcs', 'name' => 'Piece', 'is_active' => true]);
    BaseUnitTranslation::create(['base_unit_id' => $unit->id, 'locale_id' => $en->id, 'label' => 'Pieces (EN)']);
    $attribute = masterAttr('base_units');

    $this->sync->rebuildAttribute($attribute);

    $option = AttributeOption::where('attribute_id', $attribute->id)->where('code', 'pcs')->first();
    expect(AttributeOptionTranslation::where('attribute_option_id', $option->id)->where('locale_id', $en->id)->first()->label)
        ->toBe('Pieces (EN)');
});

test('currency codes are mirrored lowercase regardless of how the master stores them', function () {
    // Real currencies (USD, THB, ...) are seeded straight from a migration
    // (create_currencies_table), not just schema — use a code that can't
    // collide with any of those.
    Currency::create(['code' => 'ZZT', 'name' => 'Test Currency', 'exchange_rate' => 1]);
    $attribute = masterAttr('currencies');

    $this->sync->rebuildAttribute($attribute);

    expect(AttributeOption::where('attribute_id', $attribute->id)->pluck('code')->all())->toContain('zzt');
});

test('resetOptionToMaster clears is_customized and re-syncs the option\'s value from the master row', function () {
    BusinessType::create(['code' => 'retail', 'name' => 'Retail', 'is_active' => true]);
    $attribute = masterAttr('business_types');
    $this->sync->rebuildAttribute($attribute);
    $option = AttributeOption::where('attribute_id', $attribute->id)->where('code', 'retail')->first();
    $option->update(['admin_label' => 'Custom', 'is_customized' => true]);

    $result = $this->sync->resetOptionToMaster($option);

    expect($result)->toBeTrue();
    expect($option->refresh()->is_customized)->toBeFalse();
    expect($option->admin_label)->toBe('Retail');
});

test('resetOptionToMaster returns false when the attribute has no master_source at all', function () {
    $attribute = Attribute::create(['code' => 'plain', 'type' => 'select']);
    $option = AttributeOption::create(['attribute_id' => $attribute->id, 'code' => 'x', 'admin_label' => 'x', 'is_customized' => true]);

    expect($this->sync->resetOptionToMaster($option))->toBeFalse();
    expect($option->refresh()->is_customized)->toBeTrue();
});

test('resetOptionToMaster returns false when the option\'s code no longer matches any current master row', function () {
    $attribute = masterAttr('business_types');
    $option = AttributeOption::create(['attribute_id' => $attribute->id, 'code' => 'no_longer_exists', 'admin_label' => 'x', 'is_customized' => true]);

    expect($this->sync->resetOptionToMaster($option))->toBeFalse();
});
