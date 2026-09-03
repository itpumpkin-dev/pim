<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * เพิ่มคำแปลหลายภาษาจริงให้ "เกรดสินค้า" (Product Grades) — เหตุผลเดียวกับ
 * create_product_type_translations_table/create_business_type_translations_table
 * ทุกประการ (ตัวอักษรเกรด A/B/C/Z ไม่ต้องแปลจริงจังอะไรมาก แต่คงโครงสร้าง
 * translations ไว้เหมือน master อื่นๆ ทุกตัว เผื่ออนาคตอยากตั้งชื่อยาวกว่านี้
 * ต่อภาษา เช่น "เกรด A (คุณภาพสูงสุด)")
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_grade_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_grade_id')->constrained('product_grades')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['product_grade_id', 'locale_id'], 'uq_product_grade_translations_grade_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', 'th')->value('id')
            ?? DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if (! $defaultLocaleId) {
            return;
        }

        $now = now();
        DB::table('product_grades')->whereNotNull('name')->where('name', '!=', '')->get(['id', 'name'])
            ->each(function ($row) use ($defaultLocaleId, $now) {
                DB::table('product_grade_translations')->insert([
                    'product_grade_id' => $row->id,
                    'locale_id' => $defaultLocaleId,
                    'label' => $row->name,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_grade_translations');
    }
};
