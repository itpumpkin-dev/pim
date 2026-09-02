<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ผูก "ประเภทธุรกิจ" (business_types) เข้ากับ "กลุ่มสินค้า" ตามที่ user ขอ —
 * กลุ่มสินค้าเป็นแค่แถว `categories` ที่ depth 3 เอง (ดู docblock ของ
 * ProductGroupController) ไม่มีตาราง product_groups แยกต่างหาก เลยต้องเพิ่ม
 * คอลัมน์ที่ตาราง categories ตรงๆ แบบเดียวกับ FK มาร์เก็ตเพลสทั้ง 4 ตัวที่มีอยู่แล้ว
 * (lazada_category_id ฯลฯ) — nullable เพราะเป็นทางเลือก ไม่บังคับทุกกลุ่มสินค้า
 * ต้องมีประเภทธุรกิจ และ nullOnDelete เพื่อไม่ให้ลบ business_type แล้วพากลุ่ม
 * สินค้าที่ผูกอยู่พังไปด้วย (แค่ล้างค่ากลับเป็นไม่มีประเภทธุรกิจแทน)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->foreignId('business_type_id')->nullable()->after('parent_id')->constrained('business_types')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('business_type_id');
        });
    }
};
