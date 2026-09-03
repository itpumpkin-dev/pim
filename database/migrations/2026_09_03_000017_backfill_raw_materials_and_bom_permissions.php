<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `/catalog/raw-materials/*` และ `/catalog/bom/*` (มาสเตอร์ใหม่ทั้งคู่ —
     * ดู migrations create_product_boms_table/add_is_raw_material_to_products_table)
     * ผูกกับสิทธิ์ของตัวเอง — backfill ให้ทุก role ที่มีสิทธิ์ products อยู่แล้ว
     * (ทั้งสองมาสเตอร์เกี่ยวกับสินค้าโดยตรง ไม่ใช่ resource ที่แยกออกมาจาก
     * attribute options เหมือนมาสเตอร์อื่นๆ ก่อนหน้านี้) รัน
     * `php artisan permissions:sync` ต่อหลัง migration นี้เพื่อให้ Administrator/
     * หน้า Roles เห็น resource ใหม่ด้วย
     */
    public function up(): void
    {
        $this->copyGrant('products', 'list_products', 'raw_materials', 'list_raw_materials');
        $this->copyGrant('products', 'edit_products', 'raw_materials', 'edit_raw_materials');
        $this->copyGrant('products', 'list_products', 'bom', 'list_bom');
        $this->copyGrant('products', 'edit_products', 'bom', 'edit_bom');

        $roleIds = DB::table('role_permissions')->whereIn('resource', ['raw_materials', 'bom'])->pluck('role_id')->unique();

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
        DB::table('role_permissions')->whereIn('resource', ['raw_materials', 'bom'])->delete();
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
