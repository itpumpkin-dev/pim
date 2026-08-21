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

                $chunk = [];
                foreach ($module as $brand) {
                    $brandId = (int) ($brand['brand_id'] ?? 0);
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
                    // Upserted per page, same reasoning as SyncShopeeBrandsJob
                    // — a run this long shouldn't lose everything already
                    // fetched to a timeout, crash, or cancellation.
                    LazadaBrand::upsert($chunk, ['id'], ['name', 'updated_at']);
                }

                $fetchedCount = count($module);
                $startRow += $pageSize;
                $pagesSinceFlush++;

                if ($pagesSinceFlush >= $progressFlushInterval) {
                    $tracker->update(['total_rows_processed' => count($seenIds)]);
                    $pagesSinceFlush = 0;

                    if (JobTracker::where('id', $tracker->id)->whereNotNull('cancel_requested_at')->exists()) {
                        throw new JobCancelledException();
                    }
                }

                if ($fetchedCount === $pageSize) {
                    usleep(300_000);
                }
            } while ($fetchedCount === $pageSize);
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
