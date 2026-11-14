<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * ลบแถวซ้ำใน product_values — "ซ้ำ" = scope เดียวกันทั้ง 5 คอลัมน์ (product_id,
 * attribute_id, attribute_group_id, channel_id, locale_id) ซึ่งเป็น key เดียวกับที่หน้าแก้ไข
 * สินค้าใช้ updateOrCreate (attribute_group_id เป็นส่วนหนึ่งของ key โดยตั้งใจ — attribute
 * ตัวเดียวกันอยู่หลาย group ได้และแต่ละ group เก็บค่าแยกกัน ดู BackfillProductValueAttributeGroupsCommand)
 *
 * ต้องรันก่อน migration 2026_11_14_000001_add_unique_scope_index_to_product_values_table
 * ไม่งั้นสร้าง unique index ไม่ผ่าน
 *
 * เก็บแถวที่ id ต่ำสุดของแต่ละกลุ่ม ไม่ใช่ใหม่สุด — แถวซ้ำเกือบทั้งหมดเกิดจาก backfill ของ
 * attribute_group_id (2026-09-23) ที่ copy แถวเดิมเพิ่มเข้า group เดิมซ้ำๆ ส่วนแถวเดิม (id ต่ำ)
 * คือค่าที่ผู้ใช้กรอกจริง (เทียบกับ audit_logs แล้ว เช่น SKU 50587) แถวที่ลบจะถูก export เป็น CSV
 * ไว้ใน storage/app/backups ก่อนเสมอ
 */
class DedupeProductValuesCommand extends Command
{
    protected $signature = 'pim:dedupe-product-values {--dry-run : แสดงสรุป + export CSV โดยไม่ลบจริง}';

    protected $description = 'Remove duplicate product_values rows that share the same product/attribute/group/channel/locale scope (keeps the oldest row).';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $duplicates = DB::select(<<<'SQL'
            SELECT d.id, d.product_id, p.sku, a.code AS attribute_code, d.attribute_group_id, d.channel_id, d.locale_id,
                   d.value, k.id AS kept_id, k.value AS kept_value
            FROM (
                SELECT pv.*,
                       FIRST_VALUE(pv.id) OVER w AS keep_id,
                       ROW_NUMBER() OVER w AS rn
                FROM product_values pv
                WINDOW w AS (PARTITION BY product_id, attribute_id, attribute_group_id, channel_id, locale_id ORDER BY id)
            ) d
            JOIN product_values k ON k.id = d.keep_id
            JOIN products p ON p.id = d.product_id
            JOIN attributes a ON a.id = d.attribute_id
            WHERE d.rn > 1
            ORDER BY d.product_id, d.attribute_id, d.id
            SQL);

        if (empty($duplicates)) {
            $this->info('No duplicate product_values rows found.');

            return self::SUCCESS;
        }

        $conflicts = array_values(array_filter($duplicates, fn ($row) => $row->value !== $row->kept_value));
        $groupCount = count(array_unique(array_map(fn ($row) => $row->kept_id, $duplicates)));
        $productCount = count(array_unique(array_map(fn ($row) => $row->product_id, $duplicates)));

        $this->line(sprintf(
            '%d duplicate row(s) in %d scope group(s) across %d product(s); %d row(s) hold a value different from the kept row.',
            count($duplicates), $groupCount, $productCount, count($conflicts)
        ));

        if ($conflicts) {
            $this->warn('Conflicting values (kept = oldest row):');
            $this->table(
                ['SKU', 'Attribute', 'Locale', 'Kept #id', 'Kept value', 'Removed #id', 'Removed value'],
                array_map(fn ($row) => [
                    $row->sku, $row->attribute_code, $row->locale_id ?? '-',
                    $row->kept_id, mb_strimwidth((string) $row->kept_value, 0, 30, '…'),
                    $row->id, mb_strimwidth((string) $row->value, 0, 30, '…'),
                ], $conflicts)
            );
        }

        $csvPath = $this->exportCsv($duplicates, $dryRun);
        $this->line('Rows to remove exported to: '.$csvPath);

        if ($dryRun) {
            $this->info('Dry run — nothing deleted.');

            return self::SUCCESS;
        }

        $deleted = 0;
        DB::transaction(function () use ($duplicates, &$deleted) {
            foreach (array_chunk(array_map(fn ($row) => $row->id, $duplicates), 1000) as $ids) {
                $deleted += DB::table('product_values')->whereIn('id', $ids)->delete();
            }
        });

        $this->info("Deleted {$deleted} duplicate row(s).");

        return self::SUCCESS;
    }

    /**
     * @param  array<int, object>  $rows
     */
    private function exportCsv(array $rows, bool $dryRun): string
    {
        $path = 'backups/product_values_dedupe_'.now()->format('Ymd_His').($dryRun ? '_dryrun' : '').'.csv';

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF"); // BOM — ให้ Excel อ่านภาษาไทยถูก
        fputcsv($handle, ['id', 'product_id', 'sku', 'attribute_code', 'attribute_group_id', 'channel_id', 'locale_id', 'value', 'kept_id', 'kept_value']);
        foreach ($rows as $row) {
            fputcsv($handle, [
                $row->id, $row->product_id, $row->sku, $row->attribute_code, $row->attribute_group_id,
                $row->channel_id, $row->locale_id, $row->value, $row->kept_id, $row->kept_value,
            ]);
        }
        rewind($handle);
        Storage::disk('local')->put($path, stream_get_contents($handle));
        fclose($handle);

        return Storage::disk('local')->path($path);
    }
}
