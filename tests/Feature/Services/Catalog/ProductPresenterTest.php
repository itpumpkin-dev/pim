<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Services\Catalog\ProductPresenter;
use Illuminate\Support\Facades\Storage;

function presenterAttr(string $code, string $type = 'text'): Attribute
{
    return Attribute::firstOrCreate(['code' => $code], ['type' => $type]);
}

function setProductValue(Product $product, string $attributeCode, ?string $value, ?int $localeId = null): void
{
    $attribute = presenterAttr($attributeCode);
    ProductValue::create([
        'product_id' => $product->id,
        'attribute_id' => $attribute->id,
        'locale_id' => $localeId,
        'value' => $value,
    ]);
}

test('mapMany on an empty product collection returns an empty array', function () {
    expect(ProductPresenter::mapMany(collect()))->toBe([]);
});

test('maps a product\'s basic fields, falling back to sensible defaults when values are missing', function () {
    $product = Product::create(['sku' => 'SKU-1']);

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result)->toHaveCount(1);
    expect($result[0]['name'])->toBe('SKU-1'); // falls back to sku
    expect($result[0]['brand'])->toBe('-');
    expect($result[0]['category'])->toBe('ทั่วไป');
    expect($result[0]['packUnit'])->toBe('ชิ้น');
    expect($result[0]['packQty'])->toBe(1);
    expect($result[0]['price'])->toBe(0.0);
});

test('uses the pname/pbrand ProductValue rows for the default locale (th) when present', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'pname', 'Widget');
    setProductValue($product, 'pbrand', 'ACME');

    $result = ProductPresenter::mapMany(collect([$product]), 'th');

    expect($result[0]['name'])->toBe('Widget');
    expect($result[0]['brand'])->toBe('ACME');
});

test('a locale-specific value wins over a null-locale (global) value for the same attribute', function () {
    $th = Locale::firstOrCreate(['code' => 'th'], ['enabled' => true]);
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'pname', 'Global Name', localeId: null);
    setProductValue($product, 'pname', 'Thai Name', localeId: $th->id);

    $result = ProductPresenter::mapMany(collect([$product]), 'th');

    expect($result[0]['name'])->toBe('Thai Name');
});

test('a value for a different locale than requested is not picked up', function () {
    $en = Locale::firstOrCreate(['code' => 'en'], ['enabled' => true]);
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'pname', 'English Name', localeId: $en->id);

    $result = ProductPresenter::mapMany(collect([$product]), 'th');

    expect($result[0]['name'])->toBe('SKU-1'); // falls back, English value ignored
});

test('resolves pbrand/pcatname/pbaseunit stored option codes to their admin_label', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    $brandAttr = presenterAttr('pbrand', 'select');
    AttributeOption::create(['attribute_id' => $brandAttr->id, 'code' => 'pumpkin', 'admin_label' => 'พัมคิน']);
    setProductValue($product, 'pbrand', 'pumpkin');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['brand'])->toBe('พัมคิน');
});

test('a select value that matches no AttributeOption passes through unresolved', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    presenterAttr('pbrand', 'select');
    setProductValue($product, 'pbrand', 'free-typed-brand');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['brand'])->toBe('free-typed-brand');
});

test('the real category tree assignment takes priority over the legacy pcatname attribute, climbing to the root ancestor', function () {
    $root = Category::create(['code' => 'a', 'name' => 'Tools']);
    $sub = Category::create(['code' => 'a025', 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'a025001', 'name' => 'Group', 'parent_id' => $sub->id]);

    $product = Product::create(['sku' => 'SKU-1']);
    $product->categories()->attach($group->id);
    setProductValue($product, 'pcatname', 'legacy fallback category name');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['category'])->toBe('Tools');
});

test('falls back to the legacy pcatname attribute value when the product has no real category assigned', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'pcatname', 'Legacy Category');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['category'])->toBe('Legacy Category');
});

test('eol=1 adds an error-colored "เลิกผลิต" tag; anything else adds no tag', function () {
    $discontinued = Product::create(['sku' => 'SKU-1']);
    setProductValue($discontinued, 'eol', '1');
    $active = Product::create(['sku' => 'SKU-2']);
    setProductValue($active, 'eol', '0');

    $result = ProductPresenter::mapMany(collect([$discontinued, $active]));

    expect($result[0])->toHaveKey('tag', 'เลิกผลิต');
    expect($result[0]['tagColor'])->toBe('error');
    expect($result[1])->not->toHaveKey('tag');
});

test('price falls back from price_std to price_recommend, then to 0', function () {
    $withStd = Product::create(['sku' => 'SKU-1']);
    setProductValue($withStd, 'price_std', '100');
    setProductValue($withStd, 'price_recommend', '200');

    $withRecommendOnly = Product::create(['sku' => 'SKU-2']);
    setProductValue($withRecommendOnly, 'price_recommend', '150');

    $result = ProductPresenter::mapMany(collect([$withStd, $withRecommendOnly]));

    expect($result[0]['price'])->toBe(100.0);
    expect($result[1]['price'])->toBe(150.0);
});

test('a restricted viewer sees null/default values for attributes their role cannot view, and the pricing/packaging flags reflect it', function () {
    presenterAttr('price_std');
    // Granting only view_pname means view_attributes has been "touched",
    // so canViewAttribute()'s untouched-resource default-allow no longer
    // applies to price_std — it's denied for not being explicitly listed.
    $role = Role::create(['label' => 'Restricted '.uniqid()]);
    RolePermission::create(['role_id' => $role->id, 'resource' => 'view_attributes', 'action' => 'view_pname', 'granted' => true]);
    $user = User::factory()->create();
    $user->roles()->attach($role);

    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'pname', 'Widget');
    setProductValue($product, 'price_std', '999');

    $result = ProductPresenter::mapMany(collect([$product]), 'th', $user);

    expect($result[0]['name'])->toBe('Widget'); // explicitly allowed
    expect($result[0]['price'])->toBe(0.0); // not allowed -> cleared, falls to 0
    expect($result[0]['canViewPricing'])->toBeFalse();
});

test('a null viewer (public storefront) is unrestricted', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'price_std', '999');

    $result = ProductPresenter::mapMany(collect([$product]), 'th', null);

    expect($result[0]['price'])->toBe(999.0);
    expect($result[0]['canViewPricing'])->toBeTrue();
});

test('spec labels use the Attribute\'s own name when it exists, falling back to the hardcoded Thai label otherwise', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    $attr = presenterAttr('spec_specifications');
    $attr->update(['name' => 'Custom Spec Label']);
    setProductValue($product, 'spec_specifications', 'Some spec text');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['specs'])->toHaveKey('Custom Spec Label', 'Some spec text');
});

test('warranty_period is suffixed with the Thai word for months', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'warranty_period', '12');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['specs'])->toHaveKey('การรับประกัน', '12 เดือน');
});

test('highlights splits HTML list/br markup into trimmed, non-empty lines', function () {
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'spec_features', '<li>Feature A</li><li>Feature B</li><br><li></li>');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['highlights'])->toBe(['Feature A', 'Feature B']);
});

test('an image value is resolved to a public storage URL via AttributeValueFormatter', function () {
    Storage::fake('public');
    $product = Product::create(['sku' => 'SKU-1']);
    setProductValue($product, 'pimage', 'products/photo.jpg');

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['image'])->toBe(Storage::disk('public')->url('products/photo.jpg'));
});

test('a multi-group spec attribute resolves to its primary (lowest id) group value, not whichever row the DB returns last', function () {
    // spec_specifications/spec_features/... can now be placed in more than
    // one attribute_group_id (see migration
    // 2026_09_23_000001_add_attribute_group_id_to_product_values_table) —
    // this is the exact scenario the user reported (same attribute shown
    // under two group tabs on the product edit page). The storefront still
    // only has one "specs" slot per attribute code, so it must pick
    // deterministically instead of whichever row happens to come back last.
    $product = Product::create(['sku' => 'SKU-MULTIGROUP']);
    $attribute = presenterAttr('spec_specifications');
    $groupLow = \App\Models\AttributeGroup::create(['code' => 'presenter_group_low']);
    $groupHigh = \App\Models\AttributeGroup::create(['code' => 'presenter_group_high']);
    expect($groupLow->id)->toBeLessThan($groupHigh->id);

    // Insert the higher group id FIRST so a naive "last row wins" pick would
    // get this wrong.
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupHigh->id, 'value' => 'From higher group']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupLow->id, 'value' => 'From lower group']);

    $result = ProductPresenter::mapMany(collect([$product]));

    expect($result[0]['specs'])->toHaveKey('ข้อมูลจำเพาะ', 'From lower group');
});
