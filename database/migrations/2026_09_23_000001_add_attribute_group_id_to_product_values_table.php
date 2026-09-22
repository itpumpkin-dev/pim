<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ตอนนี้ 1 attribute อยู่ได้หลาย attribute_group_id พร้อมกัน (ดู migration
 * 2026_09_22_000002_allow_same_family_multi_group_family_attributes) แต่
 * product_values ยังผูกกับ (product_id, attribute_id, channel_id, locale_id)
 * เท่านั้น — ไม่มีมิติ group เลย ทำให้ 2 ตำแหน่งของ attribute เดียวกัน (เช่น
 * "สเปค" กับ "ภายในสเปค") อ่าน/เขียนแถวเดียวกันเป๊ะๆ พิมพ์ใส่ช่องนึงแล้วอีกช่อง
 * เปลี่ยนตามไปด้วย — ผู้ใช้ยืนยันต้องการให้แต่ละตำแหน่งเก็บค่าของตัวเองแยกกันจริงๆ
 *
 * เพิ่มคอลัมน์นี้แบบ additive ล้วนๆ (nullable, ไม่มี unique constraint ใหม่ —
 * ตาราง product_values ไม่เคยมี DB-level unique constraint เลยตั้งแต่แรก
 * ความ unique ปัจจุบันคุมด้วยโค้ดฝั่ง PHP ผ่าน updateOrCreate() เท่านั้น คง
 * รูปแบบเดิมไว้ ไม่ยกระดับตรงนี้เพิ่ม) — migration นี้เองไม่เปลี่ยนพฤติกรรมแอปเลย
 * ทุกแถวเดิมจะเป็น NULL หมด (แปลว่า "ไม่มี group" — attribute ที่ไม่เคยอยู่ใน
 * family_attributes เลย เช่น pcatname/psubcatname/productgroupname หรือ
 * attribute ควบคุม variant อย่าง producttype/price/qty) จนกว่า backfill
 * command แยกต่างหาก (php artisan pim:backfill-product-value-groups) จะรัน
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_values', function (Blueprint $table) {
            $table->foreignId('attribute_group_id')->nullable()->after('attribute_id')
                ->constrained('attribute_groups')->nullOnDelete();
            $table->index('attribute_group_id', 'idx_product_values_attribute_group_id');
        });
    }

    public function down(): void
    {
        Schema::table('product_values', function (Blueprint $table) {
            $table->dropConstrainedForeignId('attribute_group_id');
        });
    }
};
