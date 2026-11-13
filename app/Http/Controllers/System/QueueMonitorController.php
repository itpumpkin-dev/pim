<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\Queue\QueueWorkerHeartbeat;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * หน้า "สถานะคิวงาน" (/system/queue) — ดูว่ามี queue worker ทำงานอยู่ไหม (queue_worker_heartbeats,
 * ดู QueueWorkerHeartbeat) งานไหนค้างในคิว (ตาราง jobs ของคิวแบบ database) และงานที่ล้มเหลว
 * (failed_jobs) พร้อมลบงานค้าง / ลองงานที่ล้มเหลวใหม่
 *
 * ทำไมต้องมี: QUEUE_CONNECTION=database — ถ้าไม่มี queue:work รันอยู่ งานนำเข้า/ส่งออก/sync ทั้งหมด
 * จะค้างที่ "รอดำเนินการ" เงียบๆ โดยไม่มีอะไรบอกบนหน้าจอเลย
 */
class QueueMonitorController extends Controller
{
    public function index(): Response
    {
        $now = now();
        $retryAfter = (int) config('queue.connections.database.retry_after', 90);
        $aliveSince = $now->copy()->subSeconds(QueueWorkerHeartbeat::ALIVE_WITHIN_SECONDS);

        $workers = DB::table('queue_worker_heartbeats')
            ->where('last_seen_at', '>=', $now->copy()->subHours(6))
            ->orderByDesc('last_seen_at')
            ->get()
            ->map(fn ($w) => [
                'worker_id' => $w->worker_id,
                'host' => $w->host,
                'pid' => $w->pid,
                'queue' => $w->queue,
                'current_job' => $w->current_job ? class_basename($w->current_job) : null,
                'current_job_started_at' => $this->iso($w->current_job_started_at),
                'jobs_processed' => $w->jobs_processed,
                'jobs_failed' => $w->jobs_failed,
                'started_at' => $this->iso($w->started_at),
                'last_seen_at' => $this->iso($w->last_seen_at),
                'alive' => Carbon::parse($w->last_seen_at)->gte($aliveSince),
            ]);

        $jobs = DB::table('jobs')->orderBy('id')->limit(200)->get()->map(function ($j) use ($now, $retryAfter) {
            $payload = json_decode($j->payload, true) ?: [];
            $reservedAt = $j->reserved_at ? Carbon::createFromTimestamp($j->reserved_at) : null;

            return [
                'id' => $j->id,
                'queue' => $j->queue,
                'name' => class_basename($payload['displayName'] ?? '?'),
                'full_name' => $payload['displayName'] ?? null,
                'attempts' => $j->attempts,
                'created_at' => Carbon::createFromTimestamp($j->created_at)->toIso8601String(),
                'available_at' => Carbon::createFromTimestamp($j->available_at)->toIso8601String(),
                'reserved_at' => $reservedAt?->toIso8601String(),
                // ถูกหยิบไปแล้วแต่เกิน retry_after = worker ที่หยิบไปน่าจะตาย/ถูกปิดกลางทาง
                'stuck' => $reservedAt !== null && $reservedAt->lt($now->copy()->subSeconds($retryAfter)),
                'delayed' => $j->available_at > $now->timestamp,
            ];
        });

        $failed = DB::table('failed_jobs')->orderByDesc('id')->limit(50)->get()->map(function ($f) {
            $payload = json_decode($f->payload, true) ?: [];

            return [
                'id' => $f->id,
                'uuid' => $f->uuid,
                'queue' => $f->queue,
                'name' => class_basename($payload['displayName'] ?? '?'),
                'failed_at' => $this->iso($f->failed_at),
                'error' => mb_substr(strtok((string) $f->exception, "\n") ?: '', 0, 500),
            ];
        });

        return Inertia::render('system/queue/index', [
            'workers' => $workers,
            'jobs' => $jobs,
            'jobsTotal' => DB::table('jobs')->count(),
            'failed' => $failed,
            'failedTotal' => DB::table('failed_jobs')->count(),
            'aliveWorkers' => $workers->where('alive', true)->count(),
            'queueConnection' => config('queue.default'),
            'retryAfter' => $retryAfter,
            'canManage' => (bool) auth()->user()?->hasPermission('queue_jobs', 'manage_queue_jobs'),
        ]);
    }

    /** ลบงานออกจากคิว — งานที่ worker กำลังทำอยู่จริง (หยิบไปยังไม่เกิน retry_after) ลบไม่ได้ */
    public function destroyJob(int $id): RedirectResponse
    {
        $job = DB::table('jobs')->where('id', $id)->first();
        if (! $job) {
            return back()->with('error', "ไม่พบงาน #{$id} ในคิว (อาจทำเสร็จไปแล้ว)");
        }

        $retryAfter = (int) config('queue.connections.database.retry_after', 90);
        if ($job->reserved_at && $job->reserved_at > now()->subSeconds($retryAfter)->timestamp) {
            return back()->with('error', "งาน #{$id} กำลังถูก worker ทำอยู่ — ลบไม่ได้");
        }

        $name = json_decode($job->payload, true)['displayName'] ?? '?';
        DB::table('jobs')->where('id', $id)->delete();
        AuditLog::record('queue_job_deleted', null, ['id' => $id, 'job' => $name, 'queue' => $job->queue, 'attempts' => $job->attempts]);

        return back()->with('success', "ลบงาน #{$id} ({$this->short($name)}) ออกจากคิวแล้ว");
    }

    public function retryFailed(string $uuid): RedirectResponse
    {
        $failed = DB::table('failed_jobs')->where('uuid', $uuid)->first();
        if (! $failed) {
            return back()->with('error', 'ไม่พบงานที่ล้มเหลวนี้');
        }

        Artisan::call('queue:retry', ['id' => [$uuid]]);
        $name = json_decode($failed->payload, true)['displayName'] ?? '?';
        AuditLog::record('queue_failed_job_retried', null, null, ['uuid' => $uuid, 'job' => $name]);

        return back()->with('success', "ส่ง {$this->short($name)} กลับเข้าคิวแล้ว — จะทำเมื่อมี worker");
    }

    public function destroyFailed(string $uuid): RedirectResponse
    {
        $failed = DB::table('failed_jobs')->where('uuid', $uuid)->first();
        if (! $failed) {
            return back()->with('error', 'ไม่พบงานที่ล้มเหลวนี้');
        }

        DB::table('failed_jobs')->where('uuid', $uuid)->delete();
        $name = json_decode($failed->payload, true)['displayName'] ?? '?';
        AuditLog::record('queue_failed_job_deleted', null, ['uuid' => $uuid, 'job' => $name, 'failed_at' => $failed->failed_at]);

        return back()->with('success', "ลบ {$this->short($name)} ออกจากรายการงานที่ล้มเหลวแล้ว");
    }

    private function iso(?string $value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }

    private function short(string $class): string
    {
        return class_basename($class);
    }
}
