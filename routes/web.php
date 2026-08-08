<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\LocaleController;
use App\Http\Controllers\StorefrontController;
use Illuminate\Support\Facades\Route;

Route::get('/', [StorefrontController::class, 'home'])->name('home');

Route::put('locale', [LocaleController::class, 'update'])->name('locale.update');

Route::middleware(['auth'])->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard')->middleware('permission:dashboards,list_dashboards');
});

// Public product detail page. Anonymous visitors always see the full mapped
// product (AttributeAccessPolicy treats a null viewer as unrestricted — same
// rule as home()). If a logged-in staff user with Attribute Access
// restrictions (e.g. no view access to Pricing & Packaging) opens this page
// instead, StorefrontController::show() still passes their user through to
// ProductPresenter so the restricted fields get blanked out for them.
Route::get('products/{id}', [StorefrontController::class, 'show'])->name('products.show');
Route::post('storefront/events', [StorefrontController::class, 'trackEvent'])->name('storefront.events.track');

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
require __DIR__.'/system.php';
require __DIR__.'/catalog.php';
require __DIR__.'/import_export.php';
