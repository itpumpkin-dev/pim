<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Local cache of TikTok Shop's category tree (GET /product/{version}/
     * categories), synced from TikTokClient::getCategoryTree() — mirrors
     * shopee_categories/lazada_categories. TikTok's response gives id/
     * parent_id/is_leaf directly per row (like Lazada) but as a flat list
     * with no order guarantee (like Shopee) — see
     * CategoryController::syncTikTokCategories() for the reordering this
     * requires before the upsert (parent_id is a real self-referencing FK).
     */
    public function up(): void
    {
        Schema::create('tiktok_categories', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('name');
            $table->boolean('is_leaf')->default(false);
            $table->timestamps();

            $table->index('parent_id');
        });

        Schema::table('tiktok_categories', function (Blueprint $table) {
            $table->foreign('parent_id')->references('id')->on('tiktok_categories')->nullOnDelete();
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->unsignedBigInteger('tiktok_category_id')->nullable()->after('shopee_category_id');
            $table->foreign('tiktok_category_id')->references('id')->on('tiktok_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tiktok_category_id');
        });

        Schema::dropIfExists('tiktok_categories');
    }
};
