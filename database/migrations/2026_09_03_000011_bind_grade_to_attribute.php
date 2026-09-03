<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ผูก attribute `grade` (ที่มีอยู่แล้ว) เข้ากับ master `product_grades` ใหม่ —
 * เหมือน 2026_09_02_000005_bind_product_type_to_attribute.php ทุกประการ ตัว
 * AttributeOption จริงๆ จะถูก rebuild จาก master ให้ตอนรัน
 * `catalog:sync-master-options` (หรือ MasterAttributeOptionSync::
 * rebuildAttribute() ตรงๆ) — ไม่ทำในนี้เพราะ migration ควรแก้แค่
 * schema/ค่าคงที่ ไม่ควรพึ่งพา service class ที่อาจเปลี่ยนได้ (ต้องรันหลัง
 * migrate_grade_standard_values.php เพื่อให้ตัวเลือก "standard" เดิมถูกแทนที่
 * ด้วย Z ในตัวเลือกที่ rebuild ออกมา ไม่ใช่หายไปเฉยๆ)
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('attributes')->where('code', 'grade')->update(['master_source' => 'product_grades']);
    }

    public function down(): void
    {
        DB::table('attributes')->where('code', 'grade')->update(['master_source' => null]);
    }
};
