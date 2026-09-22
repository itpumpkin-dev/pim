<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * ระบุว่า attribute ตัวนี้อนุญาตให้ถูกผูกเข้ากับหลาย Attribute Family
     * พร้อมกันได้หรือไม่ — ตาราง family_attributes เองไม่เคยบังคับ exclusivity
     * มาตั้งแต่ต้น (primary key เป็น (family_id, attribute_id) แบบผสม ไม่ใช่
     * unique บน attribute_id เดี่ยวๆ) แต่ AttributeFamilyController::create()/
     * edit() (หน้า "ตระกูลแอตทริบิวต์") ตอนนี้จะซ่อน attribute ที่ถูกผูกกับ
     * family อื่นไปแล้วออกจากตัวเลือก เว้นแต่ตัวนั้นติ๊ก is_shared ไว้ — ค่า
     * default เป็น false (ไม่ให้ใช้ซ้ำ) สำหรับ attribute เดิมทุกตัวในระบบด้วย
     * เพื่อคงพฤติกรรมเดิมของ picker ไว้ก่อน แอดมินต้องมาติ๊กเปิดเองทีละตัวถ้า
     * ต้องการแชร์ attribute นั้นข้าม family จริงๆ
     */
    public function up(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->boolean('is_shared')->default(false)->after('is_filterable');
        });
    }

    public function down(): void
    {
        Schema::table('attributes', function (Blueprint $table) {
            $table->dropColumn('is_shared');
        });
    }
};
