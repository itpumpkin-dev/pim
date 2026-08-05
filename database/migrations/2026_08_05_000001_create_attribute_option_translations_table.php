<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attribute_option_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_option_id')->constrained('attribute_options')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['attribute_option_id', 'locale_id'], 'uq_attribute_option_translations_option_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if ($defaultLocaleId) {
            $now = now();

            DB::table('attribute_options')
                ->whereNotNull('admin_label')
                ->where('admin_label', '!=', '')
                ->select('id', 'admin_label')
                ->orderBy('id')
                ->get()
                ->each(function ($option) use ($defaultLocaleId, $now) {
                    DB::table('attribute_option_translations')->insert([
                        'attribute_option_id' => $option->id,
                        'locale_id' => $defaultLocaleId,
                        'label' => $option->admin_label,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_option_translations');
    }
};
