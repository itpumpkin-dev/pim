<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Local cache of WooCommerce's product categories (GET /wp-json/wc/v3/products/categories),
     * synced from WooCommerceClient::getCategories() — mirrors shopee_categories/lazada_categories.
     * WooCommerce's API returns each category's own `parent` id but no
     * `has_children` flag the way Shopee's does, so `is_leaf` here is
     * computed by the sync itself (see CategoryController::syncWoocommerceCategories()),
     * not read directly off the API response.
     */
    public function up(): void
    {
        Schema::create('woocommerce_categories', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('name');
            $table->boolean('is_leaf')->default(false);
            $table->timestamps();

            $table->index('parent_id');
        });

        // Self-referencing FK added after the table (and its primary key
        // constraint) is fully committed — same reason as shopee_categories/lazada_categories.
        Schema::table('woocommerce_categories', function (Blueprint $table) {
            $table->foreign('parent_id')->references('id')->on('woocommerce_categories')->nullOnDelete();
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->unsignedBigInteger('woocommerce_category_id')->nullable()->after('tiktok_category_id');
            $table->foreign('woocommerce_category_id')->references('id')->on('woocommerce_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('woocommerce_category_id');
        });

        Schema::dropIfExists('woocommerce_categories');
    }
};
