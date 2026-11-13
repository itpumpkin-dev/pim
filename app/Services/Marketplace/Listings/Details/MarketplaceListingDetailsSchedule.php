<?php

namespace App\Services\Marketplace\Listings\Details;

use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Cache\LockProvider;
use Illuminate\Support\Facades\Cache;

/**
 * Nightly listing-DETAIL sync ("sync ข้อมูล" — category, brand, images, attributes, variants into
 * marketplace_listing_details), registered from routes/console.php next to the listing sync
 * (MarketplaceListingSyncSchedule, 02:00): `marketplace:fetch-listing-details --force` — every
 * shop with synced listings, one item at a time with a pause between API calls (read-only).
 * --force because the run comes back every ~24 h: with the default 24 h TTL, items fetched late in
 * yesterday's run would still count as fresh and be skipped every other night.
 *
 * A full run is long (≈ 6,000 items × 1–2 s ≈ 3–3.5 h measured 2026-11), hence the later default
 * time (after the listing sync, so new listings are included) and the 10 h overlap guard.
 *
 * config('services.marketplace_listing_details'): schedule_enabled
 * (MARKETPLACE_LISTING_DETAILS_SCHEDULE, default true), schedule_time
 * (MARKETPLACE_LISTING_DETAILS_TIME, default 03:00), timezone (Asia/Bangkok). Output is appended to
 * storage/logs/marketplace-details.log. Needs the usual `schedule:run` cron line.
 */
class MarketplaceListingDetailsSchedule
{
    public const COMMAND = 'marketplace:fetch-listing-details --force';

    public static function register(Schedule $schedule): ?Event
    {
        $config = config('services.marketplace_listing_details', []);
        if (! filter_var($config['schedule_enabled'] ?? true, FILTER_VALIDATE_BOOL)) {
            return null;
        }

        $event = $schedule->command(self::COMMAND)
            ->dailyAt((string) ($config['schedule_time'] ?? '03:00'))
            ->timezone((string) ($config['timezone'] ?? 'Asia/Bangkok'))
            ->description('Nightly marketplace listing detail sync (category / brand / images / attributes)')
            ->withoutOverlapping(600)
            ->runInBackground()
            ->appendOutputTo(storage_path('logs/marketplace-details.log'));

        if (Cache::store()->getStore() instanceof LockProvider) {
            $event->onOneServer();
        }

        return $event;
    }
}
