<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * users.last_login_at / login_count existed from day one but nothing ever
 * wrote them (the edit page showed "never / 0" for everyone). The 'login'
 * audit log (AuditAuthEventSubscriber) has recorded every login all along,
 * so rebuild both columns from it. Absolute values, so re-running is safe.
 *
 * Counts DISTINCT created_at: until bootstrap/app.php turned off listener
 * auto-discovery, the subscriber was registered twice and every login wrote
 * two identical rows (same second).
 */
return new class extends Migration
{
    public function up(): void
    {
        $stats = DB::table('audit_logs')
            ->where('event', 'login')
            ->where('auditable_type', (new User)->getMorphClass())
            ->whereNotNull('auditable_id')
            ->groupBy('auditable_id')
            ->selectRaw('auditable_id, COUNT(DISTINCT created_at) AS logins, MAX(created_at) AS last_login')
            ->get();

        foreach ($stats as $row) {
            DB::table('users')->where('id', $row->auditable_id)->update([
                'login_count' => $row->logins,
                'last_login_at' => $row->last_login,
            ]);
        }
    }

    public function down(): void
    {
        // Nothing to undo — the columns held no real data before this.
    }
};
