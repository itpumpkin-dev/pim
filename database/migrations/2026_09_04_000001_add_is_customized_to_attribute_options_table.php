<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ให้ attribute ที่ผูก master_source ไว้ "custom" ตัวเลือกแต่ละอันได้อิสระ
 * แทนที่จะถูก master sync ทับค่าทุกครั้ง — เดิมตัวเลือกของ attribute ที่ผูก
 * master ไว้ (เช่น pbrand ผูกกับ Brands) จะถูกดึงมาจาก master แบบ mirror
 * 100% ห้ามแก้ไขตรงๆ เลย (แผง Options ทั้งแผงถูกซ่อนไปเลยถ้า master_source
 * ถูกตั้งไว้ — ดู attributes/edit.tsx เดิม) ผู้ใช้อยากให้ยังคง "ใช้ master เป็น
 * แหล่งข้อมูลตั้งต้น" (option ใหม่จาก master ยังไหลเข้ามาอัตโนมัติเหมือนเดิม)
 * แต่แก้ไข label/สถานะเปิดปิดของตัวเลือกที่มีอยู่แล้วได้อิสระต่อ attribute
 * — เมื่อแก้แล้ว (`is_customized = true`) MasterAttributeOptionSync::
 * upsertOption() จะไม่ทับค่านั้นอีกจนกว่าจะกด "Reset to master" (ดู
 * AttributeOptionController::resetToMaster())
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->boolean('is_customized')->default(false)->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropColumn('is_customized');
        });
    }
};
