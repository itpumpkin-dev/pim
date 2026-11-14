<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * กันแถวซ้ำใน product_values ที่ระดับ DB — 1 scope (product, attribute, group, channel, locale)
     * มีได้แถวเดียว ตรงกับ key ที่ updateOrCreate ในหน้าแก้ไขสินค้า/import ใช้อยู่แล้ว
     * NULLS NOT DISTINCT (PG15+) เพราะ group/channel/locale เป็น NULL ได้ และ NULL ต้องนับว่าซ้ำกัน
     *
     * ข้อมูลเดิมมีแถวซ้ำอยู่ — ต้องรัน `php artisan pim:dedupe-product-values` ก่อน
     *
     * index นี้ขึ้นต้นด้วย (product_id, attribute_id) เลยใช้แทน idx_product_values_product_attribute ได้
     */
    public function up(): void
    {
        $duplicates = DB::selectOne(<<<'SQL'
            SELECT COUNT(*) AS c FROM (
                SELECT 1 FROM product_values
                GROUP BY product_id, attribute_id, attribute_group_id, channel_id, locale_id
                HAVING COUNT(*) > 1
            ) x
            SQL)->c;

        if ($duplicates > 0) {
            throw new RuntimeException("product_values has {$duplicates} duplicate scope group(s) — run `php artisan pim:dedupe-product-values` first.");
        }

        // NULLS NOT DISTINCT มีตั้งแต่ PG15 — เครื่องที่เก่ากว่าใช้ COALESCE(…, 0) แทน (ผลเท่ากัน id ไม่มีทางเป็น 0)
        $pgVersion = (int) DB::selectOne('SHOW server_version_num')->server_version_num;

        DB::statement($pgVersion >= 150000
            ? 'CREATE UNIQUE INDEX uq_product_values_scope ON product_values (product_id, attribute_id, attribute_group_id, channel_id, locale_id) NULLS NOT DISTINCT'
            : 'CREATE UNIQUE INDEX uq_product_values_scope ON product_values (product_id, attribute_id, COALESCE(attribute_group_id, 0), COALESCE(channel_id, 0), COALESCE(locale_id, 0))');
        DB::statement('DROP INDEX IF EXISTS idx_product_values_product_attribute');
    }

    public function down(): void
    {
        DB::statement('CREATE INDEX IF NOT EXISTS idx_product_values_product_attribute ON product_values (product_id, attribute_id)');
        DB::statement('DROP INDEX IF EXISTS uq_product_values_scope');
    }
};
