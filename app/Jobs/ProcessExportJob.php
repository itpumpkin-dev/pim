<?php

namespace App\Jobs;

use App\Models\ExportConfig;
use App\Models\JobTracker;
use App\Services\ImportExport\Exporters\HasMediaFiles;
use App\Services\ImportExport\ImportExportRegistry;
use App\Services\ImportExport\MediaZipBuilder;
use App\Services\ImportExport\SpreadsheetWriter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class ProcessExportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public int $jobTrackerId)
    {
    }

    public function handle(): void
    {
        $tracker = JobTracker::find($this->jobTrackerId);
        if (!$tracker || !$tracker->export_config_id) {
            return;
        }

        $config = ExportConfig::find($tracker->export_config_id);
        if (!$config) {
            $this->markFailed($tracker, 'Export configuration no longer exists.');
            return;
        }

        $tracker->update(['status' => 'processing', 'started_at' => now()]);

        $exporter = ImportExportRegistry::exporter($config->type);
        $columns = $exporter->columns();

        $dir = "exports/{$tracker->id}";
        Storage::disk('local')->makeDirectory($dir);
        $dataFileName = "data.{$config->file_format}";
        $dataAbsolutePath = Storage::disk('local')->path("{$dir}/{$dataFileName}");

        $rowCount = 0;
        $rows = (function () use ($exporter, $config, &$rowCount) {
            foreach ($exporter->rows($config) as $row) {
                $rowCount++;
                yield $row;
            }
        })();

        SpreadsheetWriter::write($dataAbsolutePath, $config->file_format, $columns, $rows, $config->field_separator ?: ',');

        $resultRelativePath = "{$dir}/{$dataFileName}";

        if ($config->with_media && $exporter instanceof HasMediaFiles) {
            $zipRelativePath = "{$dir}/export.zip";
            $zipAbsolutePath = Storage::disk('local')->path($zipRelativePath);
            MediaZipBuilder::build($zipAbsolutePath, $dataAbsolutePath, $dataFileName, $exporter->mediaPaths($config));
            $resultRelativePath = $zipRelativePath;
        }

        $config->update(['result_file_path' => $resultRelativePath]);

        $tracker->status = 'completed';
        $tracker->completed_at = now();
        $tracker->total_records_created = $rowCount;
        $tracker->total_rows_processed = $rowCount;
        $tracker->result_file_path = $resultRelativePath;
        $tracker->save();
    }

    public function failed(\Throwable $exception): void
    {
        $tracker = JobTracker::find($this->jobTrackerId);
        if (!$tracker) {
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
