<?php

namespace App\Console\Commands;

use App\Models\MarketplaceListing;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\Details\MarketplaceListingDetailService;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Bulk-fills marketplace_listing_details (read-only API calls) for the items
 * already in marketplace_listings — synchronously, one item at a time with a
 * pause between API calls, one item failing never stops the run (its error
 * is stored on the row). Items whose detail is still fresh (TTL) are skipped
 * unless --force. Runs nightly with --force (MarketplaceListingDetailsSchedule, 03:00).
 *
 *   php artisan marketplace:fetch-listing-details --shop=2 --limit=20
 *   php artisan marketplace:fetch-listing-details --platform=shopee --only-missing
 *   php artisan marketplace:fetch-listing-details --shop=25 --item=1729576598930885292 --force -v
 */
class FetchMarketplaceListingDetailsCommand extends Command
{
    protected $signature = 'marketplace:fetch-listing-details
        {--shop=* : Shop id(s) (default: every shop on a supported platform that has listings)}
        {--platform= : Only shops of this platform (lazada|shopee|tiktok|woocommerce)}
        {--item=* : Only these item ids (with a single --shop)}
        {--only-missing : Only items never fetched successfully}
        {--force : Re-fetch even when the stored detail is still fresh}
        {--limit= : At most this many items per shop}
        {--sleep-ms=300 : Pause between API fetches (ms)}';

    protected $description = 'Fetch full marketplace listing details (read-only) into marketplace_listing_details';

    public function handle(MarketplaceListingDetailService $service): int
    {
        $shopIds = array_filter(array_map('intval', (array) $this->option('shop')));
        $platform = $this->option('platform') ? strtolower((string) $this->option('platform')) : null;
        $items = array_values(array_filter(array_map('strval', (array) $this->option('item'))));
        $limit = $this->option('limit') !== null ? max(1, (int) $this->option('limit')) : null;
        $sleepMs = max(0, (int) $this->option('sleep-ms'));
        $force = (bool) $this->option('force');
        $onlyMissing = (bool) $this->option('only-missing');

        if ($platform !== null && ! array_key_exists($platform, MarketplaceListingFetcherResolver::FETCHERS)) {
            $this->error("Unknown platform '{$platform}'.");

            return self::INVALID;
        }
        if ($items !== [] && count($shopIds) !== 1) {
            $this->error('--item needs exactly one --shop.');

            return self::INVALID;
        }

        $shops = SalesPlatformShop::with('platform')
            ->when($shopIds !== [], fn ($q) => $q->whereIn('id', $shopIds))
            ->whereExists(fn ($q) => $q->select(DB::raw(1))->from('marketplace_listings')
                ->whereColumn('marketplace_listings.sales_platform_shop_id', 'sales_platform_shops.id'))
            ->orderBy('id')
            ->get()
            ->filter(function (SalesPlatformShop $shop) use ($platform) {
                $key = MarketplaceListingFetcherResolver::platformKey($shop);

                return $key !== null && ($platform === null || $key === $platform);
            })
            ->values();

        if ($shops->isEmpty()) {
            $this->warn('No matching shops with synced listings (run marketplace:sync-listings first).');

            return self::SUCCESS;
        }

        $this->line(sprintf('[%s] marketplace:fetch-listing-details shops=%d ttl=%dh%s%s',
            now()->toDateTimeString(), $shops->count(), $service->ttlHours(), $force ? ' force' : '', $onlyMissing ? ' only-missing' : ''));

        $totalFailed = 0;
        foreach ($shops as $shop) {
            $itemIds = $this->itemIds($shop, $items, $onlyMissing, $limit);
            $this->line("#{$shop->id} {$shop->name} [{$shop->platform?->name}] — ".count($itemIds).' item(s)');
            if ($itemIds === []) {
                continue;
            }

            $verbose = $this->output->isVerbose();
            $bar = $verbose ? null : $this->output->createProgressBar(count($itemIds));
            $bar?->start();
            $failures = [];
            $fetchMs = [];
            $started = microtime(true);

            $stats = $service->fetchMany($shop, $itemIds, $force, $sleepMs, function (string $itemId, $detail, string $outcome) use ($bar, $verbose, &$failures, &$fetchMs) {
                if ($outcome !== 'cached' && $detail?->fetch_duration_ms !== null) {
                    $fetchMs[] = $detail->fetch_duration_ms;
                }
                if ($outcome === 'failed') {
                    $failures[$itemId] = mb_substr((string) $detail?->fetch_error, 0, 200);
                }
                if ($verbose) {
                    $this->line(sprintf('  %s %-8s %s%s', $itemId, $outcome,
                        $detail?->fetch_duration_ms !== null && $outcome !== 'cached' ? $detail->fetch_duration_ms.'ms ' : '',
                        $outcome === 'failed' ? $failures[$itemId] : mb_substr((string) $detail?->name, 0, 60)));
                }
                $bar?->advance();
            });

            $bar?->finish();
            if ($bar) {
                $this->newLine();
            }
            $avg = $fetchMs !== [] ? (int) round(array_sum($fetchMs) / count($fetchMs)) : null;
            $this->info(sprintf('  fetched=%d cached=%d failed=%d in %.1fs%s', $stats['fetched'], $stats['cached'], $stats['failed'],
                microtime(true) - $started, $avg !== null ? " (avg API {$avg} ms/item)" : ''));
            foreach (array_slice($failures, 0, 20, true) as $itemId => $error) {
                $this->warn("  ! {$itemId}: {$error}");
            }
            $totalFailed += $stats['failed'];
        }

        return $totalFailed > 0 ? self::FAILURE : self::SUCCESS;
    }

    /**
     * @param  list<string>  $only
     * @return list<string>
     */
    private function itemIds(SalesPlatformShop $shop, array $only, bool $onlyMissing, ?int $limit): array
    {
        return MarketplaceListing::query()
            ->where('sales_platform_shop_id', $shop->id)
            ->when($only !== [], fn ($q) => $q->whereIn('item_id', $only))
            ->when($onlyMissing, fn ($q) => $q->whereNotExists(fn ($e) => $e->select(DB::raw(1))->from('marketplace_listing_details as d')
                ->whereColumn('d.sales_platform_shop_id', 'marketplace_listings.sales_platform_shop_id')
                ->whereColumn('d.item_id', 'marketplace_listings.item_id')
                ->whereNotNull('d.fetched_at')))
            ->distinct()
            ->orderBy('item_id')
            ->when($limit !== null, fn ($q) => $q->limit($limit))
            ->pluck('item_id')
            ->map(fn ($id) => (string) $id)
            ->all();
    }
}
