<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Trigram index ให้ `value ILIKE '%…%'` ของหน้ารายการสินค้า (filter ชื่อสินค้า + "เพิ่มตัวกรอง"
     * แบบ attribute — ดู ProductController::index()) ใช้ index ได้แทน seq scan ทั้งตาราง
     * วัดบนข้อมูลจริง ~214k แถว: 357ms → ~70ms ต่อ query และหน้านี้ยิง 2 query (หน้า + count)
     *
     * index อยู่บน (value::text) ให้ตรงกับ SQL ที่ Laravel สร้างให้ ilike บน pgsql ("value"::text ilike ?)
     * ไม่งั้น planner จะไม่หยิบมาใช้ คำค้นสั้นกว่า 3 ตัวอักษรยังเป็น seq scan เหมือนเดิม (ข้อจำกัดของ trigram)
     */
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // pg_trgm ถูกสร้างไว้แล้วใน 2026_11_06_000003 — IF NOT EXISTS เผื่อเครื่องที่ข้ามไป
        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
        DB::statement('CREATE INDEX IF NOT EXISTS idx_product_values_value_trgm ON product_values USING gin ((value::text) gin_trgm_ops)');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS idx_product_values_value_trgm');
    }
};
