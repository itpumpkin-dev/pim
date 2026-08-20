<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/brands/*` used to share the `attributes` resource's
     * `list_attributes`/`edit_attributes` permissions (Brands is really
     * AttributeOption CRUD under the hood). Now that the routes require
     * their own `brands.list_brands`/`brands.edit_brands` permissions,
     * backfill them onto roles that already held the equivalent Attributes
     * grant so existing roles don't lose access they already had.
     */
    public function up(): void
    {
        $this->copyGrant('attributes', 'list_attributes', 'brands', 'list_brands');
        $this->copyGrant('attributes', 'edit_attributes', 'brands', 'edit_brands');
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('resource', 'brands')->delete();
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
