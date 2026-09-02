<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ผูก "ตระกูลแอตทริบิวต์" (attribute_families) เข้ากับ "กลุ่มสินค้า" ตามที่ user
 * ขอ — กลุ่มสินค้าหนึ่งกลุ่มผูกได้หลายตระกูล เลยต้องเป็น pivot จริงๆ ไม่ใช่แค่คอลัมน์
 * เดียวแบบ business_type_id (ดู 2026_09_02_000002_add_business_type_id_to_categories_table.php)
 * — เรียงตาม `sort_order` เหมือน family_attributes: ตัวแรก (sort_order ต่ำสุด)
 * คือตระกูล "เริ่มต้น" ของกลุ่มสินค้านั้น ใช้ตอนสร้างสินค้าใหม่แล้วเลือกกลุ่มสินค้า
 * เพื่อเดา family_id เริ่มต้นให้ (ดู ProductController::create()/store())
 *
 * ไม่มี timestamps — รูปแบบเดียวกับ pivot อื่นๆ ในระบบ (product_category,
 * family_attributes) ที่ล้วนไม่มี timestamps เหมือนกัน
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_attribute_family', function (Blueprint $table) {
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->foreignId('family_id')->constrained('attribute_families')->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);

            $table->primary(['category_id', 'family_id']);
            $table->index('family_id', 'idx_category_attribute_family_family_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_attribute_family');
    }
};
