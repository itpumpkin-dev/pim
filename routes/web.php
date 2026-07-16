<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('home', function () {
        return Inertia::render('home');
    })->name('home.page');

    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');

    Route::get('new-page', function () {
        return Inertia::render('new-page');
    })->name('new-page');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
