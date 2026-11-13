<?php

use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailsSchedule;
use Illuminate\Console\Scheduling\Schedule;

/**
 * Nightly listing-detail sync ("sync ข้อมูล") — registered from config, after the 02:00 listing sync.
 */
test('the nightly detail sync is registered from config (time, timezone, overlap guard, --force) and can be switched off', function () {
    config(['services.marketplace_listing_details' => ['ttl_hours' => 24, 'schedule_enabled' => true, 'schedule_time' => '04:15', 'timezone' => 'Asia/Bangkok']]);
    $event = MarketplaceListingDetailsSchedule::register(new Schedule('UTC'));

    expect($event)->not->toBeNull()
        ->and($event->expression)->toBe('15 4 * * *')
        ->and($event->timezone)->toBe('Asia/Bangkok')
        ->and($event->withoutOverlapping)->toBeTrue()
        ->and($event->expiresAt)->toBe(600)
        ->and($event->runInBackground)->toBeTrue()
        ->and($event->command)->toContain('marketplace:fetch-listing-details --force')
        ->and($event->output)->toEndWith('marketplace-details.log');

    config(['services.marketplace_listing_details.schedule_enabled' => false]);
    expect(MarketplaceListingDetailsSchedule::register(new Schedule('UTC')))->toBeNull();

    // the app's own schedule (routes/console.php) has it at the default 03:00 Bangkok
    $registered = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains((string) $e->command, 'marketplace:fetch-listing-details'));
    expect($registered)->not->toBeNull()
        ->and($registered->expression)->toBe('0 3 * * *')
        ->and($registered->timezone)->toBe('Asia/Bangkok');
});
