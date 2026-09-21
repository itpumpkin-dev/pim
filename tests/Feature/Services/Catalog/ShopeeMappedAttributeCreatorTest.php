<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use App\Models\ShopeeCategory;
use App\Models\ShopeeCategoryAttribute;
use App\Services\Catalog\ShopeeMappedAttributeCreator;

function ensureShopeeCategory(int $id): void
{
    ShopeeCategory::firstOrCreate(['id' => $id], ['name' => 'Test Shopee Category', 'is_leaf' => true]);
}

function makeShopeeAttribute(int $categoryId, int $shopeeAttributeId, string $name, int $inputType, ?array $options = null): void
{
    ensureShopeeCategory($categoryId);
    ShopeeAttribute::create(['id' => $shopeeAttributeId, 'name' => $name, 'input_type' => $inputType, 'options' => $options]);
    ShopeeCategoryAttribute::create(['category_id' => $categoryId, 'shopee_attribute_id' => $shopeeAttributeId]);
}

beforeEach(function () {
    $this->creator = new ShopeeMappedAttributeCreator();
});

test('returns 0 when the category has no shopee attributes at all', function () {
    ensureShopeeCategory(100);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
});

test('skips an attribute already mapped to shopee_attribute', function () {
    makeShopeeAttribute(100, 1, 'Color', inputType: 1);
    $attribute = Attribute::create(['code' => 'pcolor', 'type' => 'select']);
    ShopeeAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'shopee_attribute', 'shopee_attribute_id' => 1, 'sort_order' => 0]);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
    // No new attribute for this Shopee attribute (e.g. the sanitized-code
    // 'color') should have been created — the DB isn't otherwise empty of
    // Attribute rows: the app's migration history seeds a baseline
    // 'business_type' attribute as real data, not just schema.
    expect(Attribute::where('code', 'color')->exists())->toBeFalse();
});

test('skips an attribute that belongs to a different category', function () {
    makeShopeeAttribute(200, 1, 'Color', inputType: 1);
    ensureShopeeCategory(100);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
});

test('skips an attribute whose input_type is not one of the mappable types', function () {
    makeShopeeAttribute(100, 1, 'Weird', inputType: 99);

    expect($this->creator->createMissingForCategory(100))->toBe(0);
    expect(Attribute::where('code', 'weird')->exists())->toBeFalse();
});

test('a free-text attribute (input_type 3) creates a text attribute with no options', function () {
    makeShopeeAttribute(100, 1, 'Material', inputType: 3, options: [['value_id' => 1, 'name' => 'Cotton']]);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(1);
    $attribute = Attribute::where('code', 'material')->first();
    expect($attribute)->not->toBeNull();
    expect($attribute->type)->toBe('text');
    expect($attribute->auto_created_platform)->toBe('shopee');
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(0);
});

test('a single-select attribute (input_type 1) creates a select attribute with its options mapped', function () {
    makeShopeeAttribute(100, 1, 'Color', inputType: 1, options: [
        ['value_id' => 10, 'name' => 'Red'],
        ['value_id' => 20, 'name' => 'Blue'],
    ]);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(1);
    $attribute = Attribute::where('code', 'color')->first();
    expect($attribute->type)->toBe('select');

    $options = AttributeOption::where('attribute_id', $attribute->id)->orderBy('sort_order')->get();
    expect($options->pluck('code')->all())->toBe(['10', '20']);
    expect($options->pluck('admin_label')->all())->toBe(['Red', 'Blue']);

    $mapping = ShopeeAttributeMapping::where('attribute_id', $attribute->id)->first();
    expect(ShopeeAttributeOptionMapping::where('shopee_attribute_mapping_id', $mapping->id)->count())->toBe(2);
});

test('a multi-select attribute (input_type 4) creates a multiselect attribute', function () {
    makeShopeeAttribute(100, 1, 'Sizes', inputType: 4, options: [['value_id' => 1, 'name' => 'S']]);

    $this->creator->createMissingForCategory(100);

    expect(Attribute::where('code', 'sizes')->first()->type)->toBe('multiselect');
});

test('reuses an existing active attribute whose code and type both match instead of creating a duplicate', function () {
    Attribute::create(['code' => 'material', 'type' => 'text']);
    makeShopeeAttribute(100, 1, 'Material', inputType: 3);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(1);
    expect(Attribute::where('code', 'material')->count())->toBe(1);
    expect(ShopeeAttributeMapping::where('shopee_attribute_id', 1)->exists())->toBeTrue();
});

test('a code collision with a different-type attribute creates a separate, disambiguated attribute instead of reusing it', function () {
    Attribute::create(['code' => 'color', 'type' => 'text']); // pre-existing, wrong type for a select
    makeShopeeAttribute(100, 1, 'Color', inputType: 1);

    $this->creator->createMissingForCategory(100);

    expect(Attribute::where('code', 'color')->first()->type)->toBe('text');
    $new = Attribute::where('code', 'color_2')->first();
    expect($new)->not->toBeNull();
    expect($new->type)->toBe('select');
});

test('a code collision with a soft-deleted attribute does not revive it, and creates a disambiguated one instead', function () {
    $trashed = Attribute::create(['code' => 'material', 'type' => 'text']);
    $trashed->delete();
    makeShopeeAttribute(100, 1, 'Material', inputType: 3);

    $this->creator->createMissingForCategory(100);

    $stillTrashed = Attribute::withTrashed()->where('code', 'material')->first();
    expect($stillTrashed->id)->toBe($trashed->id);
    expect($stillTrashed->trashed())->toBeTrue();
    expect(Attribute::where('code', 'material_2')->exists())->toBeTrue();
});

test('reusing an attribute that already has a mapping to a different target_field does not overwrite it and is not counted as created', function () {
    $attribute = Attribute::create(['code' => 'material', 'type' => 'text']);
    ShopeeAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'name', 'sort_order' => 0]);
    makeShopeeAttribute(100, 1, 'Material', inputType: 3);

    $created = $this->creator->createMissingForCategory(100);

    expect($created)->toBe(0);
    $mapping = ShopeeAttributeMapping::where('attribute_id', $attribute->id)->first();
    expect($mapping->target_field)->toBe('name');
    expect($mapping->shopee_attribute_id)->toBeNull();
});

test('a name with no latin letters falls back to a deterministic hash-based code, distinct per source name', function () {
    makeShopeeAttribute(100, 1, 'สไตล์', inputType: 3);
    makeShopeeAttribute(100, 2, 'วัสดุ', inputType: 3);

    $this->creator->createMissingForCategory(100);

    $codes = Attribute::where('auto_created_platform', 'shopee')->pluck('code')->sort()->values()->all();
    expect($codes)->toHaveCount(2);
    expect($codes[0])->not->toBe($codes[1]);
    foreach ($codes as $code) {
        expect($code)->toMatch('/^sp_[0-9a-f]{10}$/');
    }
});

test('malformed option entries (not an array, or missing a value id) are skipped defensively', function () {
    makeShopeeAttribute(100, 1, 'Color', inputType: 1, options: [
        'not-an-array',
        ['name' => 'No id at all'],
        ['value_id' => 10, 'name' => 'Red'],
    ]);

    $this->creator->createMissingForCategory(100);

    $attribute = Attribute::where('code', 'color')->first();
    expect(AttributeOption::where('attribute_id', $attribute->id)->count())->toBe(1);
});

// --- race conditions: two concurrent syncs processing the same unmapped attribute ---

test('a concurrent attribute-code collision (same type) reuses the winner instead of crashing', function () {
    $winner = Attribute::create(['code' => 'newfield', 'type' => 'text']);

    $method = new ReflectionMethod($this->creator, 'createAttributeAt');
    $method->setAccessible(true);
    $result = $method->invoke($this->creator, 'newfield', 'text', 'New Field');

    expect($result->id)->toBe($winner->id);
    expect(Attribute::where('code', 'newfield')->count())->toBe(1);
});

test('a concurrent attribute-code collision (different type) disambiguates and retries instead of crashing', function () {
    Attribute::create(['code' => 'newfield', 'type' => 'select']);

    $method = new ReflectionMethod($this->creator, 'createAttributeAt');
    $method->setAccessible(true);
    $result = $method->invoke($this->creator, 'newfield', 'text', 'New Field');

    expect($result->code)->toBe('newfield_2');
    expect($result->type)->toBe('text');
});

test('a concurrent mapping-save collision on attribute_id returns false instead of crashing', function () {
    $attribute = Attribute::create(['code' => 'material', 'type' => 'text']);
    makeShopeeAttribute(100, 1, 'Material', inputType: 3);
    ShopeeAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'shopee_attribute', 'shopee_attribute_id' => 1, 'sort_order' => 0]);

    $racingMapping = new ShopeeAttributeMapping();
    $racingMapping->attribute_id = $attribute->id;
    $racingMapping->target_field = 'shopee_attribute';
    $racingMapping->shopee_attribute_id = 1;
    $racingMapping->sort_order = 0;

    $method = new ReflectionMethod($this->creator, 'trySaveMapping');
    $method->setAccessible(true);
    $result = $method->invoke($this->creator, $racingMapping);

    expect($result)->toBeFalse();
    expect(ShopeeAttributeMapping::where('attribute_id', $attribute->id)->count())->toBe(1);
});
