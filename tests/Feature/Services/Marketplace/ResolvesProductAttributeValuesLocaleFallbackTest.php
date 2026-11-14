<?php

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Marketplace\ResolvesProductAttributeValues;

/**
 * The locale_id = NULL row holds Thai content (bulk import always writes there), so a
 * marketplace push asking for 'th' must fall back to it when no th row exists — other
 * locales must not, or Thai text would be pushed into English fields.
 */
function localeFallbackResolver(): object
{
    return new class
    {
        use ResolvesProductAttributeValues;

        public function value(Product $product, string $code, ?string $locale): ?string
        {
            return $this->attributeValue($product, $code, null, $locale);
        }
    };
}

function localeFallbackProduct(string $attributeCode): Product
{
    Attribute::create(['code' => $attributeCode, 'type' => 'text', 'is_locale_based' => true]);

    return Product::create(['sku' => 'RPAV-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
}

test('th falls back to the NULL-locale row when there is no th row', function () {
    Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'TH', 'enabled' => true]);
    $product = localeFallbackProduct('rpav_name_a');
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => Attribute::idForCode('rpav_name_a'), 'value' => 'ชื่อจาก import']);

    expect(localeFallbackResolver()->value($product, 'rpav_name_a', 'th'))->toBe('ชื่อจาก import');
});

test('an existing th row wins over the NULL-locale row', function () {
    $thId = Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'TH', 'enabled' => true])->id;
    $product = localeFallbackProduct('rpav_name_b');
    $attributeId = Attribute::idForCode('rpav_name_b');
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributeId, 'value' => 'ค่าเก่า']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributeId, 'locale_id' => $thId, 'value' => 'ค่าที่แก้']);

    expect(localeFallbackResolver()->value($product, 'rpav_name_b', 'th'))->toBe('ค่าที่แก้');
});

test('en does not fall back to the Thai NULL-locale row', function () {
    Locale::firstOrCreate(['code' => 'en'], ['display_name' => 'EN', 'enabled' => true]);
    $product = localeFallbackProduct('rpav_name_c');
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => Attribute::idForCode('rpav_name_c'), 'value' => 'ชื่อไทย']);

    expect(localeFallbackResolver()->value($product, 'rpav_name_c', 'en'))->toBeNull();
});
