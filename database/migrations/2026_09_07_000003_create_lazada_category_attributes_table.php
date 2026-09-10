<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * เหมือนกรณี `2026_09_07_000001_add_options_to_lazada_attributes_table` และเพื่อน
 * (ดูคอมเมนต์ของ `2026_09_08_000003_backfill_missing_category_and_mandatory_columns_on_lazada_attributes`
 * กับ `App\Models\LazadaAttribute`'s docblock) — migration นี้ถูกบันทึกไว้แล้วว่า
 * รันไปแล้ว (batch 126, ชื่อ `2026_09_07_000003_create_lazada_category_attributes_table`
 * ใน `migrations` table) แต่ไฟล์ต้นฉบับไม่เคยถูก commit เข้า git เลย — เขียนไฟล์นี้
 * ขึ้นใหม่ให้ตรงกับ schema จริงที่ยืนยันแล้วจาก `information_schema` ของ environment
 * นี้ (ชื่อไฟล์ต้องตรงเป๊ะกับที่บันทึกไว้ ไม่งั้น Laravel จะไม่รู้ว่า "รันไปแล้ว" แล้วพยายาม
 * รันซ้ำ) — guard ด้วย hasTable() ไว้เผื่อ environment นี้เอง (ที่มีตารางอยู่แล้วจริง)
 * จะได้ไม่ error ซ้ำ ส่วน environment ใหม่ที่ยังไม่เคยมีตารางนี้ (เช่น deploy จาก git
 * สดๆ) จะได้สร้างขึ้นจริงแทนที่จะขาดหายไปเงียบๆ เหมือนที่เคยเกิดกับ options/label_th
 *
 * ตารางนี้คือทางแก้ถาวรของบั๊กที่ `lazada_attributes.category_id`/`mandatory`
 * เจอ: field ชื่อเดียวกัน (เช่น "brand") ที่ปรากฏในหลายหมวดหมู่ Lazada เก็บ
 * `category_id`/`mandatory` แค่แถวเดียวร่วมกัน sync หมวดหมู่ไหนล่าสุดก็ทับของเดิม
 * หมด — ตารางนี้แยกเก็บเป็นคู่ (category_id, lazada_attribute_name) แทน ไม่มีวัน
 * ทับกันข้ามหมวดหมู่อีก ส่วน lazada_attributes เดิมยังทำหน้าที่เก็บ label/
 * input_type/attribute_type/options ต่อไป (ข้อมูลที่ Lazada ไม่ได้ผูกไว้กับ
 * หมวดหมู่ใดหมวดหมู่หนึ่งเป็นพิเศษ เสถียรพอที่จะ key ด้วยชื่อ field เฉยๆ ได้จริง)
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lazada_category_attributes')) {
            return;
        }

        Schema::create('lazada_category_attributes', function (Blueprint $table) {
            $table->unsignedBigInteger('category_id');
            $table->string('lazada_attribute_name');
            $table->boolean('mandatory')->default(false);
            $table->timestamps();

            $table->primary(['category_id', 'lazada_attribute_name']);
            $table->foreign('category_id')->references('id')->on('lazada_categories')->cascadeOnDelete();
            $table->foreign('lazada_attribute_name')->references('name')->on('lazada_attributes')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lazada_category_attributes');
    }
};
