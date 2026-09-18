<?php

use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Channel;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Support\Facades\Storage;

/** @return object{attributeValue: Closure, attributeImageUrls: Closure, resolveProductImageUrls: Closure, resolveMappedField: Closure, mappedBrandOptionId: Closure} */
function traitFixture(): object
{
    // Wrapper method names deliberately differ from the trait's own private
    // method names (attributeValue(), etc.) — a class-defined method of the
    // same name silently overrides a trait method with no conflict error,
    // which previously turned every call into infinite self-recursion.
    return new class {
        use ResolvesProductAttributeValues;

        public function callAttributeValue(Product $p, string $code, ?int $channelId, ?string $localeCode = null): ?string
        {
            return $this->attributeValue($p, $code, $channelId, $localeCode);
        }

        public function callAttributeImageUrls(Product $p, string $code, ?int $channelId): array
        {
            return $this->attributeImageUrls($p, $code, $channelId);
        }

        public function callResolveProductImageUrls(Product $p, ?int $channelId): array
        {
            return $this->resolveProductImageUrls($p, $channelId);
        }

        public function callResolveMappedField(\Illuminate\Support\Collection $mappings, string $targetField, Product $p, ?int $channelId, ?string $localeCode = null): ?string
        {
            return $this->resolveMappedField($mappings, $targetField, $p, $channelId, $localeCode);
        }

        public function callMappedBrandOptionId(Product $p, string $column): ?int
        {
            return $this->mappedBrandOptionId($p, $column);
        }
    };
}

function traitAttr(string $code, array $extra = []): Attribute
{
    return Attribute::create(array_merge(['code' => $code, 'type' => 'text'], $extra));
}

function traitProduct(): Product
{
    return Product::create(['sku' => 'SKU-'.uniqid()]);
}

// --- attributeValue: plain (not channel/locale-based) ---

test('attributeValue reads a plain attribute\'s global (null channel/locale) ProductValue', function () {
    $attr = traitAttr('pname');
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => 'Widget']);

    expect(traitFixture()->callAttributeValue($product, 'pname', null))->toBe('Widget');
});

test('attributeValue returns null when the attribute code does not exist at all', function () {
    $product = traitProduct();

    expect(traitFixture()->callAttributeValue($product, 'no_such_attr', null))->toBeNull();
});

// --- channel-based fallback ---

test('a channel-based attribute reads the value scoped to that channel', function () {
    $channel = Channel::create(['code' => 'ch_'.uniqid()]);
    $attr = traitAttr('price_std', ['is_channel_based' => true]);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'channel_id' => $channel->id, 'value' => '150']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'channel_id' => null, 'value' => '100']);

    expect(traitFixture()->callAttributeValue($product, 'price_std', $channel->id))->toBe('150');
});

test('a channel-based attribute with no value for that channel falls back to the product\'s default (null-channel) value', function () {
    $attr = traitAttr('price_std', ['is_channel_based' => true]);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'channel_id' => null, 'value' => '100']);

    expect(traitFixture()->callAttributeValue($product, 'price_std', 5))->toBe('100');
});

test('a non-channel-based attribute ignores the passed channel id entirely and always reads the global row', function () {
    $attr = traitAttr('pname'); // is_channel_based = false
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'channel_id' => null, 'value' => 'Widget']);

    expect(traitFixture()->callAttributeValue($product, 'pname', 5))->toBe('Widget');
});

// --- locale-based ---

test('a locale-based attribute reads the row for the resolved locale, not the null-locale row', function () {
    $th = Locale::firstOrCreate(['code' => 'th'], ['enabled' => true]);
    $attr = traitAttr('pname', ['is_locale_based' => true]);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'locale_id' => null, 'value' => 'Global']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'locale_id' => $th->id, 'value' => 'Thai']);

    expect(traitFixture()->callAttributeValue($product, 'pname', null, 'th'))->toBe('Thai');
});

test('a locale-based attribute with no localeCode given reads the null-locale row', function () {
    $attr = traitAttr('pname', ['is_locale_based' => true]);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'locale_id' => null, 'value' => 'Global']);

    expect(traitFixture()->callAttributeValue($product, 'pname', null, null))->toBe('Global');
});

// --- gallery formatting ---

test('attributeValue on a gallery-type attribute returns only the first URL', function () {
    Storage::fake('public');
    $attr = traitAttr('pgallery', ['type' => 'gallery']);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => json_encode(['a.jpg', 'b.jpg'])]);

    $url = traitFixture()->callAttributeValue($product, 'pgallery', null);
    expect($url)->toBe(Storage::disk('public')->url('a.jpg'));
});

test('attributeImageUrls on a gallery attribute returns every resolved URL', function () {
    Storage::fake('public');
    $attr = traitAttr('pgallery', ['type' => 'gallery']);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => json_encode(['a.jpg', 'b.jpg'])]);

    $urls = traitFixture()->callAttributeImageUrls($product, 'pgallery', null);
    expect($urls)->toBe([Storage::disk('public')->url('a.jpg'), Storage::disk('public')->url('b.jpg')]);
});

test('attributeImageUrls on a single image attribute (not gallery) returns a one-element array', function () {
    Storage::fake('public');
    $attr = traitAttr('pimage', ['type' => 'image']);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => 'a.jpg']);

    expect(traitFixture()->callAttributeImageUrls($product, 'pimage', null))->toBe([Storage::disk('public')->url('a.jpg')]);
});

test('attributeImageUrls returns an empty array when there is no value at all', function () {
    traitAttr('pimage', ['type' => 'image']);
    $product = traitProduct();

    expect(traitFixture()->callAttributeImageUrls($product, 'pimage', null))->toBe([]);
});

// --- resolveProductImageUrls: gallery-preferred-over-single fallback ---

test('resolveProductImageUrls prefers pgallery over the legacy single pimage when the gallery has images', function () {
    Storage::fake('public');
    traitAttr('pgallery', ['type' => 'gallery']);
    $imageAttr = traitAttr('pimage', ['type' => 'image']);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => Attribute::where('code', 'pgallery')->value('id'), 'value' => json_encode(['g.jpg'])]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $imageAttr->id, 'value' => 'single.jpg']);

    $urls = traitFixture()->callResolveProductImageUrls($product, null);
    expect($urls)->toBe([Storage::disk('public')->url('g.jpg')]);
});

test('resolveProductImageUrls falls back to the legacy single pimage when pgallery is empty', function () {
    Storage::fake('public');
    traitAttr('pgallery', ['type' => 'gallery']);
    $imageAttr = traitAttr('pimage', ['type' => 'image']);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $imageAttr->id, 'value' => 'single.jpg']);

    expect(traitFixture()->callResolveProductImageUrls($product, null))->toBe([Storage::disk('public')->url('single.jpg')]);
});

// --- resolveMappedField ---

test('resolveMappedField returns the first mapping (in order given) that has an actual value', function () {
    $attrA = traitAttr('attr_a');
    $attrB = traitAttr('attr_b');
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attrB->id, 'value' => 'B value']);

    $mappings = collect([
        (object) ['target_field' => 'name', 'attribute' => $attrA],
        (object) ['target_field' => 'name', 'attribute' => $attrB],
    ]);

    expect(traitFixture()->callResolveMappedField($mappings, 'name', $product, null))->toBe('B value');
});

test('resolveMappedField treats a legitimately-mapped "0" value as present, not as empty', function () {
    $attr = traitAttr('weight');
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => '0']);

    $mappings = collect([(object) ['target_field' => 'weight', 'attribute' => $attr]]);

    expect(traitFixture()->callResolveMappedField($mappings, 'weight', $product, null))->toBe('0');
});

test('resolveMappedField skips a mapping whose attribute relation is null (e.g. soft-deleted)', function () {
    $attr = traitAttr('attr_a');
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => 'Real value']);

    $mappings = collect([
        (object) ['target_field' => 'name', 'attribute' => null],
        (object) ['target_field' => 'name', 'attribute' => $attr],
    ]);

    expect(traitFixture()->callResolveMappedField($mappings, 'name', $product, null))->toBe('Real value');
});

test('resolveMappedField ignores mappings for a different target_field', function () {
    $attr = traitAttr('attr_a');
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'value' => 'Value']);

    $mappings = collect([(object) ['target_field' => 'price', 'attribute' => $attr]]);

    expect(traitFixture()->callResolveMappedField($mappings, 'name', $product, null))->toBeNull();
});

// --- mappedBrandOptionId ---

test('mappedBrandOptionId resolves the platform brand id through the product\'s pbrand -> Brand row', function () {
    traitAttr('pbrand', ['type' => 'select']);
    Brand::create(['code' => 'acme', 'name' => 'Acme', 'shopee_brand_id' => 999]);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => Attribute::where('code', 'pbrand')->value('id'), 'value' => 'acme']);

    expect(traitFixture()->callMappedBrandOptionId($product, 'shopee_brand_id'))->toBe(999);
});

test('mappedBrandOptionId returns null when the product has no pbrand value', function () {
    traitAttr('pbrand', ['type' => 'select']);
    $product = traitProduct();

    expect(traitFixture()->callMappedBrandOptionId($product, 'shopee_brand_id'))->toBeNull();
});

test('mappedBrandOptionId returns null when the linked Brand has no mapping for this platform column', function () {
    traitAttr('pbrand', ['type' => 'select']);
    Brand::create(['code' => 'acme', 'name' => 'Acme']);
    $product = traitProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => Attribute::where('code', 'pbrand')->value('id'), 'value' => 'acme']);

    expect(traitFixture()->callMappedBrandOptionId($product, 'shopee_brand_id'))->toBeNull();
});
