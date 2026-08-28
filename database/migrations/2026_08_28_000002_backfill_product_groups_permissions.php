<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/product-groups/*` is a new admin surface over the leaf level
     * of the category tree, gated by its own `product_groups.*` permissions.
     * Backfill those grants onto every role that already holds the equivalent
     * `categories.*` grant, so category managers keep working without a
     * manual role edit. Run `php artisan permissions:sync` afterwards to
     * register the resource for the Roles UI / Administrator.
     */
    public function up(): void
    {
        foreach (['list', 'create', 'edit', 'delete'] as $action) {
            $this->copyGrant('categories', "{$action}_categories", 'product_groups', "{$action}_product_groups");
        }
        $this->copyGrant('categories', 'view_history', 'product_groups', 'view_history');

        // The per-user permission list is cached forever, keyed by
        // permissions_version. Bump it for everyone who just gained
        // product_groups.* so their next request rebuilds the list (and the
        // sidebar entry shows up) instead of serving the stale cached array.
        $roleIds = DB::table('role_permissions')->where('resource', 'product_groups')->pluck('role_id')->unique();

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
        DB::table('role_permissions')->where('resource', 'product_groups')->delete();
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
