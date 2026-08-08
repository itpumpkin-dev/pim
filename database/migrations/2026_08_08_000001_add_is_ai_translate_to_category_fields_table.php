<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('category_fields', function (Blueprint $table) {
            $table->boolean('is_ai_translate')->default(false)->after('value_per_locale');
        });
    }

    public function down(): void
    {
        Schema::table('category_fields', function (Blueprint $table) {
            $table->dropColumn('is_ai_translate');
        });
    }
};
