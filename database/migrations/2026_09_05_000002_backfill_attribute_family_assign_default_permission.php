<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * "Set as default for every product group" button (Attribute Family edit
     * page — routes/catalog.php's attributeFamilies.setDefaultForAllGroups)
     * เพิ่งแยกออกมาเป็นสิทธิ์ของตัวเอง (`attribute_families.assign_default_family`)
     * จาก `attribute_families.edit_attribute_families` เดิม เพราะเป็น action ที่
     * ทับ default attribute family ของ "ทุก" product group ในระบบพร้อมกันทีเดียว
     * (mass-overwrite) ต่างจากการแก้ไข attribute family ทีละตัวตามปกติ —
     * backfill ให้ทุก role ที่มีสิทธิ์ edit_attribute_families อยู่แล้วได้สิทธิ์
     * assign_default_family คู่กันไปด้วยเลย เหมือนที่
     * 2026_09_04_000002_backfill_sales_channels_permissions.php และ
     * 2026_09_05_000001_backfill_master_categories_permissions.php ทำไว้ก่อน
     * หน้านี้ ไม่งั้นทุก role ที่เคยกดปุ่มนี้ได้จะโดนล็อกออกทันทีหลัง deploy โดย
     * ไม่มีใครตั้งใจ รัน `php artisan permissions:sync` ต่อหลัง migration นี้
     * เพื่อให้ Administrator/หน้า Roles เห็น resource action ใหม่ด้วย
     */
    public function up(): void
    {
        $this->copyGrant('attribute_families', 'edit_attribute_families', 'attribute_families', 'assign_default_family');

        $roleIds = DB::table('role_permissions')
            ->where('resource', 'attribute_families')
            ->where('action', 'assign_default_family')
            ->pluck('role_id')->unique();

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
            ->where('resource', 'attribute_families')
            ->where('action', 'assign_default_family')
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
