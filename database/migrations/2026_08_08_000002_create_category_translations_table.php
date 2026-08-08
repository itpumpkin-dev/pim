<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['category_id', 'locale_id'], 'uq_category_translations_category_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if ($defaultLocaleId) {
            $now = now();

            DB::table('categories')
                ->whereNotNull('name')
                ->where('name', '!=', '')
                ->select('id', 'name')
                ->orderBy('id')
                ->get()
                ->each(function ($category) use ($defaultLocaleId, $now) {
                    DB::table('category_translations')->insert([
                        'category_id' => $category->id,
                        'locale_id' => $defaultLocaleId,
                        'label' => $category->name,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('category_translations');
    }
};
