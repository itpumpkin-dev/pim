<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * DB cleanup Phase 2a — จัดค่ารายภาษาใน product_values ให้ตรงกับความหมายจริง (ไม่ลบแถวที่เป็น copy —
 * นั่นคือ Phase 2b เพราะ applySmartDefaults()/ตัวอ่านหลายจุดยังพึ่งแถวพวกนั้นอยู่)
 *
 * 1. attribute type ที่ไม่ขึ้นกับภาษา (ตัวเลข/ราคา/วันที่/boolean/select/multiselect — select เก็บ code
 *    ส่วนชื่อ option แปลใน attribute_option_translations อยู่แล้ว) และ attribute ที่ต้องไม่ซ้ำ (pid,
 *    barcode_* — รหัส) → is_locale_based = false และย้าย
 *    แถวรายภาษาไปเป็นแถว locale_id = NULL (หน้าแก้ไขสินค้าอ่าน/เขียนแถว 'default' สำหรับ attribute ที่ไม่
 *    แยกภาษา เลยต้องทำพร้อมกันใน transaction เดียว ไม่งั้นค่าจะหายจากหน้าจอ)
 *    - ค่าที่ชนะ: แถว th (เป็นค่าที่หน้าแก้ไขแสดงอยู่ตอนนี้) > แถว NULL > ภาษาที่ id ต่ำสุด ยกเว้น
 *      หมวดหมู่หลัก (pcatname/psubcatname/productgroupname) ที่หน้าแก้ไขและการผูกหมวดหมู่ใช้แถว NULL
 *    - file/image/gallery/video ไม่แตะ — มีเนื้อหาแยกภาษาจริง (เช่น how_to_use ไทย/อังกฤษ/จีน)
 * 2. attribute ที่ยังแยกภาษา: แถว th ≠ แถว NULL → เขียนค่า th ลงแถว NULL (th คือค่าที่คนแก้ทีหลัง)
 *    แถว th ยังอยู่
 *
 * ภาษาที่ปิดใช้งาน (ja/pt) ไม่ถูกแตะเลย แถวที่ถูกแก้/ลบ export เป็น CSV ใน storage/app/backups ก่อนเสมอ
 */
class NormalizeLocaleValuesCommand extends Command
{
    protected $signature = 'pim:normalize-locale-values {--dry-run : แสดงสรุป + export CSV โดยไม่แก้จริง}';

    protected $description = 'Phase 2a: make language-neutral attributes non-locale (moving their values to the NULL-locale row) and copy th edits into the NULL-locale base row.';

    public const LANGUAGE_NEUTRAL_TYPES = ['number', 'price', 'date', 'boolean', 'select', 'multiselect'];

    private const MASTER_CATEGORY_ATTRIBUTE_CODES = ['pcatname', 'psubcatname', 'productgroupname'];

    /** @var array<int, array<int, mixed>> */
    private array $log = [];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $thId = DB::table('locales')->where('code', 'th')->value('id');
        $enabledLocaleIds = DB::table('locales')->where('enabled', true)->pluck('id')->all();

        // รวม attribute ที่ปิด is_locale_based ไปแล้วด้วย — บางตัว (เช่น pbrand) ยังมีแถวรายภาษาค้างจากตอนที่เคยเปิดอยู่
        // + attribute ที่ต้องไม่ซ้ำ (pid, barcode_*) — เป็นรหัส ไม่ขึ้นกับภาษา และการเช็คค่าซ้ำดูแถว NULL
        $attributes = Attribute::where(fn ($q) => $q->whereIn('type', self::LANGUAGE_NEUTRAL_TYPES)->orWhere('is_unique', true))
            ->get(['id', 'code', 'type', 'is_locale_based']);

        DB::beginTransaction();
        try {
            [$moved, $dropped] = $this->moveToBaseRow($attributes, $thId, $enabledLocaleIds);
            $flipped = $attributes->where('is_locale_based', true);
            Attribute::whereIn('id', $flipped->pluck('id'))->update(['is_locale_based' => false]);
            $copied = $thId ? $this->copyThaiIntoBaseRow($thId) : 0;

            $this->line(sprintf('1) %d attribute(s) of type %s or unique → is_locale_based = false', $flipped->count(), implode('/', self::LANGUAGE_NEUTRAL_TYPES)));
            $this->line("   {$moved} locale row(s) moved to the NULL-locale row, {$dropped} locale row(s) removed");
            $this->line("2) {$copied} NULL-locale row(s) overwritten with their th value");

            $conflicts = array_values(array_filter($this->log, fn ($row) => $row[0] === 'conflict'));
            if ($conflicts) {
                $this->warn('Values that differed between locales (winner shown):');
                $this->table(['SKU', 'Attribute', 'Winner', 'Loser locale', 'Loser value'], array_map(fn ($row) => array_slice($row, 1, 5), $conflicts));
            }

            $this->line('Changed rows exported to: '.$this->exportCsv($dryRun));

            if ($dryRun) {
                DB::rollBack();
                $this->info('Dry run — nothing changed.');

                return self::SUCCESS;
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }

        Attribute::bumpListVersion(); // cachedList() ถือ is_locale_based ไว้
        $this->info('Done.');

        return self::SUCCESS;
    }

    /**
     * @return array{0: int, 1: int}
     */
    private function moveToBaseRow($attributes, ?int $thId, array $enabledLocaleIds): array
    {
        $moved = 0;
        $dropped = 0;

        foreach ($attributes as $attribute) {
            $preferBase = in_array($attribute->code, self::MASTER_CATEGORY_ATTRIBUTE_CODES, true);

            $rows = DB::table('product_values')
                ->join('products', 'products.id', '=', 'product_values.product_id')
                ->leftJoin('locales', 'locales.id', '=', 'product_values.locale_id')
                ->where('product_values.attribute_id', $attribute->id)
                ->where(fn ($q) => $q->whereNull('product_values.locale_id')->orWhereIn('product_values.locale_id', $enabledLocaleIds))
                ->orderBy('product_values.id')
                ->get(['product_values.*', 'products.sku', 'locales.code as locale_code'])
                ->groupBy(fn ($row) => implode('|', [$row->product_id, $row->attribute_group_id, $row->channel_id]));

            foreach ($rows as $scopeRows) {
                $localeRows = $scopeRows->whereNotNull('locale_id');
                if ($localeRows->isEmpty()) {
                    continue;
                }

                $base = $scopeRows->firstWhere('locale_id', null);
                $th = $thId ? $localeRows->firstWhere('locale_id', $thId) : null;
                $winner = $preferBase ? ($base ?? $th ?? $localeRows->sortBy('locale_id')->first())
                    : ($th ?? $base ?? $localeRows->sortBy('locale_id')->first());

                foreach ($scopeRows as $row) {
                    if ($row->id !== $winner->id && $row->value !== $winner->value) {
                        $this->log[] = ['conflict', $row->sku, $attribute->code, ($winner->locale_code ?? 'NULL').': '.mb_strimwidth((string) $winner->value, 0, 30, '…'), $row->locale_code ?? 'NULL', mb_strimwidth((string) $row->value, 0, 30, '…')];
                    }
                }

                if ($base && $base->id !== $winner->id) {
                    $this->log[] = ['update_base', $base->sku, $attribute->code, $base->id, 'NULL', $base->value, $winner->value];
                    DB::table('product_values')->where('id', $base->id)->update(['value' => $winner->value]);
                } elseif (! $base) {
                    $this->log[] = ['move_to_base', $winner->sku, $attribute->code, $winner->id, $winner->locale_code, $winner->value, $winner->value];
                    DB::table('product_values')->where('id', $winner->id)->update(['locale_id' => null]);
                    $moved++;
                }

                foreach ($localeRows as $row) {
                    if ($row->id === $winner->id && ! $base) {
                        continue; // กลายเป็นแถว NULL ไปแล้ว
                    }
                    $this->log[] = ['delete', $row->sku, $attribute->code, $row->id, $row->locale_code, $row->value, null];
                    DB::table('product_values')->where('id', $row->id)->delete();
                    $dropped++;
                }
            }
        }

        return [$moved, $dropped];
    }

    private function copyThaiIntoBaseRow(int $thId): int
    {
        $rows = DB::select(<<<'SQL'
            SELECT b.id AS base_id, b.value AS base_value, t.value AS th_value, p.sku, a.code
            FROM product_values t
            JOIN product_values b
              ON b.product_id = t.product_id AND b.attribute_id = t.attribute_id
             AND b.attribute_group_id IS NOT DISTINCT FROM t.attribute_group_id
             AND b.channel_id IS NOT DISTINCT FROM t.channel_id
             AND b.locale_id IS NULL
            JOIN attributes a ON a.id = t.attribute_id AND a.is_locale_based
            JOIN products p ON p.id = t.product_id
            WHERE t.locale_id = ? AND b.value <> t.value
            ORDER BY p.sku, a.code
            SQL, [$thId]);

        foreach ($rows as $row) {
            $this->log[] = ['copy_th_to_base', $row->sku, $row->code, $row->base_id, 'NULL', $row->base_value, $row->th_value];
            DB::table('product_values')->where('id', $row->base_id)->update(['value' => $row->th_value]);
        }

        return count($rows);
    }

    private function exportCsv(bool $dryRun): string
    {
        $path = 'backups/normalize_locale_values_'.now()->format('Ymd_His').($dryRun ? '_dryrun' : '').'.csv';

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF"); // BOM — ให้ Excel อ่านภาษาไทยถูก
        fputcsv($handle, ['action', 'sku', 'attribute_code', 'row_id', 'locale', 'old_value', 'new_value']);
        foreach ($this->log as $row) {
            if ($row[0] !== 'conflict') {
                fputcsv($handle, $row);
            }
        }
        rewind($handle);
        Storage::disk('local')->put($path, stream_get_contents($handle));
        fclose($handle);

        return Storage::disk('local')->path($path);
    }
}
