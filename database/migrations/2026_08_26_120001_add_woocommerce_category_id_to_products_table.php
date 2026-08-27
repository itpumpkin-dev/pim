<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Same per-product override as shopee_category_id/lazada_category_id/
     * tiktok_category_id (see 2026_08_26_120000_...) — added a beat later
     * because WooCommerceProductSyncService::buildPayload() previously sent
     * *every* PIM-category-mapped WooCommerce category at once (WooCommerce
     * natively supports multiple categories per product) with no
     * requirement that any be set. Adding this single-id override
     * intentionally narrows that to one category, required before push,
     * matching Shopee/Lazada/TikTok — a deliberate behavior change, not
     * just filling a gap left by the same migration that added the other
     * three.
     */
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedBigInteger('woocommerce_category_id')->nullable()->after('tiktok_category_id');
            $table->foreign('woocommerce_category_id')->references('id')->on('woocommerce_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('woocommerce_category_id');
        });
    }
};
