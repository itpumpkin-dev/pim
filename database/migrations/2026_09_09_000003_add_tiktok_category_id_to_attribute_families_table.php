<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror ของ attribute_families.shopee_category_id เป๊ะ — ดู migration นั้นๆ
 * docblock (ใช้เป็น lookup key ล้วนๆ ให้ TikTokAttributeFamilyGenerator
 * find-or-create แถวเดียวกันซ้ำได้แบบ idempotent)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attribute_families', function (Blueprint $table) {
            $table->foreignId('tiktok_category_id')->nullable()->unique()->after('shopee_category_id')->constrained('tiktok_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_families', function (Blueprint $table) {
            $table->dropForeign(['tiktok_category_id']);
            $table->dropColumn('tiktok_category_id');
        });
    }
};
