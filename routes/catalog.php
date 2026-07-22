<?php

use App\Http\Controllers\Catalog\AttributeController;
use App\Http\Controllers\Catalog\AttributeFamilyController;
use App\Http\Controllers\Catalog\AttributeGroupController;
use App\Http\Controllers\Catalog\ProductController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->prefix('catalog')->name('catalog.')->group(function () {
    Route::get('products', [ProductController::class, 'index'])->name('products.index')->middleware('permission:products,list_products');
    Route::get('products/summary', [ProductController::class, 'summary'])->name('products.summary')->middleware('permission:products,list_products');
    Route::get('products/create', [ProductController::class, 'create'])->name('products.create')->middleware('permission:products,create_products');
    Route::post('products', [ProductController::class, 'store'])->name('products.store')->middleware('permission:products,create_products');
    Route::get('products/{product}/edit', [ProductController::class, 'edit'])->name('products.edit')->middleware('permission:products,edit_products');
    Route::put('products/{product}', [ProductController::class, 'update'])->name('products.update')->middleware('permission:products,edit_products');
    Route::put('products/{product}/edit', [ProductController::class, 'update']);
    Route::delete('products/{product}', [ProductController::class, 'destroy'])->name('products.destroy')->middleware('permission:products,delete_products');

    Route::get('attributes', [AttributeController::class, 'index'])->name('attributes.index')->middleware('permission:attributes,list_attributes');
    Route::get('attributes/create', [AttributeController::class, 'create'])->name('attributes.create')->middleware('permission:attributes,create_attributes');
    Route::post('attributes', [AttributeController::class, 'store'])->name('attributes.store')->middleware('permission:attributes,create_attributes');
    Route::get('attributes/{attribute}/edit', [AttributeController::class, 'edit'])->name('attributes.edit')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}', [AttributeController::class, 'update'])->name('attributes.update')->middleware('permission:attributes,edit_attributes');
    Route::put('attributes/{attribute}/edit', [AttributeController::class, 'update']);
    Route::delete('attributes/{attribute}', [AttributeController::class, 'destroy'])->name('attributes.destroy')->middleware('permission:attributes,delete_attributes');

    Route::get('attributeGroups', [AttributeGroupController::class, 'index'])->name('attributeGroups.index')->middleware('permission:attribute_groups,list_attribute_groups');
    Route::get('attributeGroups/create', [AttributeGroupController::class, 'create'])->name('attributeGroups.create')->middleware('permission:attribute_groups,create_attribute_groups');
    Route::post('attributeGroups', [AttributeGroupController::class, 'store'])->name('attributeGroups.store')->middleware('permission:attribute_groups,create_attribute_groups');
    Route::get('attributeGroups/{attributeGroup}/edit', [AttributeGroupController::class, 'edit'])->name('attributeGroups.edit')->middleware('permission:attribute_groups,edit_attribute_groups');
    Route::put('attributeGroups/{attributeGroup}', [AttributeGroupController::class, 'update'])->name('attributeGroups.update')->middleware('permission:attribute_groups,edit_attribute_groups');
    Route::put('attributeGroups/{attributeGroup}/edit', [AttributeGroupController::class, 'update']);
    Route::delete('attributeGroups/{attributeGroup}', [AttributeGroupController::class, 'destroy'])->name('attributeGroups.destroy')->middleware('permission:attribute_groups,delete_attribute_groups');

    Route::get('attributeFamilies', [AttributeFamilyController::class, 'index'])->name('attributeFamilies.index')->middleware('permission:attribute_families,list_attribute_families');
    Route::get('attributeFamilies/create', [AttributeFamilyController::class, 'create'])->name('attributeFamilies.create')->middleware('permission:attribute_families,create_attribute_families');
    Route::post('attributeFamilies', [AttributeFamilyController::class, 'store'])->name('attributeFamilies.store')->middleware('permission:attribute_families,create_attribute_families');
    Route::get('attributeFamilies/{attributeFamily}/edit', [AttributeFamilyController::class, 'edit'])->name('attributeFamilies.edit')->middleware('permission:attribute_families,edit_attribute_families');
    Route::put('attributeFamilies/{attributeFamily}', [AttributeFamilyController::class, 'update'])->name('attributeFamilies.update')->middleware('permission:attribute_families,edit_attribute_families');
    Route::put('attributeFamilies/{attributeFamily}/edit', [AttributeFamilyController::class, 'update']);
    Route::delete('attributeFamilies/{attributeFamily}', [AttributeFamilyController::class, 'destroy'])->name('attributeFamilies.destroy')->middleware('permission:attribute_families,delete_attribute_families');
});
