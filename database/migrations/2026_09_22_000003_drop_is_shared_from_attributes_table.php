<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ย้อนกลับ is_shared (จาก 2026_09_22_000001_add_is_shared_to_attributes_table)
 * — user ชี้แจงว่าที่ต้องการจริงๆ คือ "ใช้ attribute ซ้ำได้ภายใน family เดียวกัน
 * (หลาย group)" ไม่ใช่ "ใช้ข้าม family" เลยยกเลิกการกรอง attribute ข้าม family
 * ทั้งหมดที่ทำไปก่อนหน้านี้ (AttributeFamilyController::create()/edit() กลับไป
 * โชว์ทุก attribute ให้ทุก family เหมือนเดิม) — คอลัมน์นี้เลยไม่มีความหมายอะไร
 * เหลืออยู่แล้ว ทิ้งไปแทนที่จะปล่อยเป็น dead column ที่ไม่มี UI ไหนอ่าน/เขียนอีก
 * ต่อไป (ดู 2026_09_22_000002_allow_same_family_multi_group_family_attributes
 * สำหรับ schema change ที่มาแทนที่ความต้องการจริงๆ)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->dropColumn('is_shared');
        });
    }

    public function down(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->boolean('is_shared')->default(false)->after('is_filterable');
        });
    }
};
