<?php

namespace App\Jobs;

use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingSyncService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Product Matching: re-reads one shop's marketplace listings (read-only API
 * calls) and re-runs the exact-SKU auto-match — see
 * MarketplaceListingSyncService. Queued because a large shop (thousands of
 * listings, plus a per-item model call on Shopee) runs well past a web
 * request's time limit.
 */
class SyncMarketplaceListingsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 1800;

    public function __construct(public int $shopId) {}

    public function handle(MarketplaceListingSyncService $service): void
    {
        $shop = SalesPlatformShop::with('platform')->find($this->shopId);
        if (! $shop) {
            return;
        }

        $stats = $service->syncShop($shop);

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
