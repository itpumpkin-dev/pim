<?php

namespace App\Models;

use App\Services\AppNotifier;
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

            // Only ever reached from AutoTranslateLabelsJob/
            // AutoTranslateJsonLabelsJob's standalone runs (JobTracker::
            // openTranslation() — "translate missing" triggered directly by
            // a user, not from inside an import). AutoTranslateProductValueJob
            // reports onto an *import's* tracker instead via a raw
            // increment(), never through this method, so an import's
            // translation sub-jobs finishing never fires a notification here
            // — imports were deliberately left out of this feature's scope.
            $errorCount = count($fresh->error_log ?? []);
            AppNotifier::notify(
                $fresh->user_id,
                'Translation completed',
                $errorCount > 0
                    ? "Translated {$fresh->total_translations_completed} item(s), {$errorCount} failed."
                    : "Translated {$fresh->total_translations_completed} item(s) successfully.",
                $errorCount > 0 ? 'failed' : 'success'
            );
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

    /**
     * error_log เป็นคอลัมน์ JSON ก้อนเดียวที่ถูกเขียนทับทั้งก้อนทุกครั้งที่
     * save — import ที่ทุกแถวมี warning (เช่น 2 หมื่นแถว) เคยทำให้ก้อนนี้โตเป็น
     * หลาย MB เขียนซ้ำทุก 25 แถว (import ช้าลงเรื่อยๆ) และหน้า Job Tracker ที่
     * poll ทุก 2 วินาทีค้าง — เลยเก็บแค่ MAX_LOG_ENTRIES รายการแรก ที่เกินจากนั้น
     * นับรวมไว้ใน entry สรุปตัวสุดท้ายตัวเดียว (row 0, omitted_* = จำนวนที่ตัดทิ้ง)
     */
    public const MAX_LOG_ENTRIES = 500;

    private function appendLogEntry(int $row, string $message, string $level): void
    {
        $log = $this->error_log ?? [];
        $log[] = ['row' => $row, 'message' => $message, 'level' => $level];
        $this->error_log = self::capLog($log);
    }

    /**
     * ตัด log ให้เหลือ MAX_LOG_ENTRIES รายการแรก + entry สรุปตัวเดียวท้ายสุด
     * (รวมนับต่อจาก summary เดิมถ้ามี) — ใช้ทั้งตอน append และ migration
     * ที่ตัด log ของงานเก่าที่ยาวเกินมาตั้งแต่ก่อนมีเพดานนี้
     *
     * @param  array<int, array<string, mixed>>  $log
     * @return array<int, array<string, mixed>>
     */
    public static function capLog(array $log): array
    {
        // entry สรุปเดิม (ถ้ามี) อยู่ที่ตำแหน่ง MAX ไม่ใช่ท้ายสุดเสมอ — entry ใหม่ที่
        // เพิ่ง append ต่อท้ายไปอยู่หลังมัน เลยต้องหาจากทั้ง log
        $summary = null;
        foreach ($log as $i => $entry) {
            if (is_array($entry) && array_key_exists('omitted_errors', $entry)) {
                $summary = $entry;
                unset($log[$i]);
            }
        }
        $log = array_values($log);

        if (count($log) <= self::MAX_LOG_ENTRIES && $summary === null) {
            return $log;
        }

        $summary ??= ['omitted_errors' => 0, 'omitted_warnings' => 0];
        $jobLevel = [];
        foreach (array_splice($log, self::MAX_LOG_ENTRIES) as $extra) {
            // ข้อความระดับงาน (row 0 เช่น "Job failed: ...") มีแค่ไม่กี่ตัวแต่สำคัญ
            // ที่สุด — เก็บไว้เสมอ ไม่นับรวมเข้า summary
            if (($extra['row'] ?? null) === 0) {
                $jobLevel[] = $extra;
                continue;
            }
            $summary['omitted_'.(($extra['level'] ?? 'error') === 'warning' ? 'warnings' : 'errors')]++;
        }
        array_push($log, ...$jobLevel);

        $summary['row'] = 0;
        $summary['level'] = $summary['omitted_errors'] > 0 ? 'error' : 'warning';
        $summary['message'] = sprintf(
            'Log limited to the first %d entries — %d more error(s) and %d more warning(s) were not recorded.',
            self::MAX_LOG_ENTRIES,
            $summary['omitted_errors'],
            $summary['omitted_warnings'],
        );
        $log[] = $summary;

        return $log;
    }
}
