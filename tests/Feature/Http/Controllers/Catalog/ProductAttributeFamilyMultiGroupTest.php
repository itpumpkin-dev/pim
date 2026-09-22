<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Product;
use Illuminate\Http\Request;

/**
 * ProductController::buildProductFormProps() used to collapse family_attributes
 * down to ->unique('attribute_id') — correct for the "same attribute claimed
 * by two different effective families" case (first family wins), but it also
 * silently dropped the SECOND placement of an attribute deliberately assigned
 * to two groups of the SAME (winning) family. These tests confirm the fix:
 * resolveEffectiveFamilyAttributes() preserves same-family multi-group rows
 * while still resolving cross-family duplicates by priority.
 */
function pafController(): ProductController
{
    return app(ProductController::class);
}

function pafInertiaProps(\Inertia\Response $response): array
{
    $request = Request::create('/');
    $request->headers->set('X-Inertia', 'true');

    return json_decode($response->toResponse($request)->getContent(), true)['props'];
}

test('a product sees the same attribute rendered in both of its groups within one family', function () {
    $attribute = Attribute::create(['code' => 'paf_shared_attr2', 'type' => 'text']);
    $groupA = AttributeGroup::create(['code' => 'paf_group_a2']);
    $groupB = AttributeGroup::create(['code' => 'paf_group_b2']);
    $family = AttributeFamily::create(['code' => 'paf_family2', 'name' => 'PAF Family 2']);

    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupB->id, 'sort_order' => 1]);

    $category = Category::create(['code' => 'paf_category2', 'name' => 'PAF Category 2']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'PAF-PRODUCT2-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    $props = pafInertiaProps(pafController()->edit(Request::create('/'), $product));

    $groupsWithAttr = collect($props['assignedGroups'])
        ->filter(fn ($g) => collect($g['attributes'])->contains(fn ($a) => $a['id'] === $attribute->id))
        ->pluck('id')
        ->sort()
        ->values()
        ->all();

    expect($groupsWithAttr)->toBe(collect([$groupA->id, $groupB->id])->sort()->values()->all());
});

test('cross-family priority is preserved: an attribute claimed by two different families still resolves to the higher-priority family only', function () {
    $attribute = Attribute::create(['code' => 'paf_cross_family_attr', 'type' => 'text']);
    $winningGroup = AttributeGroup::create(['code' => 'paf_winning_group']);
    $losingGroup = AttributeGroup::create(['code' => 'paf_losing_group']);
    $winningFamily = AttributeFamily::create(['code' => 'paf_winning_family', 'name' => 'Winning']);
    $losingFamily = AttributeFamily::create(['code' => 'paf_losing_family', 'name' => 'Losing']);

    FamilyAttribute::create(['family_id' => $winningFamily->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $winningGroup->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $losingFamily->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $losingGroup->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'paf_cross_category', 'name' => 'PAF Cross Category']);
    // sort_order 0 = higher priority — winningFamily comes first
    DB::table('category_attribute_family')->insert([
        ['category_id' => $category->id, 'family_id' => $winningFamily->id, 'sort_order' => 0],
        ['category_id' => $category->id, 'family_id' => $losingFamily->id, 'sort_order' => 1],
    ]);

    $product = Product::create(['sku' => 'PAF-CROSS-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    $props = pafInertiaProps(pafController()->edit(Request::create('/'), $product));

    $groupsWithAttr = collect($props['assignedGroups'])
        ->filter(fn ($g) => collect($g['attributes'])->contains(fn ($a) => $a['id'] === $attribute->id))
        ->pluck('id')
        ->all();

    expect($groupsWithAttr)->toBe([$winningGroup->id]);
});
