<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * เพิ่มคำแปลหลายภาษาจริงให้ "สกุลเงิน" (Currencies) — เหตุผลเดียวกับ
 * 2026_09_03_000003_create_product_type_translations_table.php ทุกประการ
 * (currencies ไม่มี timestamps ของตัวเอง — ดู Currency model — แต่ตาราง
 * คำแปลใหม่นี้มี timestamps ตามปกติ ไม่กระทบกัน)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('currency_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('currency_id')->constrained('currencies')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['currency_id', 'locale_id'], 'uq_currency_translations_currency_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', 'th')->value('id')
            ?? DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if (! $defaultLocaleId) {
            return;
        }

        $now = now();
        DB::table('currencies')->whereNotNull('name')->where('name', '!=', '')->get(['id', 'name'])
            ->each(function ($row) use ($defaultLocaleId, $now) {
                DB::table('currency_translations')->insert([
                    'currency_id' => $row->id,
                    'locale_id' => $defaultLocaleId,
                    'label' => $row->name,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('currency_translations');
    }
};
