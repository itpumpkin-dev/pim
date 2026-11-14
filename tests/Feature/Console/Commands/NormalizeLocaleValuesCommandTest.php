<?php

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * Covers pim:normalize-locale-values (DB cleanup Phase 2a).
 */
function nlvLocale(string $code, bool $enabled = true): int
{
    return Locale::firstOrCreate(['code' => $code], ['display_name' => strtoupper($code), 'enabled' => $enabled])->id;
}

function nlvProduct(): Product
{
    return Product::create(['sku' => 'NLV-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
}

function nlvRows(Product $product, Attribute $attribute): array
{
    return ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)
        ->orderBy('id')->get()->map(fn ($v) => [$v->locale_id, $v->value])->all();
}

test('a language-neutral attribute stored only in th moves to the NULL-locale row and stops being locale based', function () {
    $th = nlvLocale('th');
    $attribute = Attribute::create(['code' => 'nlv_qty', 'type' => 'number', 'is_locale_based' => true]);
    $product = nlvProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $th, 'value' => '5']);

    $this->artisan('pim:normalize-locale-values')->assertSuccessful();

    expect(nlvRows($product, $attribute))->toBe([[null, '5']]);
    expect($attribute->fresh()->is_locale_based)->toBeFalse();
});

test('th wins over the NULL-locale row and translated codes are dropped', function () {
    $th = nlvLocale('th');
    $es = nlvLocale('es');
    $attribute = Attribute::create(['code' => 'nlv_select', 'type' => 'select', 'is_locale_based' => true]);
    $product = nlvProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'old']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $th, 'value' => 'edited']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $es, 'value' => 'editado']);

    $this->artisan('pim:normalize-locale-values')->assertSuccessful();

    expect(nlvRows($product, $attribute))->toBe([[null, 'edited']]);
});

test('master category codes keep the NULL-locale row', function () {
    $th = nlvLocale('th');
    $attribute = Attribute::firstOrCreate(['code' => 'pcatname'], ['type' => 'select']);
    $attribute->update(['is_locale_based' => true]);
    $product = nlvProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => 'A01']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $th, 'value' => 'B02']);

    $this->artisan('pim:normalize-locale-values')->assertSuccessful();

    expect(nlvRows($product, $attribute))->toBe([[null, 'A01']]);
});

test('text and media attributes stay locale based; a differing th value is copied into the base row', function () {
    $th = nlvLocale('th');
    $en = nlvLocale('en');
    $text = Attribute::create(['code' => 'nlv_desc', 'type' => 'textarea', 'is_locale_based' => true]);
    $file = Attribute::create(['code' => 'nlv_manual', 'type' => 'file', 'is_locale_based' => true]);
    $product = nlvProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $text->id, 'value' => 'from import']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $text->id, 'locale_id' => $th, 'value' => '<p>edited</p>']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $text->id, 'locale_id' => $en, 'value' => 'English']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $file->id, 'locale_id' => $th, 'value' => 'คู่มือ.pdf']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $file->id, 'locale_id' => $en, 'value' => 'manual.pdf']);

    $this->artisan('pim:normalize-locale-values')->assertSuccessful();

    expect(nlvRows($product, $text))->toBe([[null, '<p>edited</p>'], [$th, '<p>edited</p>'], [$en, 'English']]);
    expect(nlvRows($product, $file))->toBe([[$th, 'คู่มือ.pdf'], [$en, 'manual.pdf']]);
    expect($text->fresh()->is_locale_based)->toBeTrue();
    expect($file->fresh()->is_locale_based)->toBeTrue();
});

test('rows in disabled locales are left untouched', function () {
    nlvLocale('th');
    $ja = nlvLocale('ja_nlv', enabled: false);
    $attribute = Attribute::create(['code' => 'nlv_bool', 'type' => 'boolean', 'is_locale_based' => true]);
    $product = nlvProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $ja, 'value' => '1']);

    $this->artisan('pim:normalize-locale-values')->assertSuccessful();

    expect(nlvRows($product, $attribute))->toBe([[$ja, '1']]);
});

test('dry run changes nothing', function () {
    $th = nlvLocale('th');
    $attribute = Attribute::create(['code' => 'nlv_dry', 'type' => 'price', 'is_locale_based' => true]);
    $product = nlvProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'locale_id' => $th, 'value' => '99']);

    $this->artisan('pim:normalize-locale-values', ['--dry-run' => true])->assertSuccessful();

    expect(nlvRows($product, $attribute))->toBe([[$th, '99']]);
    expect($attribute->fresh()->is_locale_based)->toBeTrue();
});
