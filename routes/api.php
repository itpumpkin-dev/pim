<?php

use App\Http\Controllers\Api\AttributeLookupController;
use App\Http\Controllers\Api\BaseUnitLookupController;
use App\Http\Controllers\Api\BrandLookupController;
use App\Http\Controllers\Api\CategoryLookupController;
use App\Http\Controllers\Api\ProductLookupController;
use App\Http\Controllers\Api\ShopeeItemController;
use Illuminate\Support\Facades\Route;

Route::get('products', [ProductLookupController::class, 'index'])
    ->middleware('api_key')
    ->name('api.products.index');

Route::get('products/{sku}', [ProductLookupController::class, 'show'])->name('api.products.show');

// Shopee-shaped read endpoint — see ShopeeItemController's docblock.
// Bulk lookup by item_id_list, same exposure rule as products.index above.
Route::get('shopee/get_item_base_info', [ShopeeItemController::class, 'getItemBaseInfo'])
    ->middleware('api_key')
    ->name('api.shopee.get_item_base_info');

// Read-only master-data lookups — same index()-behind-api_key / public-show()
// exposure rule as products above (see each controller's docblock).
Route::get('categories', [CategoryLookupController::class, 'index'])
    ->middleware('api_key')
    ->name('api.categories.index');
Route::get('categories/{code}', [CategoryLookupController::class, 'show'])->name('api.categories.show');

Route::get('brands', [BrandLookupController::class, 'index'])
    ->middleware('api_key')
    ->name('api.brands.index');
Route::get('brands/{code}', [BrandLookupController::class, 'show'])->name('api.brands.show');

Route::get('attributes', [AttributeLookupController::class, 'index'])
    ->middleware('api_key')
    ->name('api.attributes.index');
Route::get('attributes/{code}', [AttributeLookupController::class, 'show'])->name('api.attributes.show');

Route::get('base-units', [BaseUnitLookupController::class, 'index'])
    ->middleware('api_key')
    ->name('api.baseUnits.index');
Route::get('base-units/{code}', [BaseUnitLookupController::class, 'show'])->name('api.baseUnits.show');
