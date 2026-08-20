<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * WooCommerce's own category API response (GET /wp-json/wc/v3/products/categories)
 * carries slug/description/image per row too, alongside id/parent/name
 * already synced — these were left out of the initial woocommerce_categories
 * migration since only id/parent/name/is_leaf were needed for category
 * mapping. Added now so the WooCommerce categories CSV export can include
 * them (see CategoryController::exportWoocommerceCategories()).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('woocommerce_categories', function (Blueprint $table) {
            $table->string('slug')->nullable()->after('name');
            $table->text('description')->nullable()->after('slug');
            $table->string('thumbnail_url')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('woocommerce_categories', function (Blueprint $table) {
            $table->dropColumn(['slug', 'description', 'thumbnail_url']);
        });
    }
};
