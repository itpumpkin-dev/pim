<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use App\Models\TikTokCategory;
use App\Models\TikTokCategoryAttribute;
use App\Services\Catalog\TikTokMappedAttributeCreator;

function ensureTikTokCategory(int $id): void
{
    TikTokCategory::firstOrCreate(['id' => $id], ['name' => 'Test TikTok Category', 'is_leaf' => true]);
}

function makeTikTokCategoryAttribute(int $categoryId, string $attributeId, string $name, bool $isCustomizable, bool $isMultipleSelection = false, ?array $options = null): void
{
    ensureTikTokCategory($categoryId);
    TikTokAttribute::firstOrCreate(['id' => $attributeId], [
        'name' => $name,
        'is_customizable' => $isCustomizable,
        'is_multiple_selection' => $isMultipleSelection,
        'options' => $options,
    ]);
    TikTokCategoryAttribute::create(['category_id' => $categoryId, 'tiktok_attribute_id' => $attributeId]);
}

beforeEach(function () {
    $this->creator = new TikTokMappedAttributeCreator();
});

test('returns 0 when the category has no tiktok attributes at all', function () {
    ensureTikTokCategory(100);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
});

test('skips an attribute already mapped to tiktok_attribute', function () {
    makeTikTokCategoryAttribute(100, 'attr_color', 'Color', isCustomizable: false);
    $attribute = Attribute::create(['code' => 'pcolor', 'type' => 'select']);
    TikTokAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'tiktok_attribute', 'tiktok_attribute_id' => 'attr_color', 'sort_order' => 0]);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
    expect(Attribute::where('code', 'color')->exists())->toBeFalse();
});

test('skips an attribute that belongs to a different category', function () {
    makeTikTokCategoryAttribute(200, 'attr_color', 'Color', isCustomizable: false);
    ensureTikTokCategory(100);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
});

test('resolves the PIM type from is_customizable/is_multiple_selection', function (bool $customizable, bool $multiple, string $expectedPimType) {
    makeTikTokCategoryAttribute(100, 'attr_field', 'Field', isCustomizable: $customizable, isMultipleSelection: $multiple);

    $this->creator->createMissingForCategory(100);

    expect(Attribute::where('code', 'field')->first()->type)->toBe($expectedPimType);
})->with([
    'customizable is always free text, regardless of multiple' => [true, false, 'text'],
    'customizable wins over multiple' => [true, true, 'text'],
    'not customizable, single' => [false, false, 'select'],
    'not customizable, multiple' => [false, true, 'multiselect'],
]);

test('a select-type attribute creates its options and 1:1 option mappings', function () {
    makeTikTokCategoryAttribute(100, 'attr_color', 'Color', isCustomizable: false, options: [
        ['id' => 'red', 'name' => 'Red'],
        ['id' => 'blue', 'name' => 'Blue'],
    ]);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(1);
    $attribute = Attribute::where('code', 'color')->first();
    expect($attribute->type)->toBe('select');
    expect($attribute->auto_created_platform)->toBe('tiktok');

    $options = AttributeOption::where('attribute_id', $attribute->id)->orderBy('sort_order')->get();
    expect($options->pluck('code')->all())->toBe(['red', 'blue']);

    $mapping = TikTokAttributeMapping::where('attribute_id', $attribute->id)->first();
    expect(TikTokAttributeOptionMapping::where('tiktok_attribute_mapping_id', $mapping->id)->count())->toBe(2);
});

test('a free-text (customizable) attribute creates no options even if options happen to be present', function () {
    makeTikTokCategoryAttribute(100, 'attr_material', 'Material', isCustomizable: true, options: [['id' => 'x', 'name' => 'X']]);

    $this->creator->createMissingForCategory(100);

    $attribute = Attribute::where('code', 'material')->first();
    expect($attribute->type)->toBe('text');
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(0);
});

test('reuses an existing active attribute whose code and type both match instead of creating a duplicate', function () {
    Attribute::create(['code' => 'material', 'type' => 'text']);
    makeTikTokCategoryAttribute(100, 'attr_material', 'Material', isCustomizable: true);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(1);
    expect(Attribute::where('code', 'material')->count())->toBe(1);
    expect(TikTokAttributeMapping::where('tiktok_attribute_id', 'attr_material')->exists())->toBeTrue();
});

test('a code collision with a different-type attribute creates a separate, disambiguated attribute instead of reusing it', function () {
    Attribute::create(['code' => 'color', 'type' => 'text']);
    makeTikTokCategoryAttribute(100, 'attr_color', 'Color', isCustomizable: false);

    $this->creator->createMissingForCategory(100);

    expect(Attribute::where('code', 'color')->first()->type)->toBe('text');
    $new = Attribute::where('code', 'color_2')->first();
    expect($new)->not->toBeNull();
    expect($new->type)->toBe('select');
});

test('a code collision with a soft-deleted attribute does not revive it, and creates a disambiguated one instead', function () {
    $trashed = Attribute::create(['code' => 'material', 'type' => 'text']);
    $trashed->delete();
    makeTikTokCategoryAttribute(100, 'attr_material', 'Material', isCustomizable: true);

    $this->creator->createMissingForCategory(100);

    $stillTrashed = Attribute::withTrashed()->where('code', 'material')->first();
    expect($stillTrashed->id)->toBe($trashed->id);
    expect($stillTrashed->trashed())->toBeTrue();
    expect(Attribute::where('code', 'material_2')->exists())->toBeTrue();
});

test('reusing an attribute that already has a mapping to a different target_field does not overwrite it and is not counted as created', function () {
    $attribute = Attribute::create(['code' => 'material', 'type' => 'text']);
    TikTokAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'name', 'sort_order' => 0]);
    makeTikTokCategoryAttribute(100, 'attr_material', 'Material', isCustomizable: true);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(0);
    $mapping = TikTokAttributeMapping::where('attribute_id', $attribute->id)->first();
    expect($mapping->target_field)->toBe('name');
    expect($mapping->tiktok_attribute_id)->toBeNull();
});

test('a name with no latin letters falls back to a deterministic hash-based code, distinct per source name', function () {
    makeTikTokCategoryAttribute(100, 'attr_1', 'สไตล์', isCustomizable: true);
    makeTikTokCategoryAttribute(100, 'attr_2', 'วัสดุ', isCustomizable: true);

    $this->creator->createMissingForCategory(100);

    $codes = Attribute::where('auto_created_platform', 'tiktok')->pluck('code')->sort()->values()->all();
    expect($codes)->toHaveCount(2);
    expect($codes[0])->not->toBe($codes[1]);
    foreach ($codes as $code) {
        expect($code)->toMatch('/^tt_[0-9a-f]{10}$/');
    }
});

test('malformed option entries (not an array, or missing an id) are skipped defensively', function () {
    makeTikTokCategoryAttribute(100, 'attr_color', 'Color', isCustomizable: false, options: [
        'not-an-array',
        ['name' => 'No id at all'],
        ['id' => 'red', 'name' => 'Red'],
    ]);

    $this->creator->createMissingForCategory(100);

    $attribute = Attribute::where('code', 'color')->first();
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(1);
});
