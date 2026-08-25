<?php

namespace App\Jobs;

use App\Models\JobTracker;
use App\Models\LazadaBrand;
use App\Models\LazadaSellerAccount;
use App\Services\Lazada\LazadaClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Runs BrandController::syncLazadaBrands()'s actual work off-request.
 * Simpler loop shape than SyncShopeeBrandsJob — Lazada's
 * /category/brands/query isn't scoped to any category (confirmed live: it's
 * one flat list, no category param exists), so there's no outer per-category
 * loop, just pagination. Still needs to be a queued job though: confirmed
 * live, 2026-08-21, this seller account's catalog has 153,551 total brands
 * — at the max page size (200) that's ~768 calls, measured at ~0.64s each
 * (~8+ minutes minimum, before the inter-page throttle), far past any web
 * request timeout.
 *
 * Pagination loop confirmed live, 2026-08-25, to end on `page_index <
 * total_page` (both present in every response's `data`) — NOT "did the last
 * page come back with fewer than $pageSize rows", which this originally
 * used and which silently truncated every real sync to ~6,800 of 153,000+
 * brands: a short (199-of-200) page showed up mid-result-set at
 * startRow=6600 while page_index was only 34 of 769, with a full page again
 * immediately after at startRow=6800. Same class of bug as
 * SyncShopeeBrandsJob's offset-cursor fix — a real brand (Lazada's own
 * "PUMPKIN", confirmed via a live get_item lookup) was unreachable under the
 * old math for exactly this reason.
 */
class SyncLazadaBrandsJob implements ShouldQueue
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

        $account = LazadaSellerAccount::active()->first();
        if (! $account) {
            $this->markFailed($tracker, 'No active Lazada seller account found to authenticate the sync.');

            return;
        }

        $tracker->update(['status' => 'processing', 'started_at' => now()]);

        $client = new LazadaClient($account);
        $seenIds = [];
        $now = now();
        $startRow = 0;
        $pageSize = 200;

        // Same progress-flush/cancellation-check cadence as
        // SyncShopeeBrandsJob — see that job's comment for why.
        $progressFlushInterval = 5;
        $pagesSinceFlush = 0;

        try {
            do {
                $response = $client->queryBrands($startRow, $pageSize);
                $module = $response['data']['module'] ?? [];

                // Keyed by brand_id, not appended — same Postgres upsert
                // constraint as SyncShopeeBrandsJob's chunk ("ON CONFLICT DO
                // UPDATE command cannot affect row a second time" if a page
                // ever repeats an id), deduped here as cheap defense-in-depth
                // even though it hasn't actually been observed for Lazada.
                $chunk = [];
                foreach ($module as $brand) {
                    $brandId = (int) ($brand['brand_id'] ?? 0);
                    if ($brandId <= 0) {
                        continue;
                    }

                    $seenIds[$brandId] = true;
                    $chunk[$brandId] = [
                        'id' => $brandId,
                        'name' => $brand['name'] ?? (string) $brandId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
                $chunk = array_values($chunk);

                if ($chunk !== []) {
                    // Upserted per page, same reasoning as SyncShopeeBrandsJob
                    // — a run this long shouldn't lose everything already
                    // fetched to a timeout, crash, or cancellation.
                    LazadaBrand::upsert($chunk, ['id'], ['name', 'updated_at']);
                }

                // NOT count($module) === $pageSize — confirmed live that
                // Lazada can return a short page (199 of 200 requested) in
                // the *middle* of the result set, not just on the genuine
                // last page: startRow=6600 returned 199 rows while
                // page_index=34 of total_page=769 (735 pages of real data
                // still unfetched) — startRow=6800 right after it returned a
                // full 200-row page again. The old "did this page come back
                // short" check treated that single short page as "done" and
                // silently truncated every sync to ~6,800 of 153,000+ real
                // brands (confirmed: this is why a real brand like Pumpkin
                // Water Pump's own "PUMPKIN" never made it into the local
                // cache). `page_index < total_page` is the actual signal
                // Lazada's own response provides for this.
                $pageIndex = (int) ($response['data']['page_index'] ?? 0);
                $totalPage = (int) ($response['data']['total_page'] ?? 0);
                $hasMore = $pageIndex > 0 && $pageIndex < $totalPage;

                $startRow += $pageSize;
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
