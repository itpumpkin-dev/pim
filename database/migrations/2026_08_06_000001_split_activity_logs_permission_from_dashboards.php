<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/system/activity-logs` used to share the `dashboards.list_dashboards`
     * permission with the main dashboard route, so any role that could open
     * the dashboard could also browse the full system-wide audit log. Now
     * that the route requires its own `activity_logs.list_activity_logs`
     * permission, backfill it onto roles that were already trusted with the
     * dashboard's own audit preview (`users.list_users` or `roles.list_roles`)
     * so existing admins/ops roles don't lose access they already had.
     */
    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('granted', true)
            ->where(function ($query) {
                $query->where(fn ($q) => $q->where('resource', 'users')->where('action', 'list_users'))
                    ->orWhere(fn ($q) => $q->where('resource', 'roles')->where('action', 'list_roles'));
            })
            ->pluck('role_id')
            ->unique();

        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'resource' => 'activity_logs', 'action' => 'list_activity_logs'],
                ['granted' => true],
            );
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')
            ->where('resource', 'activity_logs')
            ->where('action', 'list_activity_logs')
            ->delete();
    }
};
