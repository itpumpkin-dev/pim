<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\LazadaCategory;
use App\Models\LazadaCategoryAttribute;
use App\Services\Catalog\LazadaMappedAttributeCreator;

function ensureLazadaCategory(int $id): void
{
    LazadaCategory::firstOrCreate(['id' => $id], ['name' => 'Test Lazada Category', 'is_leaf' => true]);
}

function makeLazadaCategoryAttribute(int $categoryId, string $name, string $inputType, ?array $options = null): void
{
    ensureLazadaCategory($categoryId);
    LazadaAttribute::firstOrCreate(['name' => $name], ['label' => $name, 'input_type' => $inputType, 'options' => $options]);
    LazadaCategoryAttribute::create(['category_id' => $categoryId, 'lazada_attribute_name' => $name]);
}

beforeEach(function () {
    $this->creator = new LazadaMappedAttributeCreator();
});

test('returns 0 when the category has no lazada attributes at all', function () {
    ensureLazadaCategory(100);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
});

test('skips an attribute already mapped to lazada_attribute', function () {
    makeLazadaCategoryAttribute(100, 'Color', 'singleSelect');
    $attribute = Attribute::create(['code' => 'pcolor', 'type' => 'select']);
    LazadaAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'lazada_attribute', 'lazada_attribute_name' => 'Color', 'sort_order' => 0]);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
    expect(Attribute::where('code', 'color')->exists())->toBeFalse();
});

test('skips an attribute that belongs to a different category', function () {
    makeLazadaCategoryAttribute(200, 'Color', 'singleSelect');
    ensureLazadaCategory(100);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
});

test('skips an attribute whose input_type is not one of the mappable types', function () {
    makeLazadaCategoryAttribute(100, 'Weird', 'unsupportedType');

    expect($this->creator->createMissingForCategory(100))->toBe(0);
    expect(Attribute::where('code', 'weird')->exists())->toBeFalse();
});

test('maps each Lazada input_type to the correct PIM attribute type', function (string $inputType, string $expectedPimType) {
    makeLazadaCategoryAttribute(100, 'Field', $inputType);

    $this->creator->createMissingForCategory(100);

    expect(Attribute::where('code', 'field')->first()->type)->toBe($expectedPimType);
})->with([
    ['text', 'text'],
    ['numeric', 'number'],
    ['richText', 'textarea'],
    ['date', 'date'],
    ['img', 'image'],
    ['singleSelect', 'select'],
    ['enumInput', 'select'],
    ['multiSelect', 'multiselect'],
    ['multiEnumInput', 'multiselect'],
]);

test('a select-type attribute creates its options and 1:1 option mappings', function () {
    makeLazadaCategoryAttribute(100, 'Color', 'singleSelect', options: [
        ['id' => 10, 'name' => 'Red'],
        ['id' => 20, 'name' => 'Blue'],
    ]);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(1);
    $attribute = Attribute::where('code', 'color')->first();
    expect($attribute->type)->toBe('select');
    expect($attribute->auto_created_platform)->toBe('lazada');

    $options = AttributeOption::where('attribute_id', $attribute->id)->orderBy('sort_order')->get();
    expect($options->pluck('code')->all())->toBe(['10', '20']);

    $mapping = LazadaAttributeMapping::where('attribute_id', $attribute->id)->first();
    expect(LazadaAttributeOptionMapping::where('lazada_attribute_mapping_id', $mapping->id)->count())->toBe(2);
});

test('reuses an existing active attribute whose code and type both match instead of creating a duplicate', function () {
    Attribute::create(['code' => 'material', 'type' => 'text']);
    makeLazadaCategoryAttribute(100, 'Material', 'text');

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(1);
    expect(Attribute::where('code', 'material')->count())->toBe(1);
    expect(LazadaAttributeMapping::where('lazada_attribute_name', 'Material')->exists())->toBeTrue();
});

test('a code collision with a different-type attribute creates a separate, disambiguated attribute instead of reusing it', function () {
    Attribute::create(['code' => 'color', 'type' => 'text']);
    makeLazadaCategoryAttribute(100, 'Color', 'singleSelect');

    $this->creator->createMissingForCategory(100);

    expect(Attribute::where('code', 'color')->first()->type)->toBe('text');
    $new = Attribute::where('code', 'color_2')->first();
    expect($new)->not->toBeNull();
    expect($new->type)->toBe('select');
});

test('a code collision with a soft-deleted attribute does not revive it, and creates a disambiguated one instead', function () {
    $trashed = Attribute::create(['code' => 'material', 'type' => 'text']);
    $trashed->delete();
    makeLazadaCategoryAttribute(100, 'Material', 'text');

    $this->creator->createMissingForCategory(100);

    $stillTrashed = Attribute::withTrashed()->where('code', 'material')->first();
    expect($stillTrashed->id)->toBe($trashed->id);
    expect($stillTrashed->trashed())->toBeTrue();
    expect(Attribute::where('code', 'material_2')->exists())->toBeTrue();
});

test('reusing an attribute that already has a mapping to a different target_field does not overwrite it and is not counted as created', function () {
    $attribute = Attribute::create(['code' => 'material', 'type' => 'text']);
    LazadaAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'name', 'sort_order' => 0]);
    makeLazadaCategoryAttribute(100, 'Material', 'text');

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(0);
    $mapping = LazadaAttributeMapping::where('attribute_id', $attribute->id)->first();
    expect($mapping->target_field)->toBe('name');
    expect($mapping->lazada_attribute_name)->toBeNull();
});

test('a name with no latin letters falls back to a deterministic hash-based code, distinct per source name', function () {
    makeLazadaCategoryAttribute(100, 'สไตล์', 'text');
    makeLazadaCategoryAttribute(100, 'วัสดุ', 'text');

    $this->creator->createMissingForCategory(100);

    $codes = Attribute::where('auto_created_platform', 'lazada')->pluck('code')->sort()->values()->all();
    expect($codes)->toHaveCount(2);
    expect($codes[0])->not->toBe($codes[1]);
    foreach ($codes as $code) {
        expect($code)->toMatch('/^lz_[0-9a-f]{10}$/');
    }
});

test('malformed option entries (not an array, or missing an id) are skipped defensively', function () {
    makeLazadaCategoryAttribute(100, 'Color', 'singleSelect', options: [
        'not-an-array',
        ['name' => 'No id at all'],
        ['id' => 10, 'name' => 'Red'],
    ]);

    $this->creator->createMissingForCategory(100);

    $attribute = Attribute::where('code', 'color')->first();
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(1);
});
