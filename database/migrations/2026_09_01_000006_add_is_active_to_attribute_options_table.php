<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-option active flag. Surfaced today only by the Base Units master
     * (/catalog/base-units → "UnitStatus"); other AttributeOption consumers
     * (Brands, …) leave it at the default and ignore it.
     */
    public function up(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('sort_order');
        });
    }

    public function down(): void
    {
        Schema::table('attribute_options', function (Blueprint $table) {
            $table->dropColumn('is_active');
        });
    }
};
