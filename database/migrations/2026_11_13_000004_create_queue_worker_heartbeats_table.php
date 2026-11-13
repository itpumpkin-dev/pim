<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * หน้า "สถานะคิวงาน" (/system/queue, QueueMonitorController) — แต่ละ queue:work เขียนแถวของตัวเอง
     * ลงตารางนี้เป็นระยะ (QueueWorkerHeartbeat) แถวที่ last_seen_at ยังใหม่ = มี worker ทำงานอยู่
     * เก็บใน DB ไม่ใช่ cache เพราะ CACHE_STORE=redis อยู่ใน WSL ที่ดับเองได้ — ถ้าเก็บใน Redis
     * หน้านี้จะบอก "ไม่มี worker" ผิดๆ ตอน Redis ดับ ทั้งที่ worker (คิว database) ยังทำงานปกติ
     *
     * สิทธิ์ queue_jobs.list_queue_jobs / manage_queue_jobs ให้ role ที่ดู activity_logs ได้อยู่แล้ว
     * (แอดมินระบบ) — insert ทีละแถว ไม่ใช้ permissions:sync (มันลบสิทธิ์รายแอตทริบิวต์ทิ้ง)
     */
    public function up(): void
    {
        Schema::create('queue_worker_heartbeats', function (Blueprint $table) {
            $table->id();
            $table->string('worker_id')->unique(); // host:pid
            $table->string('host');
            $table->unsignedInteger('pid');
            $table->string('connection')->nullable();
            $table->string('queue')->nullable();
            $table->string('current_job')->nullable();
            $table->timestamp('current_job_started_at')->nullable();
            $table->unsignedInteger('jobs_processed')->default(0);
            $table->unsignedInteger('jobs_failed')->default(0);
            $table->timestamp('started_at');
            $table->timestamp('last_seen_at')->index();
        });

        $roleIds = DB::table('role_permissions')
            ->where('granted', true)
            ->where('resource', 'activity_logs')
            ->where('action', 'list_activity_logs')
            ->pluck('role_id')
            ->unique();

        foreach ($roleIds as $roleId) {
            foreach (['list_queue_jobs', 'manage_queue_jobs'] as $action) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'resource' => 'queue_jobs', 'action' => $action],
                    ['granted' => true],
                );
            }
        }

        self::forgetPermissionCaches();
    }

    /**
     * User::getAllPermissions() cache ไว้ตลอด (key ตาม permissions_version) — แถวที่ insert ตรงๆ
     * จะไม่เห็นจนกว่า cache หาย ลบ key ของ version ปัจจุบันทิ้ง (ไม่ bump version เพราะจะ
     * force-logout แอดมินทุกคน — ดู EnsureFreshPermissions) Redis ล่มก็ข้ามไป ไม่ให้ migrate พัง
     */
    public static function forgetPermissionCaches(): void
    {
        try {
            foreach (DB::table('users')->get(['id', 'permissions_version']) as $user) {
                Cache::forget("user:{$user->id}:permissions:v{$user->permissions_version}");
            }
        } catch (\Throwable) {
            // cache ใช้ไม่ได้ตอนนี้ — สิทธิ์ใหม่จะเห็นหลัง cache ถูกล้างรอบหน้า
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('queue_worker_heartbeats');
        DB::table('role_permissions')->where('resource', 'queue_jobs')->delete();
    }
};
