<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror ของ shopee_attributes.options — เก็บตัวเลือกที่กำหนดไว้ล่วงหน้าของ
 * TikTok attribute (`is_customizable=false`) ที่ get_attributes ส่งมาเป็น
 * `values[]` — shape ยืนยันแล้วจากของจริงตั้งแต่ก่อนงานนี้ (ดู
 * TikTokClient::getAttributes()'s docblock, live 2026-08-17): `[{id, name}]`
 * ต่างจาก Shopee/Lazada ตรงที่ TikTok ไม่มีคอลัมน์ `input_type` เลย (ดู
 * TikTokAttribute's docblock) — ใช้ `is_customizable`/`is_multiple_selection`
 * ที่มีอยู่แล้วแยกประเภทแทน ไม่ต้องเพิ่มคอลัมน์ input_type ใหม่
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tiktok_attributes', function (Blueprint $table) {
            $table->json('options')->nullable()->after('is_multiple_selection');
        });
    }

    public function down(): void
    {
        Schema::table('tiktok_attributes', function (Blueprint $table) {
            $table->dropColumn('options');
        });
    }
};
