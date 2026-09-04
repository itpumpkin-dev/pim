<?php

use App\Services\SessionInvalidator;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Sales Channels panel (products/{product}/channels + ปุ่ม push/deactivate/
     * delete-listing/สถานะทุกแพลตฟอร์ม — ดู routes/catalog.php) เพิ่งแยกออกมา
     * เป็นสิทธิ์ของตัวเอง (`sales_channels`) จาก `products.edit_products`/
     * `products.list_products` เดิม — backfill ให้ทุก role ที่มีสิทธิ์ products
     * อยู่แล้วได้สิทธิ์ sales_channels คู่กันไปด้วยเลย ไม่งั้นทุก role ที่เคยแก้ไข/
     * ดู Sales Channels ได้จะโดนล็อกออกทันทีหลัง deploy โดยไม่มีใครตั้งใจ
     * รัน `php artisan permissions:sync` ต่อหลัง migration นี้เพื่อให้
     * Administrator/หน้า Roles เห็น resource ใหม่ด้วย
     */
    public function up(): void
    {
        $this->copyGrant('products', 'list_products', 'sales_channels', 'view_sales_channels');
        $this->copyGrant('products', 'edit_products', 'sales_channels', 'edit_sales_channels');

        $roleIds = DB::table('role_permissions')->where('resource', 'sales_channels')->pluck('role_id')->unique();

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
        DB::table('role_permissions')->where('resource', 'sales_channels')->delete();
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
