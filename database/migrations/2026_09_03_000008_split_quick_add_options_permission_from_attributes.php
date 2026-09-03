<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Same move as split_brands_permission_from_attributes /
 * backfill_base_units_permission, but for a single new *action* on the
 * existing `attributes` resource rather than a whole new resource: the
 * quick-add-option dialog on the Edit Product page (see
 * QuickAddOptionDialog) used to hit the same route as the full options CRUD
 * panel, gated by `attributes.edit_attributes` — meaning a user had to be
 * trusted to edit attribute *definitions* everywhere just to add one option
 * from a product form. It now posts to its own route
 * (attributes.options.quickAdd, routes/catalog.php) gated by
 * `attributes.quick_add_options` instead. Backfill that grant onto every
 * role that already holds `attributes.edit_attributes` so nobody loses
 * access they effectively already had, then invalidate the cached
 * permission list for anyone affected. Run `php artisan permissions:sync`
 * afterwards to register the new action for the Administrator role / Roles
 * UI.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->copyGrant('attributes', 'edit_attributes', 'attributes', 'quick_add_options');

        $roleIds = DB::table('role_permissions')
            ->where('resource', 'attributes')
            ->where('action', 'quick_add_options')
            ->pluck('role_id')
            ->unique();

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
        DB::table('role_permissions')
            ->where('resource', 'attributes')
            ->where('action', 'quick_add_options')
            ->delete();
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
