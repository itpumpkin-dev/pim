<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "ประเภทสินค้า" (Product Type) master — เหมือน business_types/vendors ทุก
 * ประการ (id, code, name, description, is_active) แค่ผูกกับ attribute
 * `producttype` แทน (ดู 2026_09_02_000005_bind_product_type_to_attribute.php)
 *
 * `code` ตั้งให้ตรงกับ AttributeOption.code เดิมของ `producttype` เป๊ะๆ (ไม่ใช่
 * auto-generate แบบ biztype_N เหมือน business_types ตอนสร้างใหม่) เพราะ
 * attribute ตัวนี้มีอยู่แล้วและมี ProductValue ของสินค้าจริงอ้างอิง code พวกนี้
 * อยู่แล้ว (เช่น 'chemical' — เจอ 2 สินค้าที่ใช้ค่านี้อยู่ตอนเขียน migration นี้)
 * ถ้าตั้ง code ใหม่ไม่ตรงกับของเดิม พอ sync ใหม่จาก master นี้ (ดู
 * MasterAttributeOptionSync) จะกลายเป็นสร้าง option ใหม่แยกออกไป ทิ้ง option
 * เดิมที่สินค้าเหล่านั้นอ้างอิงอยู่ค้างไว้ ทำให้ค่าที่เคยเลือกไว้หายไปจากมุมมอง UI
 *
 * มี 7 แถว ไม่ใช่ 6 ตามที่ user ระบุมา — "Chemical Product" (code: chemical)
 * เป็น option เดิมที่มีอยู่แล้วและมีสินค้าจริงใช้งานอยู่ เก็บไว้ด้วยเพื่อไม่ให้ข้อมูล
 * สินค้าที่มีอยู่แล้วเสียหาย (ดูเหตุผลเดียวกับที่ currency 'rmb' ถูกเก็บไว้ตอนผูก
 * currencies master)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('name')->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $rows = [
            ['customer_brand', 'Customer Brand'],
            ['hand_tools', 'Hand Tools'],
            ['motor_power_transmission', 'Motor & Power Tramission'],
            ['other', 'Other'],
            ['power_tools', 'Power Tools'],
            ['power_tools_accessories', 'Power Tools Accessories'],
            ['chemical', 'Chemical Product'],
        ];

        $now = now();
        DB::table('product_types')->insert(array_map(fn ($row) => [
            'code' => $row[0],
            'name' => $row[1],
            'description' => null,
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], $rows));
    }

    public function down(): void
    {
        Schema::dropIfExists('product_types');
    }
};
