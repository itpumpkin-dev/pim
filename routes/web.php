<?php

use App\Http\Controllers\LocaleController;
use App\Http\Controllers\StorefrontController;
use App\Models\User;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', [StorefrontController::class, 'home'])->name('home');

Route::put('locale', [LocaleController::class, 'update'])->name('locale.update');

Route::middleware(['auth'])->group(function () {
    Route::get('/dashboard', function () {
        $recentLogs = \App\Models\AuditLog::with('user')
            ->orderBy('id', 'desc')
            ->limit(10)
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'event' => $log->event,
                    'user' => $log->user ? $log->user->name : 'System',
                    'auditable_type' => $log->auditable_type ? basename(str_replace('\\', '/', $log->auditable_type)) : null,
                    'auditable_id' => $log->auditable_id,
                    'created_at' => $log->created_at->toIso8601String(),
                ];
            });

        return Inertia::render('dashboard', [
            'totalProduct' => \App\Models\Product::count(),
            'totalCategory' => \App\Models\Category::count(),
            'totalAttribute' => \App\Models\Attribute::count(),
            'totalGroup' => \App\Models\AttributeGroup::count(),
            'totalFamilies' => \App\Models\AttributeFamily::count(),
            'totalLocale' => \App\Models\Locale::count(),
            'totalCurrencies' => \App\Models\Currency::count(),
            'totalChannels' => \App\Models\Channel::count(),
            'recentActivities' => $recentLogs,
        ]);
    })->name('dashboard')->middleware('permission:dashboards,list_dashboards');
});

Route::get('products/{id}', [StorefrontController::class, 'show'])->name('products.show');

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
require __DIR__.'/system.php';
require __DIR__.'/catalog.php';
require __DIR__.'/import_export.php';
