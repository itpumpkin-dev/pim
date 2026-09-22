<?php

use App\Http\Controllers\Api\ProductLookupController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * ProductLookupController::resolveValue() used a bare $rows->first()/foreach
 * with no group awareness — nondeterministic once an attribute can hold
 * more than one row (one per attribute_group_id placement, see migration
 * 2026_09_23_000001_add_attribute_group_id_to_product_values_table). It now
 * deterministically prefers the ungrouped/lowest-group-id row, same
 * convention as EffectiveFamilyAttributeResolver::primaryGroupIdFor().
 */
function plcController(): ProductLookupController
{
    return app(ProductLookupController::class);
}

test('show() resolves a plain multi-group attribute to its primary (lowest id) group value', function () {
    $attribute = Attribute::create(['code' => 'plc_multi_attr', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'plc_group_a']);
    $groupB = AttributeGroup::create(['code' => 'plc_group_b']);
    $family = AttributeFamily::create(['code' => 'plc_family', 'name' => 'PLC Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);
    expect($groupA->id)->toBeLessThan($groupB->id);

    $product = Product::create(['sku' => 'PLC-'.uniqid(), 'type' => 'simple', 'enabled' => true, 'family_id' => $family->id]);
    // Intentionally insert group B first so a naive "first row returned" pick
    // would get this wrong.
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'value' => 'from group B']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'value' => 'from group A']);

    $response = plcController()->show($product->sku);
    $payload = json_decode($response->getContent(), true);

    $attrPayload = collect($payload['attributes'])->firstWhere('code', 'plc_multi_attr');
    expect($attrPayload['value'])->toBe('from group A');
});

test('show() resolves a locale-based multi-group attribute to its primary group value per locale', function () {
    $thaiLocaleId = Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'TH', 'enabled' => true])->id;

    $attribute = Attribute::create(['code' => 'plc_locale_attr', 'type' => 'text', 'is_locale_based' => true]);
    $groupA = AttributeGroup::create(['code' => 'plc_locale_group_a']);
    $groupB = AttributeGroup::create(['code' => 'plc_locale_group_b']);
    $family = AttributeFamily::create(['code' => 'plc_locale_family', 'name' => 'PLC Locale Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);

    $product = Product::create(['sku' => 'PLC-LOCALE-'.uniqid(), 'type' => 'simple', 'enabled' => true, 'family_id' => $family->id]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'locale_id' => $thaiLocaleId, 'value' => 'group B th']);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'locale_id' => $thaiLocaleId, 'value' => 'group A th']);

    $response = plcController()->show($product->sku);
    $payload = json_decode($response->getContent(), true);

    $attrPayload = collect($payload['attributes'])->firstWhere('code', 'plc_locale_attr');
    expect($attrPayload['value']['th'])->toBe('group A th');
});
