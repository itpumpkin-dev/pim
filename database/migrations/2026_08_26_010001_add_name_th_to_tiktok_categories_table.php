<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Same reasoning as add_name_th_to_shopee_categories_table — TikTokClient::
     * getCategoryTree() already takes a `locale` param, defaulted to 'th-TH',
     * so `name` here has actually been Thai all along (unlike Shopee, whose
     * default was 'en'). syncTikTokCategories() is being changed alongside
     * this migration to fetch 'en-US' into `name` and 'th-TH' into this new
     * `name_th` column instead — keeping `name` = English consistently
     * across every *_categories cache (shopee_categories, lazada_categories,
     * tiktok_categories), same convention this app already uses everywhere
     * else `name` shows up without a locale suffix.
     */
    public function up(): void
    {
        Schema::table('tiktok_categories', function (Blueprint $table) {
            $table->string('name_th')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('tiktok_categories', function (Blueprint $table) {
            $table->dropColumn('name_th');
        });
    }
};
