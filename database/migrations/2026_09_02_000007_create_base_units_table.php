<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "หน่วยนับพื้นฐาน" (Base Units) เดิมเป็นหน้าจอ CRUD ตรงบนแถว AttributeOption
 * ของ attribute `pbaseunit` (ดู BaseUnitController เวอร์ชันเก่า) — ย้ายมาเป็น
 * master table ของตัวเอง แบบเดียวกับ business_types/vendors/currencies/
 * product_types เพื่อให้เลือกเป็น "แหล่งข้อมูล Master" ของ attribute อื่นได้ด้วย
 * (ผ่าน MasterAttributeOptionSync) — ต่างจาก master ตัวอื่นตรงที่หน่วยนับมี
 * ชื่อที่แปลได้หลายภาษาจริง (เหมือน categories) เลยมีตาราง base_unit_translations
 * แยกต่างหาก ไม่ใช่แค่คอลัมน์ name เดียวแบบ business_types/vendors
 *
 * โยกข้อมูลจาก AttributeOption/AttributeOptionTranslation เดิมของ pbaseunit
 * มาไว้ที่นี่ทั้งหมด (คงรหัส `code` เดิมทุกตัวไว้ — ProductValue.value ของสินค้า
 * ที่มีอยู่แล้วอ้างอิง code นี้ตรงๆ ไม่ใช่ id ของ option ดู
 * ProductPresenter::SELECT_CODES_TO_RESOLVE) แถวใน AttributeOption เดิมเอง
 * จะถูก rebuild ใหม่จากตารางนี้อีกที (โดย MasterAttributeOptionSync) หลังจาก
 * migration ถัดไปผูก master_source ให้ — ไม่ลบ/แก้อะไรที่นี่
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('base_units', function (Blueprint $table) {
            $table->id();
            $table->string('code', 100)->unique();
            $table->string('name');
            $table->string('slug')->nullable();
            $table->text('description')->nullable();
            $table->integer('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('base_unit_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('base_unit_id')->constrained('base_units')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['base_unit_id', 'locale_id'], 'uq_base_unit_translations_unit_locale');
        });

        $attributeId = DB::table('attributes')->where('code', 'pbaseunit')->value('id');
        if (! $attributeId) {
            return;
        }

        // ตั้งใจใช้ 'th' ตรงๆ แทนที่จะพึ่ง config('app.locale') — ค่านั้นมาจาก
        // APP_LOCALE ใน .env ซึ่งตอนเขียน migration นี้ตั้งไว้เป็น 'en' ทั้งที่
        // ข้อมูล admin_label ดิบของ AttributeOption ชุดนี้ (และของ categories.name
        // เดิมที่ category_translations migration ก่อนหน้าเคย seed ไว้ตอน
        // config('app.locale') ยังเป็น 'th' อยู่) เป็นภาษาไทยทั้งหมด ถ้าใช้
        // config('app.locale') ตรงๆ ตรงนี้จะกลาย tag ข้อความไทยว่าเป็นคำแปล
        // ภาษาอังกฤษไปเงียบๆ (ผิดแบบที่ตรวจพบและแก้ทีหลังด้วย tinker ไปแล้วรอบนึง)
        $defaultLocaleId = DB::table('locales')->where('code', 'th')->value('id')
            ?? DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');
        $now = now();

        DB::table('attribute_options')
            ->where('attribute_id', $attributeId)
            ->orderBy('sort_order')
            ->get()
            ->each(function ($option) use ($now, $defaultLocaleId) {
                $baseUnitId = DB::table('base_units')->insertGetId([
                    'code' => $option->code,
                    'name' => $option->admin_label !== null && trim((string) $option->admin_label) !== '' ? $option->admin_label : $option->code,
                    'slug' => $option->slug,
                    'description' => $option->description,
                    'sort_order' => $option->sort_order ?? 0,
                    'is_active' => (bool) $option->is_active,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                // แถวแปลของ locale เริ่มต้นของแอป ให้ตรงกับ admin_label เดิม —
                // locale อื่นไม่มีข้อมูลให้ย้าย (ไม่เคยมี AttributeOptionTranslation
                // ของ pbaseunit มาก่อนเลยสักแถว ตรวจสอบแล้วก่อนเขียน migration นี้)
                if ($defaultLocaleId && trim((string) $option->admin_label) !== '') {
                    DB::table('base_unit_translations')->insert([
                        'base_unit_id' => $baseUnitId,
                        'locale_id' => $defaultLocaleId,
                        'label' => $option->admin_label,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('base_unit_translations');
        Schema::dropIfExists('base_units');
    }
};
