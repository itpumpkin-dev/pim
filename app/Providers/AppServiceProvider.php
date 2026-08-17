<?php

namespace App\Providers;

use App\Listeners\AuditAuthEventSubscriber;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Event::subscribe(AuditAuthEventSubscriber::class);

        // routes/api.php had no throttling at all — enabled via
        // ->throttleApi() in bootstrap/app.php, which applies this 'api'
        // limiter to the whole group. Keyed by API key when present (so one
        // integration's usage doesn't starve another's) falling back to IP
        // for the unauthenticated show() lookup.
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->header('X-API-Key') ?: $request->ip());
        });
    }
}
