<?php

namespace App\Services\Queue;

use Illuminate\Queue\Events\JobFailed;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Queue\Events\JobReleasedAfterException;
use Illuminate\Queue\Events\Looping;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

/**
 * ให้ queue:work แต่ละตัวรายงานตัวเองลง queue_worker_heartbeats — หน้า "สถานะคิวงาน"
 * (QueueMonitorController) ใช้ดูว่ามี worker ทำงานอยู่ไหม และกำลังทำงานอะไร
 *
 * Looping ยิงทุกรอบที่ worker วน (ทุก ~3 วิตอนคิวว่าง) — เขียน DB ไม่เกินทุก WRITE_EVERY วินาที
 * ส่วนเริ่ม/จบงานเขียนทันที จะได้เห็นงานที่กำลังทำอยู่ตรงๆ
 * ทุกอย่างกลืน error เงียบ — heartbeat พังต้องไม่ทำให้ worker หยุดทำงานจริง
 */
class QueueWorkerHeartbeat
{
    /** worker ถือว่ายังทำงานอยู่ถ้ารายงานตัวภายในกี่วินาที (> WRITE_EVERY + เวลาที่งานยาวๆ บล็อก loop) */
    public const ALIVE_WITHIN_SECONDS = 90;

    private const WRITE_EVERY = 15;

    private static ?float $lastWrite = null;

    public static function register(): void
    {
        // เฉพาะ process ของ queue:work (queue:listen ก็ spawn queue:work) — งาน dispatch_sync ใน tinker/
        // คำสั่งอื่นก็ยิง JobProcessing เหมือนกัน ไม่งั้นจะดูเหมือนมี worker ทั้งที่ไม่มี
        if (! app()->runningInConsole() || ! in_array('queue:work', $_SERVER['argv'] ?? [], true)) {
            return;
        }

        Event::listen(Looping::class, function (Looping $event) {
            if (self::$lastWrite === null || microtime(true) - self::$lastWrite >= self::WRITE_EVERY) {
                self::beat(['connection' => $event->connectionName, 'queue' => $event->queue]);
            }
        });
        Event::listen(JobProcessing::class, fn (JobProcessing $event) => self::beat([
            'connection' => $event->connectionName,
            'current_job' => mb_substr($event->job->resolveName(), 0, 255),
            'current_job_started_at' => now(),
        ]));
        Event::listen(JobProcessed::class, fn () => self::beat(['current_job' => null, 'current_job_started_at' => null], 'jobs_processed'));
        Event::listen(JobFailed::class, fn () => self::beat(['current_job' => null, 'current_job_started_at' => null], 'jobs_failed'));
        // throw แล้วถูกปล่อยกลับเข้าคิวรอลองใหม่ — ไม่ยิง JobProcessed/JobFailed ต้องล้าง current_job เองตรงนี้
        Event::listen(JobReleasedAfterException::class, fn () => self::beat(['current_job' => null, 'current_job_started_at' => null]));
    }

    public static function aliveWorkerCount(): int
    {
        try {
            return DB::table('queue_worker_heartbeats')
                ->where('last_seen_at', '>=', now()->subSeconds(self::ALIVE_WITHIN_SECONDS))
                ->count();
        } catch (\Throwable) {
            return 0;
        }
    }

    private static function beat(array $values, ?string $increment = null): void
    {
        try {
            $host = gethostname() ?: 'unknown';
            $pid = getmypid() ?: 0;
            $now = now();
            $key = ['worker_id' => "{$host}:{$pid}"];

            $exists = DB::table('queue_worker_heartbeats')->where($key)->exists();
            if (! $exists) {
                DB::table('queue_worker_heartbeats')->insert($key + [
                    'host' => $host, 'pid' => $pid, 'started_at' => $now, 'last_seen_at' => $now,
                ] + $values);
                // แถวของ worker ที่ตายไปนานแล้วไม่ต้องเก็บ (pid เดิมไม่กลับมาอีก)
                DB::table('queue_worker_heartbeats')->where('last_seen_at', '<', $now->copy()->subDay())->delete();
            } else {
                $update = $values + ['last_seen_at' => $now];
                if ($increment) {
                    $update[$increment] = DB::raw("{$increment} + 1");
                }
                DB::table('queue_worker_heartbeats')->where($key)->update($update);
            }
            self::$lastWrite = microtime(true);
        } catch (\Throwable) {
            // ตารางยังไม่มี (ยังไม่ migrate) / DB สะดุด — ข้ามไป รอบหน้าค่อยลองใหม่
        }
    }
}
