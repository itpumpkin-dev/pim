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

    /**
     * @param  array<int>|null  $categoryIds  Explicit Shopee category ids to
     *  sync (the "Sync brand" row action on categories/shopee-mapping.tsx,
     *  scoped to whichever one row it was clicked on). Null falls back to
     *  every Shopee category currently mapped from a PIM category — the
     *  original bulk "Sync Now" behavior on the brands marketplace-sync hub.
     */
    public function __construct(public int $jobTrackerId, public ?array $categoryIds = null)
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

        $categoryIds = $this->categoryIds !== null
            ? collect($this->categoryIds)
            : Category::whereNotNull('shopee_category_id')->distinct()->pluck('shopee_category_id');

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

        // Confirmed live against a real category: Shopee can keep answering
        // has_next_page=true indefinitely without the brand_id set actually
        // growing (see this class's docblock) — with no API error to catch,
        // that reads as a normal, endless loop. If a category goes this many
        // consecutive pages without contributing even one new brand_id,
        // treat it as stalled and move on instead of spinning until someone
        // notices and cancels the whole job by hand.
        $maxStalePages = 5;

        try {
            foreach ($categoryIds as $categoryId) {
                $offset = 0;
                // Shopee's own cap (confirmed live) — fewer, fuller pages
                // means fewer round trips for the same amount of real data.
                $pageSize = 100;
                $stalePages = 0;
                // Local to this category, unlike $seenIds below — a bulk run
                // (categoryIds === null) walks every PIM-mapped category in
                // one job, and the same brand_id legitimately recurs across
                // categories (a shared/global brand). Measuring staleness
                // against the job-wide $seenIds meant a later category whose
                // pages happened to be full of brands an earlier category
                // already recorded looked "stalled" and got skipped after 5
                // pages, even though it was making real progress — silently
                // truncating that category's coverage the same way the
                // original offset-cursor bug did.
                $categorySeenIds = [];

                do {
                    $response = $client->getBrandList((int) $categoryId, $offset, $pageSize);

                    $countBefore = count($categorySeenIds);
                    // Keyed by brand_id, not appended — confirmed live that a
                    // single page's brand_list can contain the same brand_id
                    // twice (Shopee-side data quality, not a pagination
                    // artifact: seen within one response, not across pages).
                    // Postgres's upsert() rejects a batch that targets the
                    // same conflict key twice ("ON CONFLICT DO UPDATE command
                    // cannot affect row a second time"), so this has to be
                    // deduped before it ever reaches the upsert call below.
                    $chunk = [];
                    foreach ($response['response']['brand_list'] ?? [] as $brand) {
                        $brandId = (int) ($brand['brand_id'] ?? 0);
                        if ($brandId <= 0) {
                            // Shopee's generic "No Brand" entry for the category —
                            // not a real brand to offer for mapping.
                            continue;
                        }

                        $seenIds[$brandId] = true;
                        $categorySeenIds[$brandId] = true;
                        $chunk[$brandId] = [
                            'id' => $brandId,
                            'name' => $brand['original_brand_name'] ?? (string) $brandId,
                            'category_id' => (int) $categoryId,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ];
                    }
                    $chunk = array_values($chunk);

                    if ($chunk !== []) {
                        // Upserted per page (not accumulated for one big
                        // upsert at the end) so a timeout, crash, or
                        // cancellation partway through a run this long
                        // doesn't throw away everything already fetched.
                        ShopeeBrand::upsert($chunk, ['id'], ['name', 'category_id', 'updated_at']);
                    }

                    $stalePages = count($categorySeenIds) > $countBefore ? 0 : $stalePages + 1;

                    $hasMore = (bool) ($response['response']['has_next_page'] ?? false);
                    // NOT $offset + $pageSize — confirmed live that get_brand_list's
                    // "offset" is an opaque cursor the response hands back as
                    // next_offset (observed value: the next brand_id to start
                    // from), not a page multiplier. Treating it as the latter is
                    // what made every category "stall" after page 1: offset=100,
                    // offset=200, etc. all replayed the exact same second page
                    // instead of advancing, which is exactly what the stale-page
                    // safeguard below was (correctly) catching — real brands
                    // thousands of pages deep, like a category's actual "Pumpkin"
                    // brand, were simply never reachable under the old math.
                    $offset = (int) ($response['response']['next_offset'] ?? 0);
                    $pagesSinceFlush++;

                    if ($stalePages >= $maxStalePages) {
                        $tracker->appendWarning(0, "Category {$categoryId} stopped after {$maxStalePages} consecutive pages (offset {$offset}) with no new brands — Shopee kept reporting more pages without any new brand_id, so this category was skipped instead of paginating forever.");
                        break;
                    }

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
