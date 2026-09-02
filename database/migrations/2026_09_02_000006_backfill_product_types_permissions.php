<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/product-types/*` (Product Types master) is gated by its own
     * `product_types.*` permissions. Backfill onto every role that already
     * holds the equivalent `categories.*` grant — same move as
     * backfill_business_types_permissions. Run `php artisan permissions:sync`
     * afterwards to register the resource for the Roles UI / Administrator.
     */
    public function up(): void
    {
        $this->copyGrant('categories', 'list_categories', 'product_types', 'list_product_types');
        $this->copyGrant('categories', 'edit_categories', 'product_types', 'edit_product_types');

        $roleIds = DB::table('role_permissions')->where('resource', 'product_types')->pluck('role_id')->unique();

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
        DB::table('role_permissions')->where('resource', 'product_types')->delete();
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
