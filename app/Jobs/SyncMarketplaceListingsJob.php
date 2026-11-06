<?php

namespace App\Jobs;

use App\Models\MarketplaceListingSyncRun;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingSyncRunner;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Product Matching: re-reads one shop's marketplace listings (read-only API
 * calls), re-runs the exact-SKU auto-match and recomputes the score-based
 * suggestions — through MarketplaceListingSyncRunner, which also takes the
 * per-shop lock and records a marketplace_listing_sync_runs row (trigger
 * 'manual' = the page's button). Queued because a large shop (thousands of
 * listings, plus a per-item model call on Shopee) runs well past a web
 * request's time limit.
 */
class SyncMarketplaceListingsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 1800;

    public function __construct(public int $shopId, public string $trigger = MarketplaceListingSyncRun::TRIGGER_MANUAL) {}

    public function handle(MarketplaceListingSyncRunner $runner): void
    {
        $shop = SalesPlatformShop::with('platform')->find($this->shopId);
        if (! $shop) {
            return;
        }

        $stats = $runner->run($shop, $this->trigger);
        if ($stats === null) {
            return; // already syncing (logged by the runner)
        }

        Log::info('Marketplace listing sync finished', ['shop_id' => $shop->id, 'shop_name' => $shop->name, ...$stats]);
    }

    public function failed(\Throwable $e): void
    {
        Log::error('Marketplace listing sync failed', [
            'shop_id' => $this->shopId,
            'error' => $e->getMessage(),
        ]);
    }
}
