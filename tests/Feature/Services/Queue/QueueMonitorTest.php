<?php

use App\Http\Controllers\System\QueueMonitorController;
use App\Services\Queue\QueueWorkerHeartbeat;
use Illuminate\Support\Facades\DB;

/**
 * หน้า "สถานะคิวงาน" (QueueMonitorController) + การนับ worker ที่ยังทำงานอยู่ (QueueWorkerHeartbeat)
 */
function qmInsertJob(array $overrides = []): int
{
    return DB::table('jobs')->insertGetId(array_merge([
        'queue' => 'default',
        'payload' => json_encode(['displayName' => 'App\\Jobs\\ProcessImportJob']),
        'attempts' => 0,
        'reserved_at' => null,
        'available_at' => now()->timestamp,
        'created_at' => now()->timestamp,
    ], $overrides));
}

function qmInsertHeartbeat(string $workerId, \DateTimeInterface $lastSeen): void
{
    DB::table('queue_worker_heartbeats')->insert([
        'worker_id' => $workerId, 'host' => 'test', 'pid' => 1, 'started_at' => $lastSeen, 'last_seen_at' => $lastSeen,
    ]);
}

test('aliveWorkerCount() only counts workers that reported recently', function () {
    expect(QueueWorkerHeartbeat::aliveWorkerCount())->toBe(0);

    qmInsertHeartbeat('test:1', now()->subSeconds(10));
    qmInsertHeartbeat('test:2', now()->subSeconds(QueueWorkerHeartbeat::ALIVE_WITHIN_SECONDS + 60));

    expect(QueueWorkerHeartbeat::aliveWorkerCount())->toBe(1);
});

test('destroyJob() deletes a waiting job', function () {
    $id = qmInsertJob();

    app(QueueMonitorController::class)->destroyJob($id);

    expect(DB::table('jobs')->where('id', $id)->exists())->toBeFalse();
});

test('destroyJob() refuses a job a worker is running right now', function () {
    $id = qmInsertJob(['reserved_at' => now()->subSeconds(5)->timestamp, 'attempts' => 1]);

    app(QueueMonitorController::class)->destroyJob($id);

    expect(DB::table('jobs')->where('id', $id)->exists())->toBeTrue();
});

test('destroyJob() deletes a stuck job whose worker died (reserved longer than retry_after)', function () {
    $retryAfter = (int) config('queue.connections.database.retry_after', 90);
    $id = qmInsertJob(['reserved_at' => now()->subSeconds($retryAfter + 30)->timestamp, 'attempts' => 1]);

    app(QueueMonitorController::class)->destroyJob($id);

    expect(DB::table('jobs')->where('id', $id)->exists())->toBeFalse();
});
