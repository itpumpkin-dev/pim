<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/base-units/*` is a new admin surface (Base Units master) over
     * the `AttributeOption` rows of the `pbaseunit` attribute — it's really
     * AttributeOption CRUD under the hood, like Brands. It's gated by its own
     * `base_units.list_base_units` / `base_units.edit_base_units` permissions,
     * so backfill those onto every role that already holds the equivalent
     * `attributes` grant (same move as
     * split_brands_permission_from_attributes) so attribute managers keep
     * working without a manual role edit. Run `php artisan permissions:sync`
     * afterwards to register the resource for the Roles UI / Administrator.
     */
    public function up(): void
    {
        $this->copyGrant('attributes', 'list_attributes', 'base_units', 'list_base_units');
        $this->copyGrant('attributes', 'edit_attributes', 'base_units', 'edit_base_units');

        // The per-user permission list is cached forever, keyed by
        // permissions_version. Bump it for everyone who just gained
        // base_units.* so their next request rebuilds the list (and the
        // sidebar entry shows up) instead of serving the stale cached array.
        $roleIds = DB::table('role_permissions')->where('resource', 'base_units')->pluck('role_id')->unique();

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
        DB::table('role_permissions')->where('resource', 'base_units')->delete();
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
