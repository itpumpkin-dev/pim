<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * เพิ่มคำแปลหลายภาษาจริงให้ "ประเภทธุรกิจ" (Business Types) — เหตุผลเดียวกับ
 * 2026_09_03_000003_create_product_type_translations_table.php ทุกประการ
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('business_type_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('business_type_id')->constrained('business_types')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['business_type_id', 'locale_id'], 'uq_business_type_translations_type_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', 'th')->value('id')
            ?? DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if (! $defaultLocaleId) {
            return;
        }

        $now = now();
        DB::table('business_types')->whereNotNull('name')->where('name', '!=', '')->get(['id', 'name'])
            ->each(function ($row) use ($defaultLocaleId, $now) {
                DB::table('business_type_translations')->insert([
                    'business_type_id' => $row->id,
                    'locale_id' => $defaultLocaleId,
                    'label' => $row->name,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('business_type_translations');
    }
};
