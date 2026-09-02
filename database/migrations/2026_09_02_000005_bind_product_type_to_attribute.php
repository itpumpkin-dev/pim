<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ผูก attribute `producttype` เข้ากับ master `product_types` ใหม่ (เหมือน
 * 2026_09_02_000001_add_master_source_to_attributes_table.php ทำให้ attribute
 * อื่นๆ ไปแล้ว — คอลัมน์ master_source มีอยู่แล้ว แค่ต้อง backfill ค่าเพิ่ม)
 * ตัว AttributeOption จริงๆ จะถูก rebuild จาก master ให้ทันทีที่รันคำสั่ง
 * `catalog:sync-master-options` (หรือ MasterAttributeOptionSync::rebuildAttribute()
 * ตรงๆ) — ไม่ทำในนี้เพราะ migration ควรแก้แค่ schema/ค่าคงที่ ไม่ควรพึ่งพา
 * service class ที่อาจเปลี่ยนได้
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('attributes')->where('code', 'producttype')->update(['master_source' => 'product_types']);
    }

    public function down(): void
    {
        DB::table('attributes')->where('code', 'producttype')->update(['master_source' => null]);
    }
};
