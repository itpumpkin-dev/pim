<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * The "มาสเตอร์ > มาร์เก็ตเพลส > {แพลตฟอร์ม}" hub + connection-settings
     * pages (routes/catalog.php) used to share `products.list_products` across
     * all four platforms. Each now has its own permission —
     * `marketplace_shopee.list_marketplace_shopee`,
     * `marketplace_lazada.list_marketplace_lazada`,
     * `marketplace_tiktok.list_marketplace_tiktok`,
     * `marketplace_woocommerce.list_marketplace_woocommerce` — so a role can
     * be scoped to just the platforms it actually manages instead of all four
     * at once. Backfill onto every role that already held
     * `products.list_products` so nobody loses a menu entry they could
     * already reach. Run `php artisan permissions:sync` afterwards to
     * register the new resources for the Roles UI / Administrator (they're
     * auto-discovered from the route scan — see PermissionCatalog).
     */
    private const PLATFORMS = ['shopee', 'lazada', 'tiktok', 'woocommerce'];

    public function up(): void
    {
        $roleIds = DB::table('role_permissions')
            ->where('resource', 'products')
            ->where('action', 'list_products')
            ->where('granted', true)
            ->pluck('role_id')
            ->unique();

        foreach ($roleIds as $roleId) {
            foreach (self::PLATFORMS as $platform) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roleId, 'resource' => "marketplace_{$platform}", 'action' => "list_marketplace_{$platform}"],
                    ['granted' => true],
                );
            }
        }

        // The per-user permission list is cached forever, keyed by
        // permissions_version. Bump it for everyone who just gained
        // marketplace_*.* so their next request rebuilds the list (and the
        // sidebar entry keeps showing up) instead of serving the stale
        // cached array.
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
        foreach (self::PLATFORMS as $platform) {
            DB::table('role_permissions')->where('resource', "marketplace_{$platform}")->delete();
        }
    }
};
