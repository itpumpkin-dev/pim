<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "วัตถุดิบ" (Raw Material / RM) — flag บนสินค้าที่มีอยู่แล้ว ไม่ใช่ตารางแยก
 * ต่างหาก เพราะ RM ก็คือสินค้าปกติตัวหนึ่งในระบบเป๊ะๆ (มี SKU, ชื่อ, attribute
 * ของตัวเอง) แค่ต้อง "คัดออกมา" ว่าตัวไหนใช้เป็นวัตถุดิบสำหรับ BOM ได้บ้าง —
 * เช็คแล้วก่อนเขียน migration นี้ว่าตอนนี้ยังไม่มีการจัดหมวดหมู่ "RM" ที่ใช้งาน
 * จริงอยู่เลยสักจุด (ทั้ง ProductType/Category "วัตถุดิบ"/pbrand
 * "brand_raw_material" ล้วนมี 0 สินค้าผูกอยู่) เลย default เป็น false ให้ทุก
 * สินค้าเดิมทั้งหมด ไม่กระทบข้อมูลเดิม
 *
 * ดูแลผ่านหน้า Master ใหม่ /catalog/raw-materials (RawMaterialController) —
 * ติ๊ก/เลือกจากสินค้าที่มีอยู่แล้วในระบบ ไม่ได้สร้างสินค้าใหม่ จากนั้นตัวเลือก
 * ส่วนประกอบ (RM) ของ BOM (product_bom_components — ดู migration ถัดไป) จะ
 * จำกัดแค่สินค้าที่ is_raw_material = true เท่านั้น
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->boolean('is_raw_material')->default(false)->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('is_raw_material');
        });
    }
};
