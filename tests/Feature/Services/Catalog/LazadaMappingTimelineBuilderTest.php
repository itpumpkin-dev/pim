<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeOption;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\LazadaCategory;
use App\Models\LazadaCategoryAttribute;
use App\Services\Catalog\LazadaMappingTimelineBuilder;

beforeEach(function () {
    $this->builder = new LazadaMappingTimelineBuilder();
});

test('includes a category log whose new_values sets lazada_category_id', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'lazada_category_mapped', null, ['lazada_category_id' => 100]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('includes a category log whose old_values had lazada_category_id (e.g. an unmap)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'updated', ['lazada_category_id' => 100], ['lazada_category_id' => null]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('includes a category log whose new_values sets attribute_family_id', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'lazada_family_attached_to_category', null, ['attribute_family_id' => 5]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('excludes a category log unrelated to lazada (e.g. only the name changed)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    logFor($category, 'updated', ['name' => 'Old'], ['name' => 'New']);

    expect($this->builder->build($category))->toBeEmpty();
});

test('when the category has no lazada_category_id, family/attribute/mapping logs are never fetched', function () {
    LazadaCategory::create(['id' => 999, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $family = AttributeFamily::create(['code' => 'fam1', 'lazada_category_id' => 999]);
    logFor($family, 'lazada_synced', null, ['lazada_category_id' => 999]);

    expect($this->builder->build($category))->toBeEmpty();
});

test('includes a family log matched by lazada_category_id in old or new values, even for an unrelated family row', function () {
    LazadaCategory::create(['id' => 100, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test', 'lazada_category_id' => 100]);
    $oldFamily = AttributeFamily::create(['code' => 'fam_old']);
    $newFamily = AttributeFamily::create(['code' => 'fam_new', 'lazada_category_id' => 100]);

    $deletedLog = logFor($oldFamily, 'lazada_synced', null, ['lazada_category_id' => 100]);
    $currentLog = logFor($newFamily, 'lazada_synced', null, ['lazada_category_id' => 100]);

    $ids = $this->builder->build($category)->pluck('id')->all();
    expect($ids)->toContain($deletedLog->id, $currentLog->id);
});

test('includes attribute/mapping/option-mapping logs only for attributes currently mapped to this lazada category', function () {
    LazadaCategory::create(['id' => 100, 'name' => 'Cat', 'is_leaf' => true]);
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test', 'lazada_category_id' => 100]);

    LazadaAttribute::create(['name' => 'Color', 'label' => 'Color', 'input_type' => 'singleSelect']);
    LazadaCategoryAttribute::create(['category_id' => 100, 'lazada_attribute_name' => 'Color']);

    $mappedAttribute = Attribute::create(['code' => 'pcolor', 'type' => 'select']);
    $mapping = LazadaAttributeMapping::create([
        'attribute_id' => $mappedAttribute->id,
        'target_field' => 'lazada_attribute',
        'lazada_attribute_name' => 'Color',
        'sort_order' => 0,
    ]);
    $option = AttributeOption::create(['attribute_id' => $mappedAttribute->id, 'code' => '10', 'admin_label' => 'Red']);
    $optionMapping = LazadaAttributeOptionMapping::create([
        'lazada_attribute_mapping_id' => $mapping->id,
        'attribute_option_id' => $option->id,
        'lazada_option_value' => '10',
        'lazada_option_label' => 'Red',
    ]);

    $attributeLog = logFor($mappedAttribute, 'created', null, ['code' => 'pcolor']);
    $mappingLog = logFor($mapping, 'created', null, ['lazada_attribute_name' => 'Color']);
    $optionMappingLog = logFor($optionMapping, 'created', null, ['lazada_option_value' => '10']);

    $unrelatedAttribute = Attribute::create(['code' => 'unrelated', 'type' => 'text']);
    $unrelatedLog = logFor($unrelatedAttribute, 'created', null, ['code' => 'unrelated']);

    $ids = $this->builder->build($category)->pluck('id')->all();
    expect($ids)->toContain($attributeLog->id, $mappingLog->id, $optionMappingLog->id);
    expect($ids)->not->toContain($unrelatedLog->id);
});

test('the merged timeline is deduplicated by log id and sorted newest first', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $older = logFor($category, 'lazada_category_mapped', null, ['lazada_category_id' => 100], createdAt: now()->subDay());
    $newer = logFor($category, 'updated', ['lazada_category_id' => 100], ['lazada_category_id' => null], createdAt: now());

    $result = $this->builder->build($category);

    expect($result->pluck('id')->all())->toBe([$newer->id, $older->id]);
});
