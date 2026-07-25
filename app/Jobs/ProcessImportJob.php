<?php

namespace App\Jobs;

use App\Models\ImportConfig;
use App\Models\JobTracker;
use App\Services\ImportExport\ImportExportRegistry;
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

        $importer = ImportExportRegistry::importer($config->type);

        $rowNumber = 1; // header is row 1, data starts at row 2
        $created = 0;
        $skipped = 0;
        $processed = 0;
        $aborted = false;

        foreach (SpreadsheetReader::read($absolutePath, $config->file_format, $config->field_separator ?: ',') as $row) {
            $rowNumber++;
            $processed++;

            try {
                $importer->importRow($row, $config);
                $created++;
            } catch (\Throwable $e) {
                $skipped++;
                $tracker->appendError($rowNumber, $e->getMessage());

                if ($config->validation_strategy === 'stop_on_errors' && $skipped > $config->allowed_errors) {
                    $aborted = true;
                    break;
                }
            }
        }

        $tracker->status = $aborted ? 'failed' : 'completed';
        $tracker->completed_at = now();
        $tracker->total_records_created = $created;
        $tracker->total_records_skipped = $skipped;
        $tracker->total_rows_processed = $processed;
        $tracker->save();
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
