<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('locale_translation_files', function (Blueprint $table) {
            // Dot-paths whose translation is deliberately identical to the
            // English source (e.g. "SKU") — see LocaleTranslationService::progress().
            $table->json('identical_keys')->nullable()->after('content');
        });
    }

    public function down(): void
    {
        Schema::table('locale_translation_files', function (Blueprint $table) {
            $table->dropColumn('identical_keys');
        });
    }
};
