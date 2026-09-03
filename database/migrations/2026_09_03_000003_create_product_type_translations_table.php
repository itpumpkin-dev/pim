<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * เพิ่มคำแปลหลายภาษาจริงให้ "ประเภทสินค้า" (Product Types) — เดิมมีแค่คอลัมน์
 * name เดียว โชว์ชื่อเดียวกันทุกภาษา ตอนนี้เพิ่มตาราง product_type_translations
 * แบบเดียวกับ base_unit_translations/brand_translations/category_translations
 * — หนึ่งแถวต่อหนึ่ง locale ต่อหนึ่ง product type คอลัมน์ `name` เดิมยังอยู่
 * เป็นค่าของ locale เริ่มต้นของแอป (ใช้เป็น fallback ง่ายๆ ที่ที่อื่นยังอ้างอิง
 * คอลัมน์นี้ตรงๆ อยู่ — ไม่ต้องแก้จุดอื่น)
 *
 * seed แถวคำแปลของ locale เริ่มต้น ('th' ตรงๆ — ไม่ใช้ config('app.locale')
 * เพราะอาจไม่ตรงกับภาษาที่ name ดิบถูกกรอกไว้จริง เจอปัญหานี้มาแล้วตอนย้าย
 * base_units) จากคอลัมน์ name เดิมของทุกแถว
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_type_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_type_id')->constrained('product_types')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['product_type_id', 'locale_id'], 'uq_product_type_translations_type_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', 'th')->value('id')
            ?? DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if (! $defaultLocaleId) {
            return;
        }

        $now = now();
        DB::table('product_types')->whereNotNull('name')->where('name', '!=', '')->get(['id', 'name'])
            ->each(function ($row) use ($defaultLocaleId, $now) {
                DB::table('product_type_translations')->insert([
                    'product_type_id' => $row->id,
                    'locale_id' => $defaultLocaleId,
                    'label' => $row->name,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_type_translations');
    }
};
