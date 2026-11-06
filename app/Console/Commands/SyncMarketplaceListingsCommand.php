<?php

namespace App\Console\Commands;

use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use App\Services\Marketplace\Listings\MarketplaceListingSyncService;
use Illuminate\Console\Command;

/**
 * Synchronous counterpart of SyncMarketplaceListingsJob — reads listings
 * (read-only API calls) for the selected shops and re-runs the exact-SKU
 * auto-match, printing per-shop stats. One shop failing doesn't stop the
 * rest.
 */
class SyncMarketplaceListingsCommand extends Command
{
    protected $signature = 'marketplace:sync-listings
        {--shop=* : Shop id(s) to sync (default: every shop on a supported platform)}
        {--platform= : Only shops of this platform (lazada|shopee|tiktok|woocommerce)}';

    protected $description = 'Sync marketplace listings into marketplace_listings and auto-match them to PIM products by exact SKU';

    public function handle(MarketplaceListingSyncService $service): int
    {
        $shopIds = array_filter(array_map('intval', (array) $this->option('shop')));
        $platform = $this->option('platform') ? strtolower((string) $this->option('platform')) : null;

        if ($platform !== null && ! array_key_exists($platform, MarketplaceListingFetcherResolver::FETCHERS)) {
            $this->error("Unknown platform '{$platform}'.");

            return self::INVALID;
        }

        $shops = SalesPlatformShop::with('platform')
            ->when($shopIds !== [], fn ($q) => $q->whereIn('id', $shopIds))
            ->orderBy('id')
            ->get()
            ->filter(function (SalesPlatformShop $shop) use ($platform) {
                $key = MarketplaceListingFetcherResolver::platformKey($shop);

                return $key !== null && ($platform === null || $key === $platform);
            })
            ->values();

        if ($shops->isEmpty()) {
            $this->warn('No matching shops.');

            return self::SUCCESS;
        }

        $failed = 0;
        foreach ($shops as $shop) {
            $label = "#{$shop->id} {$shop->name} [{$shop->platform?->name}]";
            $this->line("Syncing {$label} ...");
            $started = microtime(true);

            try {
                $stats = $service->syncShop($shop);
                $total = $stats['matched'] + $stats['unmatched'];
                $pct = $total > 0 ? round($stats['matched'] * 100 / $total, 1) : 0;
                $this->info(sprintf(
                    '  fetched=%d upserted=%d deleted=%d matched=%d unmatched=%d (%s%% matched) in %.1fs',
                    $stats['fetched'], $stats['upserted'], $stats['deleted'], $stats['matched'], $stats['unmatched'], $pct, microtime(true) - $started
                ));
            } catch (\Throwable $e) {
                $failed++;
                $this->error("  FAILED: {$e->getMessage()}");
                report($e);
            }
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
