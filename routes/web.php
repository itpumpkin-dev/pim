<?php

use App\Models\User;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('home');
})->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('/dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard')->middleware('permission:dashboards,list_dashboards');
});

Route::get('products/{id}', function (int $id) {
    return Inertia::render('products/show', ['id' => $id]);
})->name('products.show');

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
require __DIR__.'/system.php';
