<?php

use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Models\AttributeFamily;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\Request;

/**
 * category_attribute_family.family_id cascadeOnDelete()s silently (see
 * migration create_category_attribute_family_table) — deleting a family
 * unlinks every product group bound to it with no warning. usage() lets the
 * attribute-families index page show how many product groups/products would
 * be affected before the admin confirms the delete.
 */
function afuController(): AttributeFamilyController
{
    return app(AttributeFamilyController::class);
}

test('usage() reports zero groups and products for a family bound to nothing', function () {
    $family = AttributeFamily::create(['code' => 'afu_unused', 'name' => 'Unused']);

    $response = afuController()->usage($family);
    $payload = json_decode($response->getContent(), true);

    expect($payload)->toBe(['product_group_count' => 0, 'product_count' => 0]);
});

test('usage() counts distinct product groups and products bound to the family', function () {
    $family = AttributeFamily::create(['code' => 'afu_used', 'name' => 'Used']);

    $groupA = Category::create(['code' => 'afu_group_a', 'name' => 'Group A']);
    $groupB = Category::create(['code' => 'afu_group_b', 'name' => 'Group B']);

    DB::table('category_attribute_family')->insert([
        ['category_id' => $groupA->id, 'family_id' => $family->id, 'sort_order' => 0],
        ['category_id' => $groupB->id, 'family_id' => $family->id, 'sort_order' => 0],
    ]);

    $productInA = Product::create(['sku' => 'AFU-A-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $productInA->categories()->attach($groupA->id);

    $productInBoth = Product::create(['sku' => 'AFU-AB-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $productInBoth->categories()->attach([$groupA->id, $groupB->id]);

    $response = afuController()->usage($family);
    $payload = json_decode($response->getContent(), true);

    expect($payload['product_group_count'])->toBe(2);
    // productInBoth belongs to both bound groups but must only be counted once
    expect($payload['product_count'])->toBe(2);
});

test('usage() ignores a product group bound to a different family', function () {
    $family = AttributeFamily::create(['code' => 'afu_target', 'name' => 'Target']);
    $otherFamily = AttributeFamily::create(['code' => 'afu_other', 'name' => 'Other']);

    $group = Category::create(['code' => 'afu_other_group', 'name' => 'Other Group']);
    DB::table('category_attribute_family')->insert(['category_id' => $group->id, 'family_id' => $otherFamily->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'AFU-OTHER-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($group->id);

    $response = afuController()->usage($family);
    $payload = json_decode($response->getContent(), true);

    expect($payload)->toBe(['product_group_count' => 0, 'product_count' => 0]);
});
