<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/product-grades/*` (Product Grades master) is gated by its own
     * `product_grades.*` permissions. `grade` used to be plain AttributeOption
     * CRUD gated by `attributes.*` (same starting point as Base Units/Brands
     * before their own split) — backfill onto every role that already holds
     * the equivalent `attributes` grant. Run `php artisan permissions:sync`
     * afterwards to register the resource for the Roles UI / Administrator.
     */
    public function up(): void
    {
        $this->copyGrant('attributes', 'list_attributes', 'product_grades', 'list_product_grades');
        $this->copyGrant('attributes', 'edit_attributes', 'product_grades', 'edit_product_grades');

        $roleIds = DB::table('role_permissions')->where('resource', 'product_grades')->pluck('role_id')->unique();

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
        DB::table('role_permissions')->where('resource', 'product_grades')->delete();
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
