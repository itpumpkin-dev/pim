<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror ของ shopee_attribute_option_mappings เป๊ะ — ดูตารางนั้นๆ docblock
 * สำหรับเหตุผลเต็มๆ ต่างกันแค่ชื่อคอลัมน์ (tiktok_ แทน shopee_) — resolve
 * ผ่าน TikTokProductSyncService::resolveSingleSelectOptionValue()/
 * resolveMultiSelectOptionValues() ตอน push จริง (รวมไว้ตั้งแต่ v1 นี้เลย
 * ไม่ต้องแยก decision ทีหลังแบบที่ Shopee เคยทำ — เพราะ values[] shape และ
 * push ของ TikTok ยืนยัน live มาก่อนงานนี้แล้วทั้งคู่)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tiktok_attribute_option_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tiktok_attribute_mapping_id')->constrained('tiktok_attribute_mappings')->cascadeOnDelete();
            $table->foreignId('attribute_option_id')->constrained('attribute_options')->cascadeOnDelete();
            $table->string('tiktok_option_value');
            $table->string('tiktok_option_label')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tiktok_attribute_mapping_id', 'attribute_option_id'], 'uq_tiktok_option_mapping_target_option');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tiktok_attribute_option_mappings');
    }
};
