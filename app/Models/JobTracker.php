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

    /**
     * Opens a tracker row for a standalone auto-translation run (i.e. one
     * not driven by an import, which reports onto its own import tracker).
     * Starts in 'processing' with zero counters; callers then bump
     * total_translations_queued as they dispatch the per-record jobs, and
     * each job calls noteTranslationDone() as it finishes.
     */
    public static function openTranslation(string $entityType, string $configCode, ?int $userId): self
    {
        return static::create([
            'job_type' => 'translation',
            'entity_type' => $entityType,
            'config_code' => $configCode,
            'status' => 'processing',
            'user_id' => $userId,
            'started_at' => now(),
        ]);
    }

    public function noteTranslationQueued(int $count = 1): void
    {
        $this->increment('total_translations_queued', $count);
    }

    /**
     * Called by each AutoTranslate* job as it finishes (success or a
     * terminal failure — see those jobs' failed() methods). Bumps the
     * completed counter, records any error, and closes the tracker once
     * every queued job has reported back.
     */
    public function noteTranslationDone(?string $error = null): void
    {
        $this->increment('total_translations_completed');

        if ($error !== null) {
            $this->appendError(0, $error);
            $this->save();
        }

        $fresh = $this->fresh();
        if (
            $fresh
            && $fresh->status === 'processing'
            && $fresh->total_translations_queued > 0
            && $fresh->total_translations_completed >= $fresh->total_translations_queued
        ) {
            $fresh->update([
                'status' => 'completed',
                'completed_at' => now(),
            ]);
        }
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
