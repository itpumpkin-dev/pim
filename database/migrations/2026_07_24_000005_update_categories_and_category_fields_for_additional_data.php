<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('category_fields', function (Blueprint $table) {
            $table->jsonb('labels')->nullable()->after('type');
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->jsonb('additional_data')->nullable()->after('description');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('category_fields', function (Blueprint $table) {
            $table->dropColumn('labels');
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('additional_data');
        });
    }
};
