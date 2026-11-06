<?php

namespace App\Services\Marketplace\Listings;

use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Support\Facades\Cache;

/**
 * Nightly listing sync (phase 4A), registered from routes/console.php:
 * `marketplace:sync-listings --trigger=schedule --linked-only` — every shop
 * with a seller account linked (WooCommerce always), one after another,
 * product_match_index rebuilt once up front, auto-match + score
 * suggestions after each shop.
 *
 * config('services.marketplace_listing_sync'): schedule_enabled
 * (MARKETPLACE_LISTING_SYNC_SCHEDULE, default true), schedule_time
 * (MARKETPLACE_LISTING_SYNC_TIME, default 02:00) and timezone (Asia/Bangkok —
 * app.timezone is UTC).
 *
 * withoutOverlapping(360): a run that's still going 6 h later blocks the
 * next one; onOneServer() only when the cache store can hold locks (redis/
 * database/file/array all can — checked anyway). Output is appended to
 * storage/logs/marketplace-sync.log. Needs the usual cron line:
 *   * * * * * cd /path/to/app && php artisan schedule:run >> /dev/null 2>&1
 */
class MarketplaceListingSyncSchedule
{
    public const COMMAND = 'marketplace:sync-listings --trigger=schedule --linked-only';

    public static function register(Schedule $schedule): ?Event
    {
        $config = config('services.marketplace_listing_sync', []);
        if (! filter_var($config['schedule_enabled'] ?? true, FILTER_VALIDATE_BOOL)) {
            return null;
        }

        $event = $schedule->command(self::COMMAND)
            ->dailyAt((string) ($config['schedule_time'] ?? '02:00'))
            ->timezone((string) ($config['timezone'] ?? 'Asia/Bangkok'))
            ->description('Nightly marketplace listing sync + product matching suggestions')
            ->withoutOverlapping(360)
            ->runInBackground()
            ->appendOutputTo(storage_path('logs/marketplace-sync.log'));

        if (Cache::store()->getStore() instanceof LockProvider) {
            $event->onOneServer();
        }

        return $event;
    }
}
