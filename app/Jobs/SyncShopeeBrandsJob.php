<?php

namespace App\Jobs;

use App\Models\Category;
use App\Models\JobTracker;
use App\Models\ShopeeBrand;
use App\Models\ShopeeSellerAccount;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Runs BrandController::syncShopeeBrands()'s actual work off-request — unlike
 * CategoryController::syncShopeeCategories() (one call, the whole tree),
 * Shopee's get_brand_list is scoped to one category_id per call and, for at
 * least one real mapped category in this shop, keeps paginating past 10,000
 * brands (confirmed live: has_next_page was still true at offset 9950). That
 * is many minutes of network-bound work even at the minimum 300ms
 * inter-page throttle, far past any web request timeout, so this can't run
 * synchronously in the controller like the category version does.
 */
class SyncShopeeBrandsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 3600;

    public function __construct(public int $jobTrackerId)
    {
    }

    public function handle(): void
    {
        $tracker = JobTracker::find($this->jobTrackerId);
        if (! $tracker) {
            return;
        }

        $account = ShopeeSellerAccount::first();
        if (! $account) {
            $this->markFailed($tracker, 'No Shopee seller account found to authenticate the sync.');

            return;
        }

        $categoryIds = Category::whereNotNull('shopee_category_id')->distinct()->pluck('shopee_category_id');
        if ($categoryIds->isEmpty()) {
            $this->markFailed($tracker, 'No PIM categories are mapped to a Shopee category yet — map categories first (Categories > Marketplace Sync > Shopee), then sync brands.');

            return;
        }

        $tracker->update(['status' => 'processing', 'started_at' => now()]);

        $client = new ShopeeClient($account);
        $seenIds = [];
        $now = now();

        // How often (in pages) to flush the running count to the DB while
        // still mid-loop — mirrors ProcessExportJob's progress-flush
        // interval, and doubles as the point where a cancellation request
        // (a separate web request setting cancel_requested_at) gets noticed.
        $progressFlushInterval = 5;
        $pagesSinceFlush = 0;

        try {
            foreach ($categoryIds as $categoryId) {
                $offset = 0;
                $pageSize = 50;

                do {
                    $response = $client->getBrandList((int) $categoryId, $offset, $pageSize);

                    $chunk = [];
                    foreach ($response['response']['brand_list'] ?? [] as $brand) {
                        $brandId = (int) ($brand['brand_id'] ?? 0);
                        if ($brandId <= 0) {
                            // Shopee's generic "No Brand" entry for the category —
                            // not a real brand to offer for mapping.
                            continue;
                        }

                        $seenIds[$brandId] = true;
                        $chunk[] = [
                            'id' => $brandId,
                            'name' => $brand['original_brand_name'] ?? (string) $brandId,
                            'category_id' => (int) $categoryId,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }

                    if ($chunk !== []) {
                        // Upserted per page (not accumulated for one big
                        // upsert at the end) so a timeout, crash, or
                        // cancellation partway through a run this long
                        // doesn't throw away everything already fetched.
                        ShopeeBrand::upsert($chunk, ['id'], ['name', 'category_id', 'updated_at']);
                    }

                    $hasMore = (bool) ($response['response']['has_next_page'] ?? false);
                    $offset += $pageSize;
                    $pagesSinceFlush++;

                    if ($pagesSinceFlush >= $progressFlushInterval) {
                        $tracker->update(['total_rows_processed' => count($seenIds)]);
                        $pagesSinceFlush = 0;

                        if (JobTracker::where('id', $tracker->id)->whereNotNull('cancel_requested_at')->exists()) {
                            throw new JobCancelledException();
                        }
                    }

                    if ($hasMore) {
                        usleep(300_000);
                    }
                } while ($hasMore);
            }
        } catch (JobCancelledException) {
            $tracker->status = 'cancelled';
            $tracker->completed_at = now();
            $tracker->total_records_created = count($seenIds);
            $tracker->total_rows_processed = count($seenIds);
            $tracker->save();

            return;
        }

        $tracker->status = 'completed';
        $tracker->completed_at = now();
        $tracker->total_records_created = count($seenIds);
        $tracker->total_rows_processed = count($seenIds);
        $tracker->save();
    }

    public function failed(\Throwable $exception): void
    {
        $tracker = JobTracker::find($this->jobTrackerId);
        if (! $tracker) {
            return;
        }

        $this->markFailed($tracker, 'Job failed: '.$exception->getMessage());
    }

    private function markFailed(JobTracker $tracker, string $message): void
    {
        $tracker->appendError(0, $message);
        $tracker->status = 'failed';
        $tracker->completed_at = now();
        $tracker->save();
    }
}
