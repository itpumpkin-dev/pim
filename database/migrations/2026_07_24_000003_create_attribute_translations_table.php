<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attribute_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')->constrained('attributes')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['attribute_id', 'locale_id'], 'uq_attribute_translations_attribute_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if ($defaultLocaleId) {
            $now = now();

            DB::table('attributes')
                ->whereNotNull('name')
                ->where('name', '!=', '')
                ->select('id', 'name')
                ->orderBy('id')
                ->get()
                ->each(function ($attribute) use ($defaultLocaleId, $now) {
                    DB::table('attribute_translations')->insert([
                        'attribute_id' => $attribute->id,
                        'locale_id' => $defaultLocaleId,
                        'label' => $attribute->name,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_translations');
    }
};
