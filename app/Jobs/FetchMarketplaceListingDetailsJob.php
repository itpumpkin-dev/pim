<?php

namespace App\Jobs;

use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Fetches (read-only API calls) and stores the full detail of a batch of
 * listing items of one shop into marketplace_listing_details — through
 * MarketplaceListingDetailService::fetchMany(), so fresh rows are skipped
 * unless $force and a failed item never stops the batch. Not dispatched
 * anywhere yet (the page fetches on demand; bulk fill is the
 * `marketplace:fetch-listing-details` command) — here for a later
 * "fetch all details" button / schedule. Keep batches to a few hundred items
 * (~1 s per item incl. the pause).
 */
class FetchMarketplaceListingDetailsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 1800;

    /**
     * @param  list<string>  $itemIds
     */
    public function __construct(public int $shopId, public array $itemIds, public bool $force = false, public int $sleepMs = 300) {}

    public function handle(MarketplaceListingDetailService $service): void
    {
        $shop = SalesPlatformShop::with('platform')->find($this->shopId);
        if (! $shop) {
            return;
        }

        $stats = $service->fetchMany($shop, array_map('strval', $this->itemIds), $this->force, $this->sleepMs);

        Log::info('Marketplace listing details fetched', ['shop_id' => $shop->id, 'items' => count($this->itemIds), ...$stats]);
    }
}
