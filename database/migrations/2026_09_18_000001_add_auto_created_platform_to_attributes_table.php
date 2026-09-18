<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ระบุว่า attribute ตัวนี้ถูกสร้างขึ้นเองโดยแอดมินในระบบ PIM ตามปกติ
     * (null) หรือถูกสร้างอัตโนมัติตอนกด "สร้าง/อัปเดต Attribute Family" ของ
     * แพลตฟอร์มไหน (shopee/lazada/tiktok) — ดู {Platform}MappedAttributeCreator::
     * findOrCreateAttribute() ซึ่งจะ set คอลัมน์นี้เฉพาะตอน *สร้างใหม่จริงๆ*
     * เท่านั้น (ไม่ใช่ตอน reuse attribute ที่มีโค้ดตรงกันอยู่แล้ว) เพื่อให้หน้า
     * เลือก PIM attribute (PimAttributePicker) โชว์ chip บอกที่มาให้แอดมินเห็น
     * ตอนจะแมป — attribute หนึ่งตัวถูก "สร้าง" ได้แค่ครั้งเดียว (ค่านี้เลยไม่มีวัน
     * เปลี่ยนหลังจากนั้น แม้ภายหลังจะถูก platform อื่น reuse ผ่าน code ตรงกันก็ตาม)
     */
    public function up(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->string('auto_created_platform', 20)->nullable()->after('master_source');
        });
    }

    public function down(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->dropColumn('auto_created_platform');
        });
    }
};
