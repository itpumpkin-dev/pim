<?php

use App\Http\Controllers\ImportExport\ImportConfigController;
use App\Models\AttributeFamily;
use App\Models\Category;

/**
 * Product-import wizard's "family" step now drills down Category >
 * Subcategory > Product Group instead of picking an Attribute Family
 * directly — categoryAttributeFamilies() resolves the family/families bound
 * to the chosen Product Group (a leaf category) via
 * category_attribute_family, same relation Category::attributeFamilies()
 * already exposes (ordered by sort_order, confirmed against real data:
 * category 210 binds both family_1 then general_chemical_product-copy_1).
 */
function icfrController(): ImportConfigController
{
    return app(ImportConfigController::class);
}

test('categoryTree() returns the real category tree, including a leaf product group', function () {
    $root = Category::create(['code' => 'icfr_root', 'name' => 'ICFR Root']);
    $sub = Category::create(['code' => 'icfr_sub', 'name' => 'ICFR Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'icfr_group', 'name' => 'ICFR Group', 'parent_id' => $sub->id]);

    // Category::treeArray() is cache-backed (see Category::treeCacheVersion())
    // — bump it so this test's own categories aren't hidden behind a tree
    // some earlier test already cached before these existed.
    Category::bumpTreeCacheVersion();

    $response = icfrController()->categoryTree();
    $tree = json_decode($response->getContent(), true);

    $rootNode = collect($tree)->firstWhere('id', $root->id);
    expect($rootNode)->not->toBeNull();

    $subNode = collect($rootNode['children'])->firstWhere('id', $sub->id);
    expect($subNode)->not->toBeNull();

    $groupNode = collect($subNode['children'])->firstWhere('id', $group->id);
    expect($groupNode)->not->toBeNull();
    expect($groupNode['name'])->toBe('ICFR Group');
});

test('categoryAttributeFamilies() resolves the families bound to a product group, ordered by sort_order', function () {
    $group = Category::create(['code' => 'icfr_bound_group', 'name' => 'ICFR Bound Group']);
    $familyA = AttributeFamily::create(['code' => 'icfr_family_a', 'name' => 'Family A']);
    $familyB = AttributeFamily::create(['code' => 'icfr_family_b', 'name' => 'Family B']);

    DB::table('category_attribute_family')->insert([
        ['category_id' => $group->id, 'family_id' => $familyB->id, 'sort_order' => 1],
        ['category_id' => $group->id, 'family_id' => $familyA->id, 'sort_order' => 0],
    ]);

    $response = icfrController()->categoryAttributeFamilies($group);
    $families = json_decode($response->getContent(), true);

    expect($families)->toBe([
        ['code' => 'icfr_family_a', 'name' => 'Family A'],
        ['code' => 'icfr_family_b', 'name' => 'Family B'],
    ]);
});

test('categoryAttributeFamilies() returns an empty list for a product group with no bound family', function () {
    $group = Category::create(['code' => 'icfr_unbound_group', 'name' => 'ICFR Unbound Group']);

    $response = icfrController()->categoryAttributeFamilies($group);

    expect(json_decode($response->getContent(), true))->toBe([]);
});
