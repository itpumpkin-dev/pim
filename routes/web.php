<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\GlobalSearchController;
use App\Http\Controllers\LocaleController;
use App\Http\Controllers\StorefrontController;
use Illuminate\Support\Facades\Route;

Route::get('/', [StorefrontController::class, 'home'])->name('home');

Route::put('locale', [LocaleController::class, 'update'])->name('locale.update');

Route::middleware(['auth'])->group(function () {
    // No permission gate: every signed-in user can open the dashboard (it's
    // the post-login landing page). DashboardController::index() resolves
    // each stat/section against the viewer's permissions on its own, so a
    // user with little or no access just sees a near-empty dashboard rather
    // than a 403.
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

    // Fiori "Shell Search" object suggestions (resources/js/components/
    // shell-search.tsx) — no permission gate here, GlobalSearchController
    // checks each result group's own list_* permission itself, the same way
    // DashboardController resolves each stat against the viewer's access.
    Route::get('/search', [GlobalSearchController::class, 'search'])->name('search');
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
