<?php

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
