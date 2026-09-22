<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * เดิม family_attributes ใช้ primary key แบบผสม (family_id, attribute_id) —
 * บังคับโดยไม่ตั้งใจว่า 1 attribute อยู่ใน 1 family ได้แค่ "กลุ่มเดียว" เท่านั้น
 * (ไม่มีทางมี 2 แถวของ family+attribute คู่เดียวกันได้เลย ต่อให้อยาก assign
 * เข้าคนละ attribute_group_id ก็ตาม) — user ต้องการให้ 1 attribute อยู่ได้
 * หลาย group ภายใน 1 family เดียวกัน (แค่ "ห้ามซ้ำ" ข้าม family เท่านั้น ซึ่งเป็น
 * เรื่องที่ AttributeFamilyController จัดการเอง ไม่เกี่ยวกับ schema) — เลย
 * เปลี่ยนมาใช้ surrogate `id` เป็น primary key แทน แล้วคุม "ห้าม assign
 * attribute ตัวเดียวกันซ้ำเข้า group เดียวกันของ family เดียวกัน" (ป้องกัน
 * แถวซ้ำเป๊ะๆ โดยไม่ได้ตั้งใจ) ด้วย unique constraint 3 คอลัมน์แทน
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('family_attributes', function (Blueprint $table) {
            $table->dropPrimary(['family_id', 'attribute_id']);
        });

        Schema::table('family_attributes', function (Blueprint $table) {
            $table->id();
        });

        Schema::table('family_attributes', function (Blueprint $table) {
            $table->unique(['family_id', 'attribute_id', 'attribute_group_id'], 'uq_family_attributes_family_attr_group');
        });
    }

    public function down(): void
    {
        Schema::table('family_attributes', function (Blueprint $table) {
            $table->dropUnique('uq_family_attributes_family_attr_group');
            $table->dropColumn('id');
            $table->primary(['family_id', 'attribute_id']);
        });
    }
};
