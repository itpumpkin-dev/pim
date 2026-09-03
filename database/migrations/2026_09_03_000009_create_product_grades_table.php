<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "เกรดสินค้า" (Product Grade) master — เหมือน business_types/product_types
 * ทุกประการ (id, code, name, description, is_active) บวก `start_date`/
 * `end_date` แบบเดียวกับ commission_groups ("ช่วงเวลา" ที่เกรดนี้มีผลใช้งานได้
 * เผื่อไว้สำหรับอนาคต — ตอนนี้ยังไม่มี logic ไหนอ่าน/บังคับค่านี้จริงจัง เป็นแค่
 * ฟิลด์ที่กรอกเก็บไว้บนตัวนิยามเกรดเอง ไม่ใช่ต่อการ assign เกรดให้สินค้าแต่ละ
 * ตัวแยกกันแบบมีประวัติ — ระบบ ProductValue ปัจจุบันเก็บได้แค่ค่าปัจจุบันค่าเดียว
 * ต่อ attribute ไม่มีแนวคิดช่วงเวลาแบบมีผลย้อนหลัง/ล่วงหน้าต่อสินค้าแต่ละชิ้น)
 *
 * ผูกกับ attribute `grade` ที่มีอยู่แล้วในระบบ (ดู bind_grade_to_attribute
 * migration ถัดไป) แทนที่จะสร้าง attribute ใหม่ — attribute นี้เดิมมีตัวเลือกเดียว
 * คือ "standard" ผูกอยู่กับสินค้า 2 ตัว (ดู migrate_grade_standard_values
 * migration ที่ย้ายสินค้า 2 ตัวนั้นไปเป็นเกรด Z ตามที่ตกลงกันไว้)
 *
 * รหัส A/B/C มาจากชุดข้อมูลเกรดสินค้าจริงที่ได้รับมา (pID -&gt; เกรด) ส่วน Z คือ
 * "ยังไม่ได้จัดเกรด" — ตัวที่แทนที่ตัวเลือก standard เดิม
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_grades', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name')->unique();
            $table->text('description')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();
        });

        $rows = [
            ['A', 'A', null, 0],
            ['B', 'B', null, 1],
            ['C', 'C', null, 2],
            ['Z', 'Z', 'สินค้าที่ยังไม่ได้จัดเกรด (แทนที่ตัวเลือก Standard เดิม)', 3],
        ];

        $now = now();
        DB::table('product_grades')->insert(array_map(fn ($row) => [
            'code' => $row[0],
            'name' => $row[1],
            'description' => $row[2],
            'sort_order' => $row[3],
            'is_active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ], $rows));
    }

    public function down(): void
    {
        Schema::dropIfExists('product_grades');
    }
};
