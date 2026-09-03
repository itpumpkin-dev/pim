<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `name_en` ถูกยุบเข้า vendor_translations แล้ว (ดู migration ก่อนหน้า
 * create_vendor_translations_table) — ลบคอลัมน์เดิมทิ้งเพื่อไม่ให้เหลือ "ชื่อ
 * อังกฤษ" สองที่ซ้อนกัน (คอลัมน์นี้ vs translations ของ locale อังกฤษ) ที่อาจ
 * ไม่ตรงกันในอนาคตถ้ามีคนแก้ที่เดียวแต่ลืมอีกที่ VendorController/
 * vendors/{create,edit}.tsx ถูกแก้ให้ไม่อ้างอิงคอลัมน์นี้แล้วก่อน migration
 * นี้จะรันด้วย
 *
 * down() คืนคอลัมน์กลับมาแบบว่างเปล่า (ไม่ได้ backfill ค่าจาก translations คืน
 * ให้ — ถ้าต้อง rollback จริงๆ ต้องรัน migration create_vendor_translations_table
 * ของ down() ก่อน ซึ่งจะยังไม่ลบตาราง translations ทิ้งจนกว่า migration นั้นเอง
 * จะ rollback ด้วย ดังนั้นข้อมูลจริงยังอยู่ครบใน vendor_translations เสมอ)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vendors', function (Blueprint $table) {
            $table->dropColumn('name_en');
        });
    }

    public function down(): void
    {
        Schema::table('vendors', function (Blueprint $table) {
            $table->string('name_en')->nullable();
        });

        $enLocaleId = DB::table('locales')->where('code', 'en')->value('id');
        if (! $enLocaleId) {
            return;
        }

        DB::table('vendor_translations')->where('locale_id', $enLocaleId)->get(['vendor_id', 'label'])
            ->each(function ($row) {
                DB::table('vendors')->where('id', $row->vendor_id)->update(['name_en' => $row->label]);
            });
    }
};
