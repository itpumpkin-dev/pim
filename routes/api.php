<?php

use App\Http\Controllers\Api\ProductLookupController;
use Illuminate\Support\Facades\Route;

Route::get('products/{sku}', [ProductLookupController::class, 'show'])->name('api.products.show');
