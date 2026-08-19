<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JobTracker extends Model
{
    protected $fillable = [
        'job_type',
        'entity_type',
        'config_code',
        'import_config_id',
        'export_config_id',
        'status',
        'user_id',
        'started_at',
        'completed_at',
        'cancel_requested_at',
        'total_records_created',
        'total_records_skipped',
        'total_rows_processed',
        'total_translations_queued',
        'total_translations_completed',
        'result_file_path',
        'error_log',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancel_requested_at' => 'datetime',
            'total_records_created' => 'integer',
            'total_records_skipped' => 'integer',
            'total_rows_processed' => 'integer',
            'total_translations_queued' => 'integer',
            'total_translations_completed' => 'integer',
            'error_log' => 'array',
        ];
    }

    public function importConfig(): BelongsTo
    {
        return $this->belongsTo(ImportConfig::class);
    }

    public function exportConfig(): BelongsTo
    {
        return $this->belongsTo(ExportConfig::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function appendError(int $row, string $message): void
    {
        $this->appendLogEntry($row, $message, 'error');
    }

    public function appendWarning(int $row, string $message): void
    {
        $this->appendLogEntry($row, $message, 'warning');
    }

    private function appendLogEntry(int $row, string $message, string $level): void
    {
        $log = $this->error_log ?? [];
        $log[] = ['row' => $row, 'message' => $message, 'level' => $level];
        $this->error_log = $log;
    }
}
