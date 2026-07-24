<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attribute_group_translations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_group_id')->constrained('attribute_groups')->cascadeOnDelete();
            $table->foreignId('locale_id')->constrained('locales')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->timestamps();

            $table->unique(['attribute_group_id', 'locale_id'], 'uq_attribute_group_translations_group_locale');
        });

        $defaultLocaleId = DB::table('locales')->where('code', config('app.locale'))->value('id')
            ?? DB::table('locales')->where('enabled', true)->orderBy('id')->value('id');

        if ($defaultLocaleId) {
            $now = now();

            DB::table('attribute_groups')
                ->whereNotNull('name')
                ->where('name', '!=', '')
                ->select('id', 'name')
                ->orderBy('id')
                ->get()
                ->each(function ($group) use ($defaultLocaleId, $now) {
                    DB::table('attribute_group_translations')->insert([
                        'attribute_group_id' => $group->id,
                        'locale_id' => $defaultLocaleId,
                        'label' => $group->name,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_group_translations');
    }
};
