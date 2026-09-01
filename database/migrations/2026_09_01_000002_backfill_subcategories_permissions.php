<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/subcategories/*` is a new admin surface over the middle
     * (depth-2) level of the shared category tree, gated by its own
     * `subcategories.*` permissions. Backfill those grants onto every role
     * that already holds the equivalent `categories.*` grant — same move as
     * backfill_product_groups_permissions — so category managers keep working
     * without a manual role edit. Run `php artisan permissions:sync`
     * afterwards to register the resource for the Roles UI / Administrator.
     */
    public function up(): void
    {
        foreach (['list', 'create', 'edit', 'delete'] as $action) {
            $this->copyGrant('categories', "{$action}_categories", 'subcategories', "{$action}_subcategories");
        }
        $this->copyGrant('categories', 'view_history', 'subcategories', 'view_history');

        // The per-user permission list is cached forever, keyed by
        // permissions_version. Bump it for everyone who just gained
        // subcategories.* so their next request rebuilds the list (and the
        // sidebar entry shows up) instead of serving the stale cached array.
        $roleIds = DB::table('role_permissions')->where('resource', 'subcategories')->pluck('role_id')->unique();

        $userIds = DB::table('user_role')->whereIn('role_id', $roleIds)->pluck('user_id')
            ->merge(
                DB::table('role_user_group')
                    ->join('user_group_user', 'role_user_group.group_id', '=', 'user_group_user.group_id')
                    ->whereIn('role_user_group.role_id', $roleIds)
                    ->pluck('user_group_user.user_id')
            )
            ->unique()
            ->values();

        SessionInvalidator::users($userIds);
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('resource', 'subcategories')->delete();
    }

    private function copyGrant(string $fromResource, string $fromAction, string $toResource, string $toAction): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('resource', $fromResource)
            ->where('action', $fromAction)
            ->where('granted', true)
            ->pluck('role_id')
            ->unique();

        foreach ($roleIds as $roleId) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $roleId, 'resource' => $toResource, 'action' => $toAction],
                ['granted' => true],
            );
        }
    }
};
