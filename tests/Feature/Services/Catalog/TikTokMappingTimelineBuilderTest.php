<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use App\Models\TikTokCategory;
use App\Models\TikTokCategoryAttribute;
use App\Services\Catalog\TikTokMappingTimelineBuilder;

beforeEach(function () {
    $this->builder = new TikTokMappingTimelineBuilder();
});

test('includes a category log whose new_values sets tiktok_category_id', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'tiktok_category_mapped', null, ['tiktok_category_id' => 100]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('includes a category log whose old_values had tiktok_category_id (e.g. an unmap)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'updated', ['tiktok_category_id' => 100], ['tiktok_category_id' => null]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('includes a category log whose new_values sets attribute_family_id', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'tiktok_family_attached_to_category', null, ['attribute_family_id' => 5]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('excludes a category log unrelated to tiktok (e.g. only the name changed)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    logFor($category, 'updated', ['name' => 'Old'], ['name' => 'New']);

    expect($this->builder->build($category))->toBeEmpty();
});

test('when the category has no tiktok_category_id, family/attribute/mapping logs are never fetched', function () {
    TikTokCategory::create(['id' => 999, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $family = AttributeFamily::create(['code' => 'fam1', 'tiktok_category_id' => 999]);
    logFor($family, 'tiktok_synced', null, ['tiktok_category_id' => 999]);

    expect($this->builder->build($category))->toBeEmpty();
});

test('includes a family log matched by tiktok_category_id in old or new values, even for an unrelated family row', function () {
    TikTokCategory::create(['id' => 100, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test', 'tiktok_category_id' => 100]);
    $oldFamily = AttributeFamily::create(['code' => 'fam_old']);
    $newFamily = AttributeFamily::create(['code' => 'fam_new', 'tiktok_category_id' => 100]);

    $deletedLog = logFor($oldFamily, 'tiktok_synced', null, ['tiktok_category_id' => 100]);
    $currentLog = logFor($newFamily, 'tiktok_synced', null, ['tiktok_category_id' => 100]);

    $ids = $this->builder->build($category)->pluck('id')->all();
    expect($ids)->toContain($deletedLog->id, $currentLog->id);
});

test('includes attribute/mapping/option-mapping logs only for attributes currently mapped to this tiktok category', function () {
    TikTokCategory::create(['id' => 100, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test', 'tiktok_category_id' => 100]);

    TikTokAttribute::create(['id' => 'attr_color', 'name' => 'Color', 'is_customizable' => false, 'is_multiple_selection' => false]);
    TikTokCategoryAttribute::create(['category_id' => 100, 'tiktok_attribute_id' => 'attr_color']);

    $mappedAttribute = Attribute::create(['code' => 'pcolor', 'type' => 'select']);
    $mapping = TikTokAttributeMapping::create([
        'attribute_id' => $mappedAttribute->id,
        'target_field' => 'tiktok_attribute',
        'tiktok_attribute_id' => 'attr_color',
        'sort_order' => 0,
    ]);
    $option = AttributeOption::create(['attribute_id' => $mappedAttribute->id, 'code' => 'red', 'admin_label' => 'Red']);
    $optionMapping = TikTokAttributeOptionMapping::create([
        'tiktok_attribute_mapping_id' => $mapping->id,
        'attribute_option_id' => $option->id,
        'tiktok_option_value' => 'red',
        'tiktok_option_label' => 'Red',
    ]);

    $attributeLog = logFor($mappedAttribute, 'created', null, ['code' => 'pcolor']);
    $mappingLog = logFor($mapping, 'created', null, ['tiktok_attribute_id' => 'attr_color']);
    $optionMappingLog = logFor($optionMapping, 'created', null, ['tiktok_option_value' => 'red']);

    $unrelatedAttribute = Attribute::create(['code' => 'unrelated', 'type' => 'text']);
    $unrelatedLog = logFor($unrelatedAttribute, 'created', null, ['code' => 'unrelated']);

    $ids = $this->builder->build($category)->pluck('id')->all();
    expect($ids)->toContain($attributeLog->id, $mappingLog->id, $optionMappingLog->id);
    expect($ids)->not->toContain($unrelatedLog->id);
});

test('the merged timeline is deduplicated by log id and sorted newest first', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $older = logFor($category, 'tiktok_category_mapped', null, ['tiktok_category_id' => 100], createdAt: now()->subDay());
    $newer = logFor($category, 'updated', ['tiktok_category_id' => 100], ['tiktok_category_id' => null], createdAt: now());

    $result = $this->builder->build($category);

    expect($result->pluck('id')->all())->toBe([$newer->id, $older->id]);
});
