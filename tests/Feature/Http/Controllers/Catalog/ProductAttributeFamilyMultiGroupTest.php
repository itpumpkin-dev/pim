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
 * down to ->unique('attribute_id'), which had two problems: it silently
 * dropped the SECOND placement of an attribute deliberately assigned to two
 * groups of the SAME family, AND it let one family "win" a shared attribute
 * and hide the OTHER family's group entirely (a product can have more than
 * one "default" attribute family bound to it — display order shouldn't
 * decide which one's content actually shows). resolveEffectiveFamilyAttributes()
 * now only dedupes the exact (attribute_id, attribute_group_id) pair, so
 * every distinct group placement across every effective family renders.
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

test('a product can have more than one default attribute family: an attribute shared across two families shows every group it is placed in, regardless of which family is higher priority', function () {
    $attribute = Attribute::create(['code' => 'paf_cross_family_attr', 'type' => 'text']);
    $groupInFamilyA = AttributeGroup::create(['code' => 'paf_group_in_family_a']);
    $groupInFamilyB = AttributeGroup::create(['code' => 'paf_group_in_family_b']);
    $familyA = AttributeFamily::create(['code' => 'paf_family_a', 'name' => 'Family A']);
    $familyB = AttributeFamily::create(['code' => 'paf_family_b', 'name' => 'Family B']);

    FamilyAttribute::create(['family_id' => $familyA->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupInFamilyA->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $familyB->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupInFamilyB->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'paf_cross_category', 'name' => 'PAF Cross Category']);
    // sort_order only controls DISPLAY order now, not which family's content is kept
    DB::table('category_attribute_family')->insert([
        ['category_id' => $category->id, 'family_id' => $familyA->id, 'sort_order' => 0],
        ['category_id' => $category->id, 'family_id' => $familyB->id, 'sort_order' => 1],
    ]);

    $product = Product::create(['sku' => 'PAF-CROSS-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    $props = pafInertiaProps(pafController()->edit(Request::create('/'), $product));

    $groupsWithAttr = collect($props['assignedGroups'])
        ->filter(fn ($g) => collect($g['attributes'])->contains(fn ($a) => $a['id'] === $attribute->id))
        ->pluck('id')
        ->sort()
        ->values()
        ->all();

    expect($groupsWithAttr)->toBe(collect([$groupInFamilyA->id, $groupInFamilyB->id])->sort()->values()->all());
});

test('an attribute placed in the exact same group by two different families is not rendered twice', function () {
    $attribute = Attribute::create(['code' => 'paf_dup_pair_attr', 'type' => 'text']);
    $sharedGroup = AttributeGroup::create(['code' => 'paf_dup_pair_group']);
    $familyA = AttributeFamily::create(['code' => 'paf_dup_family_a', 'name' => 'Dup Family A']);
    $familyB = AttributeFamily::create(['code' => 'paf_dup_family_b', 'name' => 'Dup Family B']);

    FamilyAttribute::create(['family_id' => $familyA->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $sharedGroup->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $familyB->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $sharedGroup->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'paf_dup_pair_category', 'name' => 'PAF Dup Pair Category']);
    DB::table('category_attribute_family')->insert([
        ['category_id' => $category->id, 'family_id' => $familyA->id, 'sort_order' => 0],
        ['category_id' => $category->id, 'family_id' => $familyB->id, 'sort_order' => 1],
    ]);

    $product = Product::create(['sku' => 'PAF-DUPPAIR-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    $props = pafInertiaProps(pafController()->edit(Request::create('/'), $product));

    $group = collect($props['assignedGroups'])->firstWhere('id', $sharedGroup->id);
    $occurrences = collect($group['attributes'])->filter(fn ($a) => $a['id'] === $attribute->id)->count();

    expect($occurrences)->toBe(1);
});
