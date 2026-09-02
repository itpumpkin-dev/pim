<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ผูก attribute `pbaseunit` เข้ากับ master `base_units` ใหม่ — เหมือน
 * 2026_09_02_000005_bind_product_type_to_attribute.php ตัว AttributeOption
 * จริงๆ จะถูก rebuild จาก master ให้ทันทีที่รันคำสั่ง `catalog:sync-master-options`
 * (หรือ MasterAttributeOptionSync::rebuildAttribute() ตรงๆ) — ไม่ทำในนี้เพราะ
 * migration ควรแก้แค่ schema/ค่าคงที่ ไม่ควรพึ่งพา service class ที่อาจเปลี่ยนได้
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('attributes')->where('code', 'pbaseunit')->update(['master_source' => 'base_units']);
    }

    public function down(): void
    {
        DB::table('attributes')->where('code', 'pbaseunit')->update(['master_source' => null]);
    }
};
