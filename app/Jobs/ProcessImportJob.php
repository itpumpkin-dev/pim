<?php

namespace App\Jobs;

use App\Models\Category;
use App\Models\ImportConfig;
use App\Models\JobTracker;
use App\Services\ImportExport\ImportExportRegistry;
use App\Services\ImportExport\RowHeaderNormalizer;
use App\Services\ImportExport\SpreadsheetReader;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class ProcessImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public int $jobTrackerId)
    {
    }

    public function handle(): void
    {
        $tracker = JobTracker::find($this->jobTrackerId);
        if (!$tracker || !$tracker->import_config_id) {
            return;
        }

        $config = ImportConfig::find($tracker->import_config_id);
        if (!$config || !$config->source_file_path) {
            $this->markFailed($tracker, 0, 'No source file uploaded for this import configuration.');
            return;
        }

        $absolutePath = Storage::disk('local')->path($config->source_file_path);
        if (!is_file($absolutePath)) {
            $this->markFailed($tracker, 0, "Source file not found: {$config->source_file_path}");
            return;
        }

        $tracker->update(['status' => 'processing', 'started_at' => now()]);

        $importer = ImportExportRegistry::importer($config->type, $tracker->user);
        $columnLabels = $importer->columnLabels();

        $rowNumber = 1; // header is row 1, data starts at row 2
        $created = 0;
        $skipped = 0;
        $processed = 0;
        $aborted = false;
        $cancelled = false;

        // How often (in rows) to flush progress to the DB while the loop is
        // still running — without this, the counters/error log the frontend
        // polls every 2s (see JobTrackerController::status()) stay at their
        // initial values for the whole job and only jump to the final
        // numbers the instant it finishes, since the only other write was
        // the single save() after the loop. Also doubles as the interval at
        // which a cancellation request (JobTrackerController::cancel(), a
        // separate web request) gets noticed — cancelling can only ever stop
        // the loop *between* rows, never mid-row, so a row already being
        // written always finishes first.
        $progressFlushInterval = 25;

        foreach (SpreadsheetReader::read($absolutePath, $config->file_format, $config->field_separator ?: ',') as $row) {
            $rowNumber++;
            $processed++;

            try {
                // The sample template now ships with the localized label as
                // its header row (see SampleTemplateBuilder) rather than the
                // raw code — every importRow() implementation still only
                // ever sees code-keyed rows, exactly as before.
                $warnings = $importer->importRow(RowHeaderNormalizer::normalize($row, $columnLabels), $config);
                foreach ($warnings as $warning) {
                    $tracker->appendWarning($rowNumber, $warning);
                }
                $created++;
            } catch (\Throwable $e) {
                $skipped++;
                $tracker->appendError($rowNumber, $e->getMessage());

                if ($config->validation_strategy === 'stop_on_errors' && $skipped > $config->allowed_errors) {
                    $aborted = true;
                    break;
                }
            }

            if ($processed % $progressFlushInterval === 0) {
                $tracker->update([
                    'total_records_created' => $created,
                    'total_records_skipped' => $skipped,
                    'total_rows_processed' => $processed,
                ]);

                // Re-fetched fresh from the DB rather than read off $tracker
                // itself — the cancel request lands via a separate web
                // request/process and would never be visible on this
                // long-lived in-memory instance otherwise.
                if (JobTracker::where('id', $tracker->id)->whereNotNull('cancel_requested_at')->exists()) {
                    $cancelled = true;
                    break;
                }
            }
        }

        $tracker->status = $cancelled ? 'cancelled' : ($aborted ? 'failed' : 'completed');
        $tracker->completed_at = now();
        $tracker->total_records_created = $created;
        $tracker->total_records_skipped = $skipped;
        $tracker->total_rows_processed = $processed;
        $tracker->save();

        // One bump for the whole batch (not per-row — CategoryRowImporter can
        // touch hundreds of rows) so the cached tree the product edit page's
        // picker uses doesn't miss an imported/renamed/reparented category.
        if ($config->type === 'categories' && $created > 0) {
            Category::bumpTreeCacheVersion();
        }
    }

    public function failed(\Throwable $exception): void
    {
        $tracker = JobTracker::find($this->jobTrackerId);
        if (!$tracker) {
            return;
        }

        $this->markFailed($tracker, 0, 'Job failed: '.$exception->getMessage());
    }

    private function markFailed(JobTracker $tracker, int $row, string $message): void
    {
        $tracker->appendError($row, $message);
        $tracker->status = 'failed';
        $tracker->completed_at = now();
        $tracker->save();
    }
}
