<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "อัตราแลกเปลี่ยน" — เก็บเป็นอัตราเทียบกับสกุลเงินหลักของระบบ (THB) เช่น
 * USD = 36.5000 หมายถึง 1 USD แลกได้ 36.50 บาท ยังไม่มีจุดไหนในระบบอ่านค่านี้
 * ไปคำนวณจริงจัง (เพิ่งเพิ่ม field ตามที่ user ขอ) — เป็นแค่ข้อมูลอ้างอิงที่กรอก/
 * แก้ไขได้จากหน้า Master > สกุลเงิน เท่านั้นตอนนี้ default ไว้ที่ 1.0000
 * (identity — เช่น THB เทียบกับตัวเองย่อมเท่ากับ 1 เสมอ) ให้สกุลเงินเดิมทั้งหมด
 * ไม่มีค่าติดลบ/ว่างเปล่าหลัง migrate ผู้ดูแลระบบค่อยไปกรอกอัตราจริงของแต่ละ
 * สกุลเงินทีหลังเอง — ไม่ใส่อัตราจริงให้ตรงนี้เพราะเป็นตัวเลขที่เปลี่ยนทุกวัน
 * ใส่ไว้ตอนเขียน migration ก็เก่าทันทีที่ deploy จริง
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('currencies', function (Blueprint $table) {
            $table->decimal('exchange_rate', 12, 4)->default(1)->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('currencies', function (Blueprint $table) {
            $table->dropColumn('exchange_rate');
        });
    }
};
