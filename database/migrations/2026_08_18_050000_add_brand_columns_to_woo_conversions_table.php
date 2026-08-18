<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('woo_conversions', function (Blueprint $table) {
            $table->unsignedInteger('brand_new_count')->default(0)->after('category_unmatched_count');
            $table->json('brand_new_names')->nullable()->after('brand_new_count');
            $table->unsignedInteger('brand_new_names_total')->default(0)->after('brand_new_names');
        });
    }

    public function down(): void
    {
        Schema::table('woo_conversions', function (Blueprint $table) {
            $table->dropColumn(['brand_new_count', 'brand_new_names', 'brand_new_names_total']);
        });
    }
};
