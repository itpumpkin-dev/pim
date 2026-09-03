<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * เพิ่มคำแปลหลายภาษาจริงให้ "เวนเดอร์" (Vendors) — ต่างจาก
 * business_type_translations/currency_translations/product_type_translations
 * ตรงที่ vendors มีคอลัมน์ `name_en` (ชื่ออังกฤษ) แยกต่างหากอยู่แล้วมาก่อน (ไม่ใช่
 * ระบบคำแปลหลาย locale จริง แค่ฟิลด์ "ชื่ออังกฤษ" เดี่ยวๆ) — ยุบเข้าที่นี่แทนที่จะ
 * ปล่อยให้มี "ชื่ออังกฤษ" สองที่ซ้อนกัน: seed ทั้ง locale เริ่มต้นของแอป (จาก
 * `name`) และ locale อังกฤษ (จาก `name_en` เฉพาะแถวที่มีค่า — เช็คแล้วก่อนเขียน
 * migration นี้ว่ามี 247 จาก 349 vendor ที่กรอก name_en ไว้จริง) คอลัมน์ name_en
 * เองจะถูกลบทิ้งใน migration ถัดไป (drop_vendor_name_en_column) หลังจากย้าย
 * ข้อมูลมาที่นี่ครบแล้ว
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vendor_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained('vendors')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['vendor_id', 'locale_id'], 'uq_vendor_translations_vendor_locale');
        });

        $thLocaleId = DB::table('locales')->where('code', 'th')->value('id')
            ?? DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');
        $enLocaleId = DB::table('locales')->where('code', 'en')->value('id');

        if (! $thLocaleId) {
            return;
        }

        $now = now();
        DB::table('vendors')->get(['id', 'name', 'name_en'])->each(function ($row) use ($thLocaleId, $enLocaleId, $now) {
            if (trim((string) $row->name) !== '') {
                DB::table('vendor_translations')->insert([
                    'vendor_id' => $row->id,
                    'locale_id' => $thLocaleId,
                    'label' => $row->name,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }

            if ($enLocaleId && trim((string) $row->name_en) !== '') {
                DB::table('vendor_translations')->insert([
                    'vendor_id' => $row->id,
                    'locale_id' => $enLocaleId,
                    'label' => $row->name_en,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_translations');
    }
};
