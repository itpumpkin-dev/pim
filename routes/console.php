<?php

use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailsSchedule;
use App\Services\Marketplace\Listings\MarketplaceListingSyncSchedule;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Nightly marketplace listing sync (Product Matching) — time / on-off via
// config('services.marketplace_listing_sync'); see MarketplaceListingSyncSchedule.
MarketplaceListingSyncSchedule::register(Schedule::getFacadeRoot());

// Nightly listing DETAIL sync (category / brand / images / attributes), after the listing sync —
// config('services.marketplace_listing_details'); see MarketplaceListingDetailsSchedule.
MarketplaceListingDetailsSchedule::register(Schedule::getFacadeRoot());
