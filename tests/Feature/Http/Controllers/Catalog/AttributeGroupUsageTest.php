<?php

use App\Http\Controllers\Catalog\AttributeGroupController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * family_attributes.attribute_group_id cascadeOnDelete()s and (since
 * migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table)
 * product_values.attribute_group_id nullOnDelete()s — deleting a group now
 * orphans live product data, not just pivot rows. usage() lets the
 * attribute-groups index page show that impact before the admin confirms.
 */
function agupController(): AttributeGroupController
{
    return app(AttributeGroupController::class);
}

test('usage() reports zeros for a group bound to nothing', function () {
    $group = AttributeGroup::create(['code' => 'agup_unused']);

    $response = agupController()->usage($group);
    $payload = json_decode($response->getContent(), true);

    expect($payload)->toBe(['family_count' => 0, 'attribute_count' => 0, 'product_value_count' => 0]);
});

test('usage() counts distinct families, attributes, and products using the group', function () {
    $group = AttributeGroup::create(['code' => 'agup_used']);
    $familyA = AttributeFamily::create(['code' => 'agup_family_a', 'name' => 'Family A']);
    $familyB = AttributeFamily::create(['code' => 'agup_family_b', 'name' => 'Family B']);
    $attr1 = Attribute::create(['code' => 'agup_attr1', 'type' => 'text']);
    $attr2 = Attribute::create(['code' => 'agup_attr2', 'type' => 'text']);

    FamilyAttribute::create(['family_id' => $familyA->id, 'attribute_id' => $attr1->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $familyB->id, 'attribute_id' => $attr2->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'agup_category', 'name' => 'Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $familyA->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'AGUP-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr1->id, 'attribute_group_id' => $group->id, 'value' => 'x']);
    // A second row for the SAME product must not double-count product_value_count.
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr2->id, 'attribute_group_id' => $group->id, 'value' => 'y']);

    $response = agupController()->usage($group);
    $payload = json_decode($response->getContent(), true);

    expect($payload['family_count'])->toBe(2);
    expect($payload['attribute_count'])->toBe(2);
    expect($payload['product_value_count'])->toBe(1);
});

test('usage() ignores a family_attributes row bound to a different group', function () {
    $group = AttributeGroup::create(['code' => 'agup_target']);
    $otherGroup = AttributeGroup::create(['code' => 'agup_other']);
    $family = AttributeFamily::create(['code' => 'agup_other_family', 'name' => 'Other Family']);
    $attr = Attribute::create(['code' => 'agup_other_attr', 'type' => 'text']);

    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attr->id, 'attribute_group_id' => $otherGroup->id, 'sort_order' => 0]);

    $response = agupController()->usage($group);
    $payload = json_decode($response->getContent(), true);

    expect($payload)->toBe(['family_count' => 0, 'attribute_count' => 0, 'product_value_count' => 0]);
});
