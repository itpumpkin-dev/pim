<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-product override of which marketplace brand a product pushes
     * under — mirrors 2026_08_26_120000_add_marketplace_category_ids_to_
     * products_table.php's category override exactly, one beat later.
     * Until now, PIM brand -> marketplace brand mapping only existed on
     * `attribute_options` (one mapping shared by every product using that
     * PIM brand option, see e.g. `attribute_options.shopee_brand_id`).
     * These columns let a single product pick a specific marketplace brand
     * directly from each platform's own synced list (shopee_brands/
     * lazada_brands/tiktok_brands/woocommerce_brands), overriding that
     * shared default. Nullable — a product with no override falls back to
     * its `pbrand` attribute value's mapped option (see
     * ShopeeProductSyncService::resolveShopeeBrandId() and its Lazada/
     * TikTok/WooCommerce counterparts).
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedBigInteger('shopee_brand_id')->nullable()->after('woocommerce_category_id');
            $table->unsignedBigInteger('lazada_brand_id')->nullable()->after('shopee_brand_id');
            $table->unsignedBigInteger('tiktok_brand_id')->nullable()->after('lazada_brand_id');
            $table->unsignedBigInteger('woocommerce_brand_id')->nullable()->after('tiktok_brand_id');

            $table->foreign('shopee_brand_id')->references('id')->on('shopee_brands')->nullOnDelete();
            $table->foreign('lazada_brand_id')->references('id')->on('lazada_brands')->nullOnDelete();
            $table->foreign('tiktok_brand_id')->references('id')->on('tiktok_brands')->nullOnDelete();
            $table->foreign('woocommerce_brand_id')->references('id')->on('woocommerce_brands')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shopee_brand_id');
            $table->dropConstrainedForeignId('lazada_brand_id');
            $table->dropConstrainedForeignId('tiktok_brand_id');
            $table->dropConstrainedForeignId('woocommerce_brand_id');
        });
    }
};
