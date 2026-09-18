<?php

use App\Models\Category;
use App\Services\Catalog\WooCommerceMappingTimelineBuilder;

beforeEach(function () {
    $this->builder = new WooCommerceMappingTimelineBuilder();
});

test('includes a category log whose new_values sets woocommerce_category_id', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'woocommerce_category_mapped', null, ['woocommerce_category_id' => 100]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('includes a category log whose old_values had woocommerce_category_id (e.g. an unmap)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $log = logFor($category, 'updated', ['woocommerce_category_id' => 100], ['woocommerce_category_id' => null]);

    expect($this->builder->build($category)->pluck('id')->all())->toBe([$log->id]);
});

test('excludes a category log unrelated to woocommerce (e.g. only the name changed)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    logFor($category, 'updated', ['name' => 'Old'], ['name' => 'New']);

    expect($this->builder->build($category))->toBeEmpty();
});

test('excludes a category log that only touched attribute_family_id (unlike the marketplace-platform timeline builders, this one has no family/attribute scope at all)', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    logFor($category, 'shopee_family_attached_to_category', null, ['attribute_family_id' => 5]);

    expect($this->builder->build($category))->toBeEmpty();
});

test('logs for a different category are never included', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $otherCategory = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Other']);
    logFor($otherCategory, 'woocommerce_category_mapped', null, ['woocommerce_category_id' => 100]);

    expect($this->builder->build($category))->toBeEmpty();
});

test('the result is sorted newest first', function () {
    $category = Category::create(['code' => 'cat_'.uniqid(), 'name' => 'Test']);
    $older = logFor($category, 'woocommerce_category_mapped', null, ['woocommerce_category_id' => 100], createdAt: now()->subDay());
    $newer = logFor($category, 'updated', ['woocommerce_category_id' => 100], ['woocommerce_category_id' => null], createdAt: now());

    $result = $this->builder->build($category);

    expect($result->pluck('id')->all())->toBe([$newer->id, $older->id]);
});
