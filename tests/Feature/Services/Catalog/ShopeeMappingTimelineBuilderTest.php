<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use App\Models\ShopeeCategory;
use App\Models\ShopeeCategoryAttribute;
use App\Services\Catalog\ShopeeMappingTimelineBuilder;

beforeEach(function () {
    $this->builder = new ShopeeMappingTimelineBuilder();
});

test('includes a category log whose new_values sets shopee_category_id', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'shopee_category_mapped', null, ['shopee_category_id' => 100]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('includes a category log whose old_values had shopee_category_id (e.g. an unmap)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'updated', ['shopee_category_id' => 100], ['shopee_category_id' => null]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('includes a category log whose new_values sets attribute_family_id', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'shopee_family_attached_to_category', null, ['attribute_family_id' => 5]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('excludes a category log unrelated to shopee (e.g. only the name changed)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    logFor($category, 'updated', ['name' => 'Old'], ['name' => 'New']);

    expect($this->builder->build($category))->toBeEmpty();
});

test('when the category has no shopee_category_id, family/attribute/mapping logs are never fetched', function () {
    ShopeeCategory::create(['id' => 999, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $family = AttributeFamily::create(['code' => 'fam1', 'shopee_category_id' => 999]);
    // Coincidentally matches shopee_category_id 999, but this category isn't
    // mapped to any Shopee category at all — must not show up.
    logFor($family, 'shopee_synced', null, ['shopee_category_id' => 999]);

    expect($this->builder->build($category))->toBeEmpty();
});

test('includes a family log matched by shopee_category_id in old or new values, even for an unrelated family row', function () {
    ShopeeCategory::create(['id' => 100, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test', 'shopee_category_id' => 100]);
    $oldFamily = AttributeFamily::create(['code' => 'fam_old']); // simulates a deleted-and-replaced family
    $newFamily = AttributeFamily::create(['code' => 'fam_new', 'shopee_category_id' => 100]);

    $deletedLog = logFor($oldFamily, 'shopee_synced', null, ['shopee_category_id' => 100]);
    $currentLog = logFor($newFamily, 'shopee_synced', null, ['shopee_category_id' => 100]);

    $ids = $this->builder->build($category)->pluck('id')->all();
    expect($ids)->toContain($deletedLog->id, $currentLog->id);
});

test('includes attribute/mapping/option-mapping logs only for attributes currently mapped to this shopee category', function () {
    ShopeeCategory::create(['id' => 100, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test', 'shopee_category_id' => 100]);

    ShopeeAttribute::create(['id' => 1, 'name' => 'Color', 'input_type' => 1]);
    ShopeeCategoryAttribute::create(['category_id' => 100, 'shopee_attribute_id' => 1]);

    $mappedAttribute = Attribute::create(['code' => 'pcolor', 'type' => 'select']);
    $mapping = ShopeeAttributeMapping::create([
        'attribute_id' => $mappedAttribute->id,
        'target_field' => 'shopee_attribute',
        'shopee_attribute_id' => 1,
        'sort_order' => 0,
    ]);
    $option = \App\Models\AttributeOption::create(['attribute_id' => $mappedAttribute->id, 'code' => '10', 'admin_label' => 'Red']);
    $optionMapping = ShopeeAttributeOptionMapping::create([
        'shopee_attribute_mapping_id' => $mapping->id,
        'attribute_option_id' => $option->id,
        'shopee_option_value' => '10',
        'shopee_option_label' => 'Red',
    ]);

    $attributeLog = logFor($mappedAttribute, 'created', null, ['code' => 'pcolor']);
    $mappingLog = logFor($mapping, 'created', null, ['shopee_attribute_id' => 1]);
    $optionMappingLog = logFor($optionMapping, 'created', null, ['shopee_option_value' => '10']);

    // An unrelated attribute (not mapped to this category at all) must not
    // show up just because it happens to have audit logs of its own.
    $unrelatedAttribute = Attribute::create(['code' => 'unrelated', 'type' => 'text']);
    $unrelatedLog = logFor($unrelatedAttribute, 'created', null, ['code' => 'unrelated']);

    $ids = $this->builder->build($category)->pluck('id')->all();
    expect($ids)->toContain($attributeLog->id, $mappingLog->id, $optionMappingLog->id);
    expect($ids)->not->toContain($unrelatedLog->id);
});

test('the merged timeline is deduplicated by log id and sorted newest first', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $older = logFor($category, 'shopee_category_mapped', null, ['shopee_category_id' => 100], createdAt: now()->subDay());
    $newer = logFor($category, 'updated', ['shopee_category_id' => 100], ['shopee_category_id' => null], createdAt: now()->addSecond());

    $result = $this->builder->build($category);

    expect($result->pluck('id')->all())->toBe([$newer->id, $older->id]);
});
