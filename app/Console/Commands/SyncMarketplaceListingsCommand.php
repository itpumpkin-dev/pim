<?php

namespace App\Console\Commands;

use App\Models\MarketplaceListingSyncRun;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use App\Services\Marketplace\Listings\MarketplaceListingSyncRunner;
use App\Services\Marketplace\Listings\ProductMatchIndexBuilder;
use Illuminate\Console\Command;

/**
 * Synchronous counterpart of SyncMarketplaceListingsJob — reads listings
 * (read-only API calls) for the selected shops one after another, re-runs
 * the exact-SKU auto-match and the score-based suggestions, printing
 * per-shop stats. Rebuilds product_match_index once up front. Every shop
 * goes through MarketplaceListingSyncRunner (lock + run record). One shop
 * failing doesn't stop the rest.
 *
 * The nightly schedule (routes/console.php → MarketplaceListingSyncSchedule)
 * runs it as `--trigger=schedule --linked-only`.
 */
class SyncMarketplaceListingsCommand extends Command
{
    protected $signature = 'marketplace:sync-listings
        {--shop=* : Shop id(s) to sync (default: every shop on a supported platform)}
        {--platform= : Only shops of this platform (lazada|shopee|tiktok|woocommerce)}
        {--linked-only : Only shops with a seller account linked (WooCommerce shops always count)}
        {--trigger=command : Recorded on the sync run (command|schedule|manual)}';

    protected $description = 'Sync marketplace listings into marketplace_listings, auto-match them by exact SKU and refresh score-based match suggestions';

    /** platform key => shop column holding the linked seller account */
    private const ACCOUNT_COLUMN = [
        'lazada' => 'lazada_seller_account_id',
        'shopee' => 'shopee_seller_account_id',
        'tiktok' => 'tiktok_seller_account_id',
    ];

    public function handle(MarketplaceListingSyncRunner $runner, ProductMatchIndexBuilder $index): int
    {
        $shopIds = array_filter(array_map('intval', (array) $this->option('shop')));
        $platform = $this->option('platform') ? strtolower((string) $this->option('platform')) : null;
        $linkedOnly = (bool) $this->option('linked-only');
        $trigger = (string) $this->option('trigger');

        if ($platform !== null && ! array_key_exists($platform, MarketplaceListingFetcherResolver::FETCHERS)) {
            $this->error("Unknown platform '{$platform}'.");

            return self::INVALID;
        }
        if (! in_array($trigger, MarketplaceListingSyncRun::TRIGGERS, true)) {
            $this->error("Unknown trigger '{$trigger}'.");

            return self::INVALID;
        }

        $shops = SalesPlatformShop::with('platform')
            ->when($shopIds !== [], fn ($q) => $q->whereIn('id', $shopIds))
            ->orderBy('id')
            ->get()
            ->filter(function (SalesPlatformShop $shop) use ($platform, $linkedOnly) {
                $key = MarketplaceListingFetcherResolver::platformKey($shop);
                if ($key === null || ($platform !== null && $key !== $platform)) {
                    return false;
                }
                $column = self::ACCOUNT_COLUMN[$key] ?? null;

                return ! $linkedOnly || $column === null || ! empty($shop->{$column});
            })
            ->values();

        $this->line('['.now()->toDateTimeString().'] marketplace:sync-listings trigger='.$trigger.' shops='.$shops->count());

        if ($shops->isEmpty()) {
            $this->warn('No matching shops.');

            return self::SUCCESS;
        }

        try {
            $built = $index->rebuild();
            $this->line("Match index rebuilt: {$built['products']} products in {$built['ms']} ms");
        } catch (\Throwable $e) {
            $this->warn("Match index rebuild failed (suggestions use the previous index): {$e->getMessage()}");
            report($e);
        }

        $failed = 0;
        foreach ($shops as $shop) {
            $label = "#{$shop->id} {$shop->name} [{$shop->platform?->name}]";
            $this->line("Syncing {$label} ...");
            $started = microtime(true);

            try {
                $stats = $runner->run($shop, $trigger, refreshIndex: false);
                if ($stats === null) {
                    $this->warn('  skipped — this shop is already syncing');

                    continue;
                }
                $total = $stats['matched'] + $stats['unmatched'];
                $pct = $total > 0 ? round($stats['matched'] * 100 / $total, 1) : 0;
                $this->info(sprintf(
                    '  fetched=%d upserted=%d deleted=%d matched=%d unmatched=%d (%s%% matched) score-suggested=%s in %.1fs',
                    $stats['fetched'], $stats['upserted'], $stats['deleted'], $stats['matched'], $stats['unmatched'], $pct,
                    $stats['score_suggested'] ?? '-', microtime(true) - $started
                ));
                if (isset($stats['suggest_error'])) {
                    $this->warn("  suggestions failed: {$stats['suggest_error']}");
                }
            } catch (\Throwable $e) {
                $failed++;
                $this->error("  FAILED: {$e->getMessage()}");
                report($e);
            }
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
