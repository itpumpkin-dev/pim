<?php

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Auth\Events\Login;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * "เข้าสู่ระบบล่าสุด / จำนวนครั้งที่เข้าสู่ระบบ" on the user edit page read
 * users.last_login_at / login_count, which nothing ever wrote. The Login
 * listener (AuditAuthEventSubscriber::handleLogin) now keeps them current.
 */
afterEach(fn () => Carbon::setTestNow());

test('each login stamps last_login_at and bumps login_count', function () {
    $user = User::factory()->create();

    Carbon::setTestNow('2026-09-30 10:00:00');
    event(new Login('web', $user, false));
    Carbon::setTestNow('2026-09-30 11:30:00');
    event(new Login('web', $user->fresh(), false));

    $fresh = $user->fresh();
    expect($fresh->login_count)->toBe(2);
    expect($fresh->last_login_at->toDateTimeString())->toBe('2026-09-30 11:30:00');
});

test('a login does not move updated_at or write an extra "updated" audit log', function () {
    Carbon::setTestNow('2026-09-01 08:00:00');
    $user = User::factory()->create();
    $updatedAt = $user->fresh()->updated_at->toDateTimeString();

    Carbon::setTestNow('2026-09-30 10:00:00');
    event(new Login('web', $user, false));

    expect($user->fresh()->updated_at->toDateTimeString())->toBe($updatedAt);
    expect(AuditLog::where('auditable_id', $user->id)->where('event', 'updated')->exists())->toBeFalse();
    expect(AuditLog::where('auditable_id', $user->id)->where('event', 'login')->count())->toBe(1);

    // In-memory model mirrors the DB without being dirty.
    expect($user->login_count)->toBe(1);
    expect($user->isDirty())->toBeFalse();
});

test('the backfill migration rebuilds login stats from the login audit log', function () {
    $user = User::factory()->create();
    // The 2nd row duplicates the 1st (same second) — the old double-registered
    // listener wrote every login twice; it must count once.
    foreach (['2026-08-01 09:00:00', '2026-08-01 09:00:00', '2026-08-15 14:00:00', '2026-09-02 07:45:00'] as $at) {
        DB::table('audit_logs')->insert(['event' => 'login', 'auditable_type' => $user->getMorphClass(), 'auditable_id' => $user->id, 'user_id' => $user->id, 'created_at' => $at]);
    }

    (require database_path('migrations/2026_09_30_000001_backfill_user_login_stats.php'))->up();

    $fresh = $user->fresh();
    expect($fresh->login_count)->toBe(3);
    expect($fresh->last_login_at->toDateTimeString())->toBe('2026-09-02 07:45:00');
});
