<?php

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * Covers pim:move-base-locale-values (DB cleanup Phase 2b).
 */
function mblLocale(string $code, bool $enabled = true): int
{
    return Locale::firstOrCreate(['code' => $code], ['display_name' => strtoupper($code), 'enabled' => $enabled])->id;
}

function mblRows(Product $product, Attribute $attribute): array
{
    return ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)
        ->orderBy('locale_id')->get()->map(fn ($v) => [$v->locale_id, $v->value])->all();
}

function mblSetup(): array
{
    // ไม่ให้ attribute ที่ seed มากับ DB ทดสอบ (ถ้ามี) ทำให้คำสั่งปฏิเสธการรัน
    Attribute::where('is_locale_based', true)
        ->where(fn ($q) => $q->whereIn('type', ['number', 'price', 'date', 'boolean', 'select', 'multiselect'])->orWhere('is_unique', true))
        ->update(['is_locale_based' => false]);

    return [
        Attribute::create(['code' => 'mbl_desc_'.uniqid(), 'type' => 'textarea', 'is_locale_based' => true]),
        Product::create(['sku' => 'MBL-'.uniqid(), 'type' => 'simple', 'enabled' => false]),
    ];
}

test('a NULL-locale value with no th row moves to th', function () {
    $th = mblLocale('th');
    [$attribute, $product] = mblSetup();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'จาก import']);

    $this->artisan('pim:move-base-locale-values')->assertSuccessful();

    expect(mblRows($product, $attribute))->toBe([[$th, 'จาก import']]);
});

test('an existing th row wins and the NULL-locale row is removed', function () {
    $th = mblLocale('th');
    [$attribute, $product] = mblSetup();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'เก่า']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $th, 'value' => 'ที่แก้']);

    $this->artisan('pim:move-base-locale-values')->assertSuccessful();

    expect(mblRows($product, $attribute))->toBe([[$th, 'ที่แก้']]);
});

test('untranslated copies are removed, real translations and disabled locales are kept', function () {
    $th = mblLocale('th');
    $en = mblLocale('en');
    $es = mblLocale('es');
    $ja = mblLocale('ja_mbl', enabled: false);
    [$attribute, $product] = mblSetup();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'สว่าน']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $en, 'value' => 'Drill']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $es, 'value' => 'สว่าน']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $ja, 'value' => 'สว่าน']);

    $this->artisan('pim:move-base-locale-values')->assertSuccessful();

    expect(mblRows($product, $attribute))->toBe(collect([[$th, 'สว่าน'], [$en, 'Drill'], [$ja, 'สว่าน']])->sortBy(0)->values()->all());
});

test('non-locale attributes keep their NULL-locale row', function () {
    mblLocale('th');
    [, $product] = mblSetup();
    $weight = Attribute::create(['code' => 'mbl_weight_'.uniqid(), 'type' => 'text', 'is_locale_based' => false]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $weight->id, 'value' => '2.5']);

    $this->artisan('pim:move-base-locale-values')->assertSuccessful();

    expect(mblRows($product, $weight))->toBe([[null, '2.5']]);
});

test('it refuses to run while a language-neutral attribute is still locale based', function () {
    mblLocale('th');
    mblSetup();
    Attribute::create(['code' => 'mbl_qty_'.uniqid(), 'type' => 'number', 'is_locale_based' => true]);

    $this->artisan('pim:move-base-locale-values')->assertFailed();
});

test('dry run changes nothing', function () {
    mblLocale('th');
    [$attribute, $product] = mblSetup();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'ค่า']);

    $this->artisan('pim:move-base-locale-values', ['--dry-run' => true])->assertSuccessful();

    expect(mblRows($product, $attribute))->toBe([[null, 'ค่า']]);
});
