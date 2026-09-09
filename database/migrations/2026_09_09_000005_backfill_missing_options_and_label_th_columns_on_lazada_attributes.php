<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mirror ของ pattern เดียวกับ
 * `2026_09_08_000003_backfill_missing_category_and_mandatory_columns_on_lazada_attributes`
 * (docblock ของ migration นั้นเตือนไว้แล้วว่า "this same table also carries
 * `options`/`label_th` columns that no migration in this codebase ever
 * created" — แต่ตอนนั้นแก้เฉพาะ category_id/mandatory ยังไม่ได้แก้ 2 คอลัมน์นี้)
 * และ `App\Models\LazadaAttribute`'s docblock ก็ยืนยันเรื่องเดียวกัน — พังจริงบน
 * production แล้ว (2026-09-09): `LazadaAttributeMappingController::
 * syncLazadaAttributesForCategory()`'s upsert() เขียนคอลัมน์ `options` ทุกครั้ง
 * (ใช้งานจริงตั้งแต่มิเรอร์ Shopee/TikTok มาช่วง 2026-09-08/09 — 2 platform นั้นมี
 * migration `add_options_to_{shopee,tiktok}_attributes_table` ของตัวเองอยู่แล้ว
 * แต่ของ Lazada ไม่มีไฟล์นี้เลยตั้งแต่แรก เพราะ migration ต้นทาง
 * `2026_09_07_000001_add_options_to_lazada_attributes_table` รันติดอยู่ใน
 * environment นี้ (เห็นใน `migrations` table, batch 125) แต่ไฟล์ไม่เคยถูก commit
 * เข้า git เลย — schema เลย "มี" คอลัมน์นี้เฉพาะที่ dev/environment นี้จุดเดียว
 * ส่วน production ที่ deploy จาก git ไม่มีคอลัมน์นี้จริง จนกดปุ่ม "Sync Attributes"
 * แล้ว error 500: `column "options" of relation "lazada_attributes" does not exist`)
 *
 * Guarded ด้วย hasColumn() เหมือน migration ต้นแบบ — environment นี้ (ที่มีคอลัมน์
 * อยู่แล้ว) จะเป็น no-op ส่วน production (ที่ยังไม่มี) จะถูกสร้างขึ้นจริงตาม shape ที่
 * ยืนยันแล้วจาก `information_schema.columns` ของ environment นี้:
 * `options` เป็น `json` nullable, `label_th` เป็น `varchar(255)` nullable
 * (ไม่มี default ทั้งคู่ — แถวเก่าก่อนหน้านี้ก็เป็น NULL อยู่แล้วจริง ไม่ต้อง backfill ค่า)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lazada_attributes', function (Blueprint $table) {
            if (!Schema::hasColumn('lazada_attributes', 'options')) {
                $table->json('options')->nullable();
            }
            if (!Schema::hasColumn('lazada_attributes', 'label_th')) {
                $table->string('label_th')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('lazada_attributes', function (Blueprint $table) {
            $table->dropColumn(array_filter([
                Schema::hasColumn('lazada_attributes', 'options') ? 'options' : null,
                Schema::hasColumn('lazada_attributes', 'label_th') ? 'label_th' : null,
            ]));
        });
    }
};
