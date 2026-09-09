<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror ของ attribute_families.lazada_category_id เป๊ะ — ดู migration นั้นๆ
 * docblock (ใช้เป็น lookup key ล้วนๆ ให้ ShopeeAttributeFamilyGenerator
 * find-or-create แถวเดียวกันซ้ำได้แบบ idempotent, null สำหรับ Family ที่
 * แอดมินสร้างเองผ่านหน้าปกติ)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attribute_families', function (Blueprint $table) {
            $table->foreignId('shopee_category_id')->nullable()->unique()->after('lazada_category_id')->constrained('shopee_categories')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attribute_families', function (Blueprint $table) {
            $table->dropForeign(['shopee_category_id']);
            $table->dropColumn('shopee_category_id');
        });
    }
};
