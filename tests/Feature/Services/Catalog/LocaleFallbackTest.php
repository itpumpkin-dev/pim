<?php

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\LocaleFallback;
use App\Services\Catalog\ProductNameLookup;

/**
 * DB cleanup Phase 2b — one fallback rule for per-locale values: requested locale → th → NULL row.
 */
function lfLocale(string $code): int
{
    return Locale::firstOrCreate(['code' => $code], ['display_name' => strtoupper($code), 'enabled' => true])->id;
}

function lfRow(?int $localeId, ?string $value): object
{
    return (object) ['locale_id' => $localeId, 'value' => $value];
}

test('pick prefers the requested locale, then th, then the NULL row', function () {
    $th = lfLocale('th');
    $en = lfLocale('en');

    expect(LocaleFallback::pick([lfRow(null, 'legacy'), lfRow($th, 'ไทย'), lfRow($en, 'English')], $en)->value)->toBe('English');
    expect(LocaleFallback::pick([lfRow(null, 'legacy'), lfRow($th, 'ไทย')], $en)->value)->toBe('ไทย');
    expect(LocaleFallback::pick([lfRow(null, 'legacy')], $en)->value)->toBe('legacy');
});

test('pick skips empty values and only uses other locales when allowed', function () {
    $th = lfLocale('th');
    $en = lfLocale('en');
    $zh = lfLocale('zh');

    expect(LocaleFallback::pick([lfRow($th, ''), lfRow(null, 'legacy')], $en)->value)->toBe('legacy');
    expect(LocaleFallback::pick([lfRow($zh, '中文')], $en))->toBeNull();
    expect(LocaleFallback::pick([lfRow($zh, '中文')], $en, anyLocale: true)->value)->toBe('中文');
});

test('the inLocale scope orders rows by the fallback chain', function () {
    $th = lfLocale('th');
    $en = lfLocale('en');
    $zh = lfLocale('zh');
    $attribute = Attribute::create(['code' => 'lf_scope_attr', 'type' => 'text', 'is_locale_based' => true]);
    $product = Product::create(['sku' => 'LF-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    foreach ([[null, 'legacy'], [$zh, '中文'], [$th, 'ไทย']] as [$localeId, $value]) {
        ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $localeId, 'value' => $value]);
    }

    $query = fn () => ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->inLocale($en);

    expect($query()->value('value'))->toBe('ไทย');
    expect($query()->pluck('value')->all())->toBe(['ไทย', 'legacy']); // zh is not part of en's chain
});

test('product names fall back from the screen locale to Thai', function () {
    $th = lfLocale('th');
    $en = lfLocale('en');
    $pname = Attribute::firstOrCreate(['code' => 'pname'], ['type' => 'text', 'is_locale_based' => true]);
    Attribute::bumpCodeMapVersion();
    $translated = Product::create(['sku' => 'LF-A-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $untranslated = Product::create(['sku' => 'LF-B-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    ProductValue::create(['product_id' => $translated->id, 'attribute_id' => $pname->id, 'locale_id' => $th, 'value' => 'สว่าน']);
    ProductValue::create(['product_id' => $translated->id, 'attribute_id' => $pname->id, 'locale_id' => $en, 'value' => 'Drill']);
    ProductValue::create(['product_id' => $untranslated->id, 'attribute_id' => $pname->id, 'locale_id' => $th, 'value' => 'ค้อน']);

    $names = ProductNameLookup::names([$translated->id, $untranslated->id], $en);

    expect($names[$translated->id])->toBe('Drill');
    expect($names[$untranslated->id])->toBe('ค้อน');
});

test('applySmartDefaults writes the default name only to the th row', function () {
    $th = lfLocale('th');
    lfLocale('en');
    $pname = Attribute::firstOrCreate(['code' => 'pname'], ['type' => 'text', 'is_locale_based' => true]);
    $product = Product::create(['sku' => 'LF-SD-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    $product->applySmartDefaults();

    $rows = ProductValue::where('product_id', $product->id)->where('attribute_id', $pname->id)->get();
    expect($rows)->toHaveCount(1);
    expect($rows->first()->locale_id)->toBe($th);
    expect($rows->first()->value)->toBe($product->sku);
});

test('applySmartDefaults reuses a legacy NULL-row name instead of the SKU', function () {
    $th = lfLocale('th');
    $pname = Attribute::firstOrCreate(['code' => 'pname'], ['type' => 'text', 'is_locale_based' => true]);
    $product = Product::create(['sku' => 'LF-LEG-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $pname->id, 'value' => 'ชื่อเดิม']);

    $product->applySmartDefaults();

    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $pname->id)->where('locale_id', $th)->value('value'))->toBe('ชื่อเดิม');
});

test('a unique code attribute (pid) is written to the NULL row even while still flagged locale based', function () {
    lfLocale('th');
    $pid = Attribute::firstOrCreate(['code' => 'pid'], ['type' => 'text']);
    $pid->update(['is_locale_based' => true, 'is_unique' => true]);
    $product = Product::create(['sku' => 'LF-PID-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    $product->applySmartDefaults();

    $rows = ProductValue::where('product_id', $product->id)->where('attribute_id', $pid->id)->get();
    expect($rows->map(fn ($v) => [$v->locale_id, $v->value])->all())->toBe([[null, $product->sku]]);
});
