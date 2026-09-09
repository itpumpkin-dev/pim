<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror ของ lazada_attributes.options — เก็บตัวเลือกที่กำหนดไว้ล่วงหน้าของ
 * Shopee attribute แบบ dropdown/combo box (input_type 1/2/4/5, ดู
 * ShopeeAttribute's docblock) ที่ get_attribute_tree ส่งมาเป็น
 * `attribute_value_list` — shape ยืนยันแล้วจากข้อมูลจริง (sandbox,
 * 2026-09-08): `{value_id, name, multi_lang}` ต่างจากเอกสาร Shopee เล็กน้อย
 * (`name` ไม่ใช่ `original_value_name`) ดู
 * ShopeeAttributeMappingController::encodeShopeeOptions()'s docblock
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shopee_attributes', function (Blueprint $table) {
            $table->json('options')->nullable()->after('input_type');
        });
    }

    public function down(): void
    {
        Schema::table('shopee_attributes', function (Blueprint $table) {
            $table->dropColumn('options');
        });
    }
};
