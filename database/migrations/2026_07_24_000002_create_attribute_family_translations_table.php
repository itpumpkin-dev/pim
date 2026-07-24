<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attribute_family_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_family_id')->constrained('attribute_families')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['attribute_family_id', 'locale_id'], 'uq_attribute_family_translations_family_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if ($defaultLocaleId) {
            $now = now();

            DB::table('attribute_families')
                ->whereNotNull('name')
                ->where('name', '!=', '')
                ->select('id', 'name')
                ->orderBy('id')
                ->get()
                ->each(function ($family) use ($defaultLocaleId, $now) {
                    DB::table('attribute_family_translations')->insert([
                        'attribute_family_id' => $family->id,
                        'locale_id' => $defaultLocaleId,
                        'label' => $family->name,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_family_translations');
    }
};
