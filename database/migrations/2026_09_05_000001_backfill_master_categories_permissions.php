<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Master Categories panel (products/{product}/master-categories — ปุ่ม
     * บันทึกหมวดหมู่/หมวดหมู่ย่อย/กลุ่มสินค้าในหน้าแก้ไขสินค้า ดู routes/catalog.php)
     * เพิ่งแยกออกมาเป็นสิทธิ์ของตัวเอง (`master_categories`) จาก
     * `products.edit_products` เดิม — backfill ให้ทุก role ที่มีสิทธิ์
     * products.edit_products อยู่แล้วได้สิทธิ์ master_categories.edit_master_categories
     * คู่กันไปด้วยเลย เหมือนที่
     * 2026_09_04_000002_backfill_sales_channels_permissions.php ทำไว้ก่อนหน้านี้
     * ไม่งั้นทุก role ที่เคยแก้ไขหมวดหมู่ของสินค้าได้จะโดนล็อกออกทันทีหลัง deploy
     * โดยไม่มีใครตั้งใจ รัน `php artisan permissions:sync` ต่อหลัง migration นี้
     * เพื่อให้ Administrator/หน้า Roles เห็น resource ใหม่ด้วย
     *
     * ตั้งใจไม่มี view_master_categories คู่กับ edit (ต่างจาก sales_channels ที่มี
     * ทั้งคู่) — sales_channels แยกเพราะมีข้อมูล/การกระทำที่อ่อนไหว (push ไป
     * marketplace จริง) ที่อยากให้ "ดูได้แต่แก้ไม่ได้" เป็นไปได้ ส่วนแผงนี้เป็นแค่
     * ข้อมูลจัดหมวดหมู่พื้นฐาน ไม่มีเหตุผลต้องซ่อนจากการดู แค่กันการ "แก้" เท่านั้น
     * — อีกเหตุผลหนึ่ง (ทางเทคนิค): sales_channels มี endpoint แบบอ่านอย่างเดียว
     * จริงๆ (เช่น *-status routes) ให้ผูก view_sales_channels middleware ได้ ส่วน
     * แผงนี้ไม่มี endpoint แบบอ่านอย่างเดียวเลย ถ้าเพิ่ม view_master_categories
     * เข้าไปโดยไม่มี route ไหนผูกไว้เลย PermissionCatalog::getCatalog() (สแกนจาก
     * middleware ของ route จริงเท่านั้น) จะมองไม่เห็นมันเลย แล้ว `permissions:sync`
     * จะลบสิทธิ์นี้ทิ้งจาก Administrator ทันทีที่รัน (นับเป็น "orphaned")
     */
    public function up(): void
    {
        $this->copyGrant('products', 'edit_products', 'master_categories', 'edit_master_categories');

        $roleIds = DB::table('role_permissions')->where('resource', 'master_categories')->pluck('role_id')->unique();

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
        DB::table('role_permissions')->where('resource', 'master_categories')->delete();
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
