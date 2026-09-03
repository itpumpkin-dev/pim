<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ผูก attribute `pbrand` เข้ากับ master `brands` ใหม่ — เหมือน
 * 2026_09_02_000008_bind_base_unit_to_attribute.php ตัว AttributeOption
 * จริงๆ จะถูก rebuild จาก master ให้ทันทีที่รันคำสั่ง `catalog:sync-master-options`
 * (หรือ MasterAttributeOptionSync::rebuildAttribute() ตรงๆ) — ไม่ทำในนี้เพราะ
 * migration ควรแก้แค่ schema/ค่าคงที่ ไม่ควรพึ่งพา service class ที่อาจเปลี่ยนได้
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('attributes')->where('code', 'pbrand')->update(['master_source' => 'brands']);
    }

    public function down(): void
    {
        DB::table('attributes')->where('code', 'pbrand')->update(['master_source' => null]);
    }
};
