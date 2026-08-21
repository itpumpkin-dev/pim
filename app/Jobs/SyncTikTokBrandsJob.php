<?php

namespace App\Jobs;

use App\Models\JobTracker;
use App\Models\TikTokBrand;
use App\Models\TikTokSellerAccount;
use App\Services\TikTok\TikTokClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Runs BrandController::syncTiktokBrands()'s actual work off-request.
 * Called without a category_id (getBrands()'s category_id is optional —
 * omitting it returns the shop's whole brand list in one cursor-paginated
 * sweep, same as Lazada's flat approach, not scoped per-category like
 * Shopee), but confirmed live, 2026-08-21, this account's shop-wide brand
 * list is still 10,000 records — at page_size 100 (TikTok's max) that's
 * ~100 calls, measured at ~1.08s each, comfortably past any web request
 * timeout once the inter-page throttle is added, so this is queued.
 *
 * Pagination shape differs from SyncLazadaBrandsJob: TikTok's `getBrands()`
 * is cursor-paginated (`page_token`/`next_page_token`), not offset-based —
 * the loop continues while a `next_page_token` is present rather than
 * comparing a fetched-row count against the page size.
 */
class SyncTikTokBrandsJob implements ShouldQueue
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

        $account = TikTokSellerAccount::first();
        if (! $account) {
            $this->markFailed($tracker, 'No TikTok seller account found to authenticate the sync.');

            return;
        }

        $tracker->update(['status' => 'processing', 'started_at' => now()]);

        $client = new TikTokClient($account);
        $seenIds = [];
        $now = now();
        $pageToken = null;

        // Same progress-flush/cancellation-check cadence as
        // SyncShopeeBrandsJob/SyncLazadaBrandsJob — see those jobs' comments
        // for why.
        $progressFlushInterval = 5;
        $pagesSinceFlush = 0;

        try {
            do {
                $response = $client->getBrands(pageSize: 100, pageToken: $pageToken);
                $brands = $response['data']['brands'] ?? [];

                $chunk = [];
                foreach ($brands as $brand) {
                    $brandId = (int) ($brand['id'] ?? 0);
                    if ($brandId <= 0) {
                        continue;
                    }

                    $seenIds[$brandId] = true;
                    $chunk[] = [
                        'id' => $brandId,
                        'name' => $brand['name'] ?? (string) $brandId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }

                if ($chunk !== []) {
                    // Upserted per page, same reasoning as the other brand
                    // sync jobs — a run this long shouldn't lose everything
                    // already fetched to a timeout, crash, or cancellation.
                    TikTokBrand::upsert($chunk, ['id'], ['name', 'updated_at']);
                }

                $pageToken = $response['data']['next_page_token'] ?? null;
                $pagesSinceFlush++;

                if ($pagesSinceFlush >= $progressFlushInterval) {
                    $tracker->update(['total_rows_processed' => count($seenIds)]);
                    $pagesSinceFlush = 0;

                    if (JobTracker::where('id', $tracker->id)->whereNotNull('cancel_requested_at')->exists()) {
                        throw new JobCancelledException();
                    }
                }

                if ($pageToken) {
                    usleep(300_000);
                }
            } while ($pageToken);
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
