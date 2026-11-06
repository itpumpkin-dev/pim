<?php

namespace App\Services\Marketplace\Listings;

use App\Models\MarketplaceListingSyncRun;
use App\Models\SalesPlatformShop;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * The one shared "sync a shop" path (phase 4A) used by the page's button
 * (SyncMarketplaceListingsJob), `marketplace:sync-listings` and the nightly
 * schedule:
 *
 *  1. per-shop cache lock — a second sync of the same shop while one is
 *     running (button pressed during the nightly run, double click) is
 *     skipped (run() returns null);
 *  2. runs stuck in 'running' for more than STUCK_HOURS are closed as
 *     failed (killed worker / server restart);
 *  3. a marketplace_listing_sync_runs row: running → success | failed;
 *  4. optional product_match_index rebuild (the command/schedule rebuild
 *     it once up front and pass $refreshIndex = false);
 *  5. MarketplaceListingSyncService::syncShop() (fetch + upsert + delete
 *     unseen + exact-SKU auto-match), then the score-based suggestions
 *     (ListingScoreSuggester::computeForShop). Index/suggestion errors are
 *     logged and noted in stats but don't fail the sync itself.
 */
class MarketplaceListingSyncRunner
{
    public const LOCK_TTL = 7200;

    public const STUCK_HOURS = 6;

    public function __construct(
        private readonly MarketplaceListingSyncService $sync,
        private readonly ListingScoreSuggester $scores,
        private readonly ProductMatchIndexBuilder $index,
    ) {}

    public static function lockKey(int $shopId): string
    {
        return "marketplace-listing-sync:shop:{$shopId}";
    }

    /**
     * Whether a sync of this shop is in progress right now (a non-stale
     * 'running' run row — created right after the lock is taken). Used by
     * the button to answer "กำลังซิงค์อยู่" instead of queueing again; it
     * deliberately doesn't probe the lock itself, which could make a job
     * starting at that very moment skip.
     */
    public function isRunning(int $shopId): bool
    {
        return MarketplaceListingSyncRun::where('sales_platform_shop_id', $shopId)
            ->where('status', MarketplaceListingSyncRun::STATUS_RUNNING)
            ->where('started_at', '>=', now()->subHours(self::STUCK_HOURS))
            ->exists();
    }

    /**
     * @return array<string, mixed>|null the sync stats, or null when skipped because the shop is already syncing
     *
     * @throws \Throwable the sync's own error (after recording it on the run)
     */
    public function run(SalesPlatformShop $shop, string $trigger, bool $refreshIndex = true): ?array
    {
        $lock = Cache::lock(self::lockKey($shop->id), self::LOCK_TTL);
        if (! $lock->get()) {
            Log::info('Marketplace listing sync skipped — this shop is already syncing', ['shop_id' => $shop->id, 'trigger' => $trigger]);

            return null;
        }

        try {
            self::failStuckRuns();

            $started = microtime(true);
            $run = MarketplaceListingSyncRun::create([
                'sales_platform_shop_id' => $shop->id,
                'trigger' => $trigger,
                'status' => MarketplaceListingSyncRun::STATUS_RUNNING,
                'started_at' => now(),
            ]);

            try {
                $extra = [];
                if ($refreshIndex) {
                    $extra += $this->safely('index_error', fn () => ['index_ms' => $this->index->rebuild()['ms']]);
                }

                $stats = $this->sync->syncShop($shop);

                $extra += $this->safely('suggest_error', function () use ($shop) {
                    $s = $this->scores->computeForShop($shop->id);

                    return ['score_suggested' => $s['suggested'], 'suggest_ms' => $s['ms']];
                });
                $stats += $extra;

                $run->update([
                    'status' => MarketplaceListingSyncRun::STATUS_SUCCESS,
                    'finished_at' => now(),
                    'duration_ms' => (int) round((microtime(true) - $started) * 1000),
                    'stats' => $stats,
                ]);

                return $stats;
            } catch (\Throwable $e) {
                $run->update([
                    'status' => MarketplaceListingSyncRun::STATUS_FAILED,
                    'finished_at' => now(),
                    'duration_ms' => (int) round((microtime(true) - $started) * 1000),
                    'error' => Str::limit($e->getMessage(), 2000),
                ]);

                throw $e;
            }
        } finally {
            $lock->release();
        }
    }

    /** Closes runs left 'running' for longer than STUCK_HOURS as failed. */
    public static function failStuckRuns(): int
    {
        return MarketplaceListingSyncRun::where('status', MarketplaceListingSyncRun::STATUS_RUNNING)
            ->where('started_at', '<', now()->subHours(self::STUCK_HOURS))
            ->update([
                'status' => MarketplaceListingSyncRun::STATUS_FAILED,
                'finished_at' => now(),
                'error' => 'ค้างสถานะ "กำลังซิงค์" เกิน '.self::STUCK_HOURS.' ชั่วโมง (worker ถูกหยุดหรือเซิร์ฟเวอร์รีสตาร์ต) — ระบบปิดรายการนี้ให้อัตโนมัติ',
                'updated_at' => now(),
            ]);
    }

    /**
     * @param  callable(): array<string, mixed>  $step
     * @return array<string, mixed>
     */
    private function safely(string $errorKey, callable $step): array
    {
        try {
            return $step();
        } catch (\Throwable $e) {
            Log::warning("Marketplace listing sync: {$errorKey}", ['error' => $e->getMessage()]);
            report($e);

            return [$errorKey => Str::limit($e->getMessage(), 500)];
        }
    }
}
