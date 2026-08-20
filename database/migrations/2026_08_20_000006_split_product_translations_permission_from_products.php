<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/product-translations` ("Missing Translations") used to
     * share the `products` resource's `list_products`/`edit_products`
     * permissions with the main Products page. Now that the routes require
     * their own `product_translations.list_product_translations`/
     * `edit_product_translations` permissions, backfill them onto roles
     * that already held the equivalent Products grant so existing roles
     * don't lose access they already had.
     */
    public function up(): void
    {
        $this->copyGrant('products', 'list_products', 'product_translations', 'list_product_translations');
        $this->copyGrant('products', 'edit_products', 'product_translations', 'edit_product_translations');
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('resource', 'product_translations')->delete();
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
