<?php

use App\Models\Attribute;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use App\Services\Catalog\WooCommerceMappedAttributeCreator;

function makeWooAttribute(int $id, string $name): WooCommerceAttribute
{
    return WooCommerceAttribute::firstOrCreate(['id' => $id], ['name' => $name]);
}

beforeEach(function () {
    $this->creator = new WooCommerceMappedAttributeCreator();
});

test('returns 0 when there are no WooCommerce attributes at all', function () {
    expect($this->creator->createMissingAttributes())->toBe(0);
});

test('skips an attribute already mapped to wc_attribute', function () {
    $wooAttribute = makeWooAttribute(501, 'color');
    $attribute = Attribute::create(['code' => 'pcolor', 'type' => 'text']);
    WooCommerceAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'wc_attribute', 'woocommerce_attribute_id' => $wooAttribute->id, 'sort_order' => 0]);

    expect($this->creator->createMissingAttributes())->toBe(0);
    expect(Attribute::where('code', 'color')->exists())->toBeFalse();
});

test('creates a PIM attribute (always type text) and maps it for each unmapped WooCommerce attribute', function () {
    makeWooAttribute(501, 'color');
    makeWooAttribute(502, 'fitting-position');

    $created = $this->creator->createMissingAttributes();

    expect($created)->toBe(2);

    $color = Attribute::where('code', 'color')->first();
    expect($color)->not->toBeNull();
    expect($color->type)->toBe('text');
    expect($color->auto_created_platform)->toBe('woocommerce');
    expect(WooCommerceAttributeMapping::where('attribute_id', $color->id)->where('woocommerce_attribute_id', 501)->exists())->toBeTrue();

    // hyphens sanitize to underscores, same as LazadaMappedAttributeCreator
    $fitting = Attribute::where('code', 'fitting_position')->first();
    expect($fitting)->not->toBeNull();
    expect(WooCommerceAttributeMapping::where('attribute_id', $fitting->id)->where('woocommerce_attribute_id', 502)->exists())->toBeTrue();
});

test('reuses an existing active text-type attribute whose code matches instead of creating a duplicate', function () {
    Attribute::create(['code' => 'material', 'type' => 'text']);
    makeWooAttribute(501, 'material');

    $created = $this->creator->createMissingAttributes();

    expect($created)->toBe(1);
    expect(Attribute::where('code', 'material')->count())->toBe(1);
    expect(WooCommerceAttributeMapping::where('woocommerce_attribute_id', 501)->exists())->toBeTrue();
});

test('a code collision with a non-text attribute creates a separate, disambiguated attribute instead of reusing it', function () {
    Attribute::create(['code' => 'color', 'type' => 'select']);
    makeWooAttribute(501, 'color');

    $this->creator->createMissingAttributes();

    expect(Attribute::where('code', 'color')->first()->type)->toBe('select');
    $new = Attribute::where('code', 'color_2')->first();
    expect($new)->not->toBeNull();
    expect($new->type)->toBe('text');
});

test('a code collision with a soft-deleted attribute does not revive it, and creates a disambiguated one instead', function () {
    $trashed = Attribute::create(['code' => 'material', 'type' => 'text']);
    $trashed->delete();
    makeWooAttribute(501, 'material');

    $this->creator->createMissingAttributes();

    $stillTrashed = Attribute::withTrashed()->where('code', 'material')->first();
    expect($stillTrashed->id)->toBe($trashed->id);
    expect($stillTrashed->trashed())->toBeTrue();
    expect(Attribute::where('code', 'material_2')->exists())->toBeTrue();
});

test('reusing an attribute that already has a mapping to a different target_field does not overwrite it and is not counted as created', function () {
    $attribute = Attribute::create(['code' => 'material', 'type' => 'text']);
    WooCommerceAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'name', 'sort_order' => 0]);
    makeWooAttribute(501, 'material');

    $created = $this->creator->createMissingAttributes();

    expect($created)->toBe(0);
    $mapping = WooCommerceAttributeMapping::where('attribute_id', $attribute->id)->first();
    expect($mapping->target_field)->toBe('name');
    expect($mapping->woocommerce_attribute_id)->toBeNull();
});

test('a name with no latin letters falls back to a deterministic hash-based code, distinct per source name', function () {
    makeWooAttribute(501, 'สไตล์');
    makeWooAttribute(502, 'วัสดุ');

    $this->creator->createMissingAttributes();

    $codes = Attribute::where('auto_created_platform', 'woocommerce')->pluck('code')->sort()->values()->all();
    expect($codes)->toHaveCount(2);
    expect($codes[0])->not->toBe($codes[1]);
    foreach ($codes as $code) {
        expect($code)->toMatch('/^wc_[0-9a-f]{10}$/');
    }
});

// --- race conditions: two concurrent syncs processing the same unmapped attribute ---

test('a concurrent attribute-code collision (same type) reuses the winner instead of crashing', function () {
    $winner = Attribute::create(['code' => 'newfield', 'type' => 'text']);

    $method = new ReflectionMethod($this->creator, 'createAttributeAt');
    $method->setAccessible(true);
    $result = $method->invoke($this->creator, 'newfield', 'New Field');

    expect($result->id)->toBe($winner->id);
    expect(Attribute::where('code', 'newfield')->count())->toBe(1);
});

test('a concurrent attribute-code collision (different type) disambiguates and retries instead of crashing', function () {
    Attribute::create(['code' => 'newfield', 'type' => 'select']);

    $method = new ReflectionMethod($this->creator, 'createAttributeAt');
    $method->setAccessible(true);
    $result = $method->invoke($this->creator, 'newfield', 'New Field');

    expect($result->code)->toBe('newfield_2');
    expect($result->type)->toBe('text');
});

test('a concurrent mapping-save collision on attribute_id returns false instead of crashing', function () {
    $attribute = Attribute::create(['code' => 'material', 'type' => 'text']);
    $wooAttribute = makeWooAttribute(501, 'material');
    WooCommerceAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'wc_attribute', 'woocommerce_attribute_id' => $wooAttribute->id, 'sort_order' => 0]);

    $racingMapping = new WooCommerceAttributeMapping();
    $racingMapping->attribute_id = $attribute->id;
    $racingMapping->target_field = 'wc_attribute';
    $racingMapping->woocommerce_attribute_id = $wooAttribute->id;
    $racingMapping->sort_order = 0;

    $method = new ReflectionMethod($this->creator, 'trySaveMapping');
    $method->setAccessible(true);
    $result = $method->invoke($this->creator, $racingMapping);

    expect($result)->toBeFalse();
    expect(WooCommerceAttributeMapping::where('attribute_id', $attribute->id)->count())->toBe(1);
});
