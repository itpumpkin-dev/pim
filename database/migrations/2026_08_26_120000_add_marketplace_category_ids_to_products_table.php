<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-product override of which marketplace category a product pushes
     * under — until now, category → marketplace-category mapping only
     * existed on `categories` (one mapping shared by every product in that
     * PIM category, see e.g. `categories.shopee_category_id`). These columns
     * let a single product pick a more specific (or different) leaf category
     * directly from each marketplace's own synced tree
     * (shopee_categories/lazada_categories/tiktok_categories), overriding
     * that shared default. Nullable — a product with no override still
     * falls back to its PIM category's mapping (see
     * ShopeeProductSyncService::resolveCategoryId() and its Lazada/TikTok
     * counterparts).
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedBigInteger('shopee_category_id')->nullable()->after('configurable_attributes');
            $table->unsignedBigInteger('lazada_category_id')->nullable()->after('shopee_category_id');
            $table->unsignedBigInteger('tiktok_category_id')->nullable()->after('lazada_category_id');

            $table->foreign('shopee_category_id')->references('id')->on('shopee_categories')->nullOnDelete();
            $table->foreign('lazada_category_id')->references('id')->on('lazada_categories')->nullOnDelete();
            $table->foreign('tiktok_category_id')->references('id')->on('tiktok_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('shopee_category_id');
            $table->dropConstrainedForeignId('lazada_category_id');
            $table->dropConstrainedForeignId('tiktok_category_id');
        });
    }
};
