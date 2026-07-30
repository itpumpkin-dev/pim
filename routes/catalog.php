<?php

use App\Http\Controllers\Catalog\AttributeController;
use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Http\Controllers\Catalog\AttributeGroupController;
use App\Http\Controllers\Catalog\AttributeOptionController;
use App\Http\Controllers\Catalog\ChannelController;
use App\Http\Controllers\Catalog\ProductController;
use App\Http\Controllers\Catalog\CategoryController;
use App\Http\Controllers\Catalog\CategoryFieldController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->prefix('catalog')->name('catalog.')->group(function () {
    Route::get('products', [ProductController::class, 'index'])->name('products.index')->middleware('permission:products,list_products');
    Route::get('products/summary', [ProductController::class, 'summary'])->name('products.summary')->middleware('permission:products,list_products');
    Route::get('products/search', [ProductController::class, 'search'])->name('products.search')->middleware('permission:products,list_products');
    Route::get('products/quick-export', [ProductController::class, 'quickExport'])->name('products.quickExport')->middleware('permission:products,list_products');
    Route::get('products/create', [ProductController::class, 'create'])->name('products.create')->middleware('permission:products,create_products');
    Route::post('products', [ProductController::class, 'store'])->name('products.store')->middleware('permission:products,create_products');
    Route::get('products/{product}/edit', [ProductController::class, 'edit'])->name('products.edit')->middleware('permission:products,edit_products');
    Route::put('products/{product}', [ProductController::class, 'update'])->name('products.update')->middleware('permission:products,edit_products');
    Route::put('products/{product}/edit', [ProductController::class, 'update']);
    Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy')->middleware('permission:products,delete_products');
    Route::get('products/{product}/attribute-values', [ProductController::class, 'attributeValues'])->name('products.attributeValues')->middleware('permission:products,edit_products');
    Route::put('products/{product}/attribute-values', [ProductController::class, 'updateAttributeValue'])->name('products.updateAttributeValue')->middleware('permission:products,edit_products');
    Route::get('products/{product}/history', [ProductController::class, 'history'])->name('products.history')->middleware('permission:products,view_history');

    Route::get('attributes', [AttributeController::class, 'index'])->name('attributes.index')->middleware('permission:attributes,list_attributes');
    Route::get('attributes/create', [AttributeController::class, 'create'])->name('attributes.create')->middleware('permission:attributes,create_attributes');
    Route::post('attributes', [AttributeController::class, 'store'])->name('attributes.store')->middleware('permission:attributes,create_attributes');
    Route::get('attributes/{attribute}/edit', [AttributeController::class, 'edit'])->name('attributes.edit')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}', [AttributeController::class, 'update'])->name('attributes.update')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}/edit', [AttributeController::class, 'update']);
    Route::delete('attributes/{attribute}', [AttributeController::class, 'destroy'])->name('attributes.destroy')->middleware('permission:attributes,delete_attributes');
    Route::get('attributes/{attribute}/history', [AttributeController::class, 'history'])->name('attributes.history')->middleware('permission:attributes,view_history');
    Route::post('attributes/{attribute}/options', [AttributeOptionController::class, 'store'])->name('attributes.options.store')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'update'])->name('attributes.options.update')->middleware('permission:attributes,edit_attributes');
    Route::delete('attributes/{attribute}/options/{option}', [AttributeOptionController::class, 'destroy'])->name('attributes.options.destroy')->middleware('permission:attributes,edit_attributes');

    Route::get('attributeGroups', [AttributeGroupController::class, 'index'])->name('attributeGroups.index')->middleware('permission:attribute_groups,list_attribute_groups');
    Route::get('attributeGroups/create', [AttributeGroupController::class, 'create'])->name('attributeGroups.create')->middleware('permission:attribute_groups,create_attribute_groups');
    Route::post('attributeGroups', [AttributeGroupController::class, 'store'])->name('attributeGroups.store')->middleware('permission:attribute_groups,create_attribute_groups');
    Route::get('attributeGroups/{attributeGroup}/edit', [AttributeGroupController::class, 'edit'])->name('attributeGroups.edit')->middleware('permission:attribute_groups,edit_attribute_groups');
    Route::put('attributeGroups/{attributeGroup}', [AttributeGroupController::class, 'update'])->name('attributeGroups.update')->middleware('permission:attribute_groups,edit_attribute_groups');
    Route::put('attributeGroups/{attributeGroup}/edit', [AttributeGroupController::class, 'update']);
    Route::delete('attributeGroups/{attributeGroup}', [AttributeGroupController::class, 'destroy'])->name('attributeGroups.destroy')->middleware('permission:attribute_groups,delete_attribute_groups');
    Route::get('attributeGroups/{attributeGroup}/history', [AttributeGroupController::class, 'history'])->name('attributeGroups.history')->middleware('permission:attribute_groups,view_history');

    Route::get('attributeFamilies', [AttributeFamilyController::class, 'index'])->name('attributeFamilies.index')->middleware('permission:attribute_families,list_attribute_families');
    Route::get('attributeFamilies/create', [AttributeFamilyController::class, 'create'])->name('attributeFamilies.create')->middleware('permission:attribute_families,create_attribute_families');
    Route::post('attributeFamilies', [AttributeFamilyController::class, 'store'])->name('attributeFamilies.store')->middleware('permission:attribute_families,create_attribute_families');
    Route::get('attributeFamilies/{attributeFamily}/edit', [AttributeFamilyController::class, 'edit'])->name('attributeFamilies.edit')->middleware('permission:attribute_families,edit_attribute_families');
    Route::put('attributeFamilies/{attributeFamily}', [AttributeFamilyController::class, 'update'])->name('attributeFamilies.update')->middleware('permission:attribute_families,edit_attribute_families');
    Route::put('attributeFamilies/{attributeFamily}/edit', [AttributeFamilyController::class, 'update']);
    Route::delete('attributeFamilies/{attributeFamily}', [AttributeFamilyController::class, 'destroy'])->name('attributeFamilies.destroy')->middleware('permission:attribute_families,delete_attribute_families');
    Route::get('attributeFamilies/{attributeFamily}/history', [AttributeFamilyController::class, 'history'])->name('attributeFamilies.history')->middleware('permission:attribute_families,view_history');

    Route::get('categories/tree', [CategoryController::class, 'tree'])->name('categories.tree')->middleware('permission:categories,list_categories');
    Route::get('categories', [CategoryController::class, 'index'])->name('categories.index')->middleware('permission:categories,list_categories');
    Route::get('categories/create', [CategoryController::class, 'create'])->name('categories.create')->middleware('permission:categories,create_categories');
    Route::post('categories', [CategoryController::class, 'store'])->name('categories.store')->middleware('permission:categories,create_categories');
    Route::get('categories/{category}/edit', [CategoryController::class, 'edit'])->name('categories.edit')->middleware('permission:categories,edit_categories');
    Route::put('categories/{category}', [CategoryController::class, 'update'])->name('categories.update')->middleware('permission:categories,edit_categories');
    Route::put('categories/{category}/edit', [CategoryController::class, 'update']);
    Route::delete('categories/{category}', [CategoryController::class, 'destroy'])->name('categories.destroy')->middleware('permission:categories,delete_categories');
    Route::get('categories/{category}/history', [CategoryController::class, 'history'])->name('categories.history')->middleware('permission:categories,view_history');

    Route::get('categoryFields', [CategoryFieldController::class, 'index'])->name('categoryFields.index')->middleware('permission:category_fields,list_category_fields');
    Route::get('categoryFields/create', [CategoryFieldController::class, 'create'])->name('categoryFields.create')->middleware('permission:category_fields,create_category_fields');
    Route::post('categoryFields', [CategoryFieldController::class, 'store'])->name('categoryFields.store')->middleware('permission:category_fields,create_category_fields');
    Route::get('categoryFields/{categoryField}/edit', [CategoryFieldController::class, 'edit'])->name('categoryFields.edit')->middleware('permission:category_fields,edit_category_fields');
    Route::put('categoryFields/{categoryField}', [CategoryFieldController::class, 'update'])->name('categoryFields.update')->middleware('permission:category_fields,edit_category_fields');
    Route::put('categoryFields/{categoryField}/edit', [CategoryFieldController::class, 'update']);
    Route::delete('categoryFields/{categoryField}', [CategoryFieldController::class, 'destroy'])->name('categoryFields.destroy')->middleware('permission:category_fields,delete_category_fields');
    Route::get('categoryFields/{categoryField}/history', [CategoryFieldController::class, 'history'])->name('categoryFields.history')->middleware('permission:category_fields,view_history');

    Route::get('channels', [ChannelController::class, 'index'])->name('channels.index')->middleware('permission:channels,list_channels');
    Route::get('channels/create', [ChannelController::class, 'create'])->name('channels.create')->middleware('permission:channels,create_channels');
    Route::post('channels', [ChannelController::class, 'store'])->name('channels.store')->middleware('permission:channels,create_channels');
    Route::get('channels/{channel}/edit', [ChannelController::class, 'edit'])->name('channels.edit')->middleware('permission:channels,edit_channels');
    Route::put('channels/{channel}', [ChannelController::class, 'update'])->name('channels.update')->middleware('permission:channels,edit_channels');
    Route::put('channels/{channel}/edit', [ChannelController::class, 'update']);
    Route::delete('channels/{channel}', [ChannelController::class, 'destroy'])->name('channels.destroy')->middleware('permission:channels,delete_channels');
});
