<?php

use App\Models\User;
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

    Route::get('users', function () {
        return Inertia::render('users/index', [
            'users' => User::query()->orderByDesc('created_at')->get(['id', 'name', 'email', 'email_verified_at', 'created_at']),
        ]);
    })->name('users.index');

    Route::get('products/{id}', function (int $id) {
        return Inertia::render('products/show', ['id' => $id]);
    })->name('products.show');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
