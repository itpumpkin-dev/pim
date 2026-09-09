<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror ของ lazada_attribute_option_mappings เป๊ะ — ดูตารางนั้นๆ docblock
 * สำหรับเหตุผลเต็มๆ ว่าทำไมต้อง junction table แยก ไม่ใช่คอลัมน์เดียว (เหมือน
 * pbrand's lazada_brand_id) ต่างกันแค่ชื่อคอลัมน์ (shopee_ แทน lazada_) และ
 * `shopee_option_label` มาพร้อมกันตั้งแต่ต้น (ไม่ต้องมี migration แยกทีหลัง
 * เหมือน Lazada เพราะรู้ล่วงหน้าแล้วว่าจำเป็นจากบทเรียนของ Lazada)
 *
 * v1: ตารางนี้แค่เก็บการแมประดับตัวเลือกไว้ ยังไม่ถูกอ่านตอน push จริง (ดู
 * ShopeeProductSyncService::resolveAttributes()'s docblock — ยังไม่มี branch
 * สำหรับ select-type จนกว่าจะยืนยัน attribute_value_list's shape จริงจาก
 * sandbox ก่อน)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shopee_attribute_option_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shopee_attribute_mapping_id')->constrained('shopee_attribute_mappings')->cascadeOnDelete();
            $table->foreignId('attribute_option_id')->constrained('attribute_options')->cascadeOnDelete();
            $table->string('shopee_option_value');
            $table->string('shopee_option_label')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['shopee_attribute_mapping_id', 'attribute_option_id'], 'uq_shopee_option_mapping_target_option');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shopee_attribute_option_mappings');
    }
};
