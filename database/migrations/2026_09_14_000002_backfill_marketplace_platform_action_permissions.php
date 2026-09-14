<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Follow-up to backfill_marketplace_platform_permissions (which only
     * split the มาสเตอร์ > มาร์เก็ตเพลส > {แพลตฟอร์ม} hub/connection-settings
     * page into `marketplace_{platform}.list_marketplace_{platform}`). This
     * splits every other platform-specific marketplace action the same way —
     * category mapping, brand mapping, attribute mapping (+ its history tab),
     * and product push/deactivate/delete-listing/status-check — each of
     * which used to share ONE permission across all four platforms
     * (`categories.edit_categories`, `brands.edit_brands`,
     * `attributes.edit_attributes`, `attributes.view_history`,
     * `sales_channels.edit_sales_channels`) even though the routes
     * themselves are now per-platform (see routes/catalog.php). New actions,
     * all under the existing `marketplace_{platform}` resource:
     *   - edit_category_mapping_{platform}
     *   - edit_brand_mapping_{platform}
     *   - edit_attribute_mapping_{platform}
     *   - view_attribute_mapping_history_{platform}
     *   - push_products_{platform}
     *
     * Backfilled onto every role that already held the corresponding shared
     * permission, so nobody loses an action they could already perform.
     * A role that had e.g. `categories.edit_categories` gets
     * `edit_category_mapping_{platform}` for ALL FOUR platforms (the old
     * permission didn't distinguish between them either, so this preserves
     * exactly the same access — narrowing to specific platforms is a manual
     * follow-up per role via the Roles UI, not something this migration can
     * infer). Run `php artisan permissions:sync` afterwards to register the
     * new actions for the Roles UI / Administrator (auto-discovered from the
     * route scan — see PermissionCatalog).
     */
    private const PLATFORMS = ['shopee', 'lazada', 'tiktok', 'woocommerce'];

    /** [fromResource, fromAction, newActionTemplate] — %s is replaced with each platform. */
    private const MAPPINGS = [
        ['categories', 'edit_categories', 'edit_category_mapping_%s'],
        ['brands', 'edit_brands', 'edit_brand_mapping_%s'],
        ['attributes', 'edit_attributes', 'edit_attribute_mapping_%s'],
        ['attributes', 'view_history', 'view_attribute_mapping_history_%s'],
        ['sales_channels', 'edit_sales_channels', 'push_products_%s'],
    ];

    public function up(): void
    {
        $touchedRoleIds = collect();

        foreach (self::MAPPINGS as [$fromResource, $fromAction, $newActionTemplate]) {
            $roleIds = DB::table('role_permissions')
                ->where('resource', $fromResource)
                ->where('action', $fromAction)
                ->where('granted', true)
                ->pluck('role_id')
                ->unique();

            $touchedRoleIds = $touchedRoleIds->merge($roleIds);

            foreach ($roleIds as $roleId) {
                foreach (self::PLATFORMS as $platform) {
                    DB::table('role_permissions')->updateOrInsert(
                        ['role_id' => $roleId, 'resource' => "marketplace_{$platform}", 'action' => sprintf($newActionTemplate, $platform)],
                        ['granted' => true],
                    );
                }
            }
        }

        $roleIds = $touchedRoleIds->unique()->values();

        // The per-user permission list is cached forever, keyed by
        // permissions_version. Bump it for everyone who just gained new
        // marketplace_*.* actions so their next request rebuilds the list
        // instead of serving the stale cached array.
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
        foreach (self::MAPPINGS as [, , $newActionTemplate]) {
            foreach (self::PLATFORMS as $platform) {
                DB::table('role_permissions')
                    ->where('resource', "marketplace_{$platform}")
                    ->where('action', sprintf($newActionTemplate, $platform))
                    ->delete();
            }
        }
    }
};
