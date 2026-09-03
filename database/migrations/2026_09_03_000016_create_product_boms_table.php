<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "BOM" (Bill of Materials) master — ผูกกับสินค้าที่มีอยู่แล้วในระบบ 1 ตัว
 * (`product_id`, unique — 1 สินค้ามี BOM ได้แค่ชุดเดียว) แล้วมีรายการ "วัตถุดิบ"
 * (RM — สินค้าอื่นที่ถูกติ๊กว่า is_raw_material = true ผ่านหน้า Master
 * /catalog/raw-materials) มาประกอบกันในตาราง product_bom_components ด้านล่าง
 *
 * เก็บเป็นตารางแยกจาก ProductAssociation (Related/Up-sell/Cross-sell) ที่มี
 * อยู่แล้วโดยตั้งใจ ไม่ใช้ร่วมกัน — ProductAssociation ถูก hardcode ไว้แค่ 3
 * ประเภทในหลายจุดของโค้ด (ดู ProductController::associationsFor()/
 * syncAssociations()) การยัด BOM เข้าไปเป็นประเภทที่ 4 ต้องแก้โค้ดที่ทำงานอยู่
 * แล้วหลายจุดโดยไม่จำเป็น แถม BOM มีความหมายทางเดียว (ประกอบด้วย ไม่ใช่
 * เกี่ยวข้องกันแบบ Related ที่เป็น bidirectional) ต่างจาก Association ที่เป็น
 * แนวคิด "เกี่ยวข้องกัน" ทั่วไป
 *
 * ตาม requirement ที่ระบุไว้ ยังไม่มี "จำนวนที่ใช้" ต่อรายการ — เป็นแค่ลิสต์ว่า
 * BOM นี้ประกอบด้วยวัตถุดิบตัวไหนบ้าง เผื่ออนาคตอยากเพิ่มจำนวน/หน่วยค่อยเพิ่ม
 * คอลัมน์ทีหลังได้ (ตาราง component แยกจาก parent ไว้แล้วรองรับการขยายง่าย)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_boms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->unique()->constrained('products')->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::create('product_bom_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_bom_id')->constrained('product_boms')->cascadeOnDelete();
            $table->foreignId('component_product_id')->constrained('products')->cascadeOnDelete();
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['product_bom_id', 'component_product_id'], 'uq_bom_component');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_bom_components');
        Schema::dropIfExists('product_boms');
    }
};
