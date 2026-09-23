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

test('saving different values into the same attribute\'s two group placements persists them independently and both survive a reload', function () {
    $attribute = Attribute::create(['code' => 'paf_independent_attr', 'type' => 'text']);
    $groupSpec = AttributeGroup::create(['code' => 'paf_spec_group']);
    $groupInnerSpec = AttributeGroup::create(['code' => 'paf_inner_spec_group']);
    $family = AttributeFamily::create(['code' => 'paf_independent_family', 'name' => 'Independent Family']);

    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupSpec->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $groupInnerSpec->id, 'sort_order' => 1]);

    $category = Category::create(['code' => 'paf_independent_category', 'name' => 'Independent Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'PAF-INDEPENDENT-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    // update() detaches ALL of the product's categories whenever no master-
    // category attribute value (pcatname/psubcatname/productgroupname) is
    // submitted at all (see relinkMasterCategoryCodes()'s "user cleared
    // everything" branch) — resubmit the same category's code so the
    // category (and therefore the effective family) survives the save,
    // same as a real product edit form always does.
    $pcatname = \App\Models\Attribute::firstOrCreate(['code' => 'pcatname'], ['type' => 'select']);

    $request = Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => $product->sku,
        'type' => 'simple',
        'enabled' => false,
        'values' => [
            $attribute->id => [
                (string) $groupSpec->id => ['global' => ['default' => 'สเปคภายนอก']],
                (string) $groupInnerSpec->id => ['global' => ['default' => 'สเปคภายใน']],
            ],
            $pcatname->id => [
                'ungrouped' => ['global' => ['default' => $category->code]],
            ],
        ],
    ]);

    pafController()->update($request, $product);

    // Both group placements round-trip through edit() with their own value —
    // this is the exact scenario the user reported (same value in both
    // "สเปค"/"ภายในสเปค" fields) now fixed.
    $props = pafInertiaProps(pafController()->edit(Request::create('/'), $product->fresh()));
    $groupsById = collect($props['assignedGroups'])->keyBy('id');

    $valueInGroup = fn ($groupId) => collect($groupsById[$groupId]['attributes'])
        ->firstWhere('id', $attribute->id);

    expect($groupsById[$groupSpec->id])->not->toBeNull();
    expect($groupsById[$groupInnerSpec->id])->not->toBeNull();

    $rows = \App\Models\ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->get();
    expect($rows)->toHaveCount(2);
    expect($rows->firstWhere('attribute_group_id', $groupSpec->id)->value)->toBe('สเปคภายนอก');
    expect($rows->firstWhere('attribute_group_id', $groupInnerSpec->id)->value)->toBe('สเปคภายใน');
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

test('re-saving a product whose value is still stored as "ungrouped" (stale, pre-backfill data) but is now bound to a real group does not error', function () {
    // Reproduces a real production incident: Product::applySmartDefaults()
    // used to always write attribute_group_id = NULL, so a brand-new
    // product's pid/pname rows landed as "ungrouped" even when those
    // attributes are actually bound to a real group. Re-saving the product
    // without ever touching that field resubmits the stale groupKey
    // ('ungrouped') the page loaded with — update() must not hard-reject
    // that as "invalid group placement" (it did, until this fix), or a
    // brand-new product could never be saved again through no fault of the
    // user's own.
    $attribute = Attribute::create(['code' => 'paf_stale_ungrouped_attr', 'type' => 'text']);
    $group = AttributeGroup::create(['code' => 'paf_stale_group']);
    $family = AttributeFamily::create(['code' => 'paf_stale_family', 'name' => 'Stale Family']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);

    $category = Category::create(['code' => 'paf_stale_category', 'name' => 'Stale Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $pcatname = \App\Models\Attribute::firstOrCreate(['code' => 'pcatname'], ['type' => 'select']);
    $product = Product::create(['sku' => 'PAF-STALE-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($category->id);

    // Simulates the pre-fix bug directly: a value that exists as
    // "ungrouped" even though the attribute is bound to a real group.
    \App\Models\ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => null, 'value' => 'stale value']);

    $request = Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => $product->sku,
        'type' => 'simple',
        'enabled' => false,
        'values' => [
            // Resubmits the exact same stale groupKey the page loaded with —
            // the user never touched this field.
            $attribute->id => ['ungrouped' => ['global' => ['default' => 'stale value']]],
            $pcatname->id => ['ungrouped' => ['global' => ['default' => $category->code]]],
        ],
    ]);

    pafController()->update($request, $product);

    expect(\App\Models\ProductValue::where('product_id', $product->id)->where('attribute_id', $attribute->id)->first()->value)
        ->toBe('stale value');
});
