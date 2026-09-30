<?php

namespace App\Listeners;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Events\Dispatcher;
use Illuminate\Support\Facades\DB;

class AuditAuthEventSubscriber
{
    public function handleLogin(Login $event): void
    {
        /** @var User $user */
        $user = $event->user;

        AuditLog::record('login', $user, userId: $user->getKey());

        // "เข้าสู่ระบบล่าสุด / จำนวนครั้งที่เข้าสู่ระบบ" บนหน้าแก้ไขผู้ใช้ — ผ่าน query
        // builder ตรงๆ แทน $user->save() โดยตั้งใจ: ไม่ให้ updated_at ("แก้ไขล่าสุด")
        // ขยับทุกครั้งที่ login และไม่ให้ Auditable บันทึก "updated" ซ้ำกับ log
        // 'login' ด้านบนทุกครั้ง (ค่าย้อนหลังเติมจาก log นี้ — ดู migration
        // backfill_user_login_stats)
        $now = now();
        User::query()->toBase()->where('id', $user->getKey())->update([
            'last_login_at' => $now,
            'login_count' => DB::raw('login_count + 1'),
        ]);

        // ให้ model ในหน่วยความจำตรงกับ DB แต่ไม่ dirty — ถ้ามีโค้ดอื่น save()
        // user ตัวนี้ต่อใน request เดียวกัน จะได้ไม่เขียนค่าซ้ำ/ทับ
        $user->forceFill(['last_login_at' => $now, 'login_count' => (int) $user->login_count + 1])
            ->syncOriginalAttributes(['last_login_at', 'login_count']);
    }

    public function handleLogout(Logout $event): void
    {
        if (! $event->user instanceof User) {
            return;
        }

        AuditLog::record('logout', $event->user, userId: $event->user->getKey());
    }

    public function handleFailed(Failed $event): void
    {
        AuditLog::record('login_failed', newValues: [
            'email' => $event->credentials['email'] ?? null,
        ]);
    }

    public function subscribe(Dispatcher $events): array
    {
        return [
            Login::class => 'handleLogin',
            Logout::class => 'handleLogout',
            Failed::class => 'handleFailed',
        ];
    }
}
