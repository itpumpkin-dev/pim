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
        Schema::table('products', function (Blueprint $table) {
            // Attribute IDs that define the variant axes on a configurable
            // product (e.g. color/size) — chosen once at create time to
            // generate the variant matrix, previously discarded on save with
            // nowhere to persist it.
            $table->json('configurable_attributes')->nullable()->after('type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('configurable_attributes');
        });
    }
};
