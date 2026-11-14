<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Services\Catalog\LocaleFallback;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * DB cleanup Phase 2b — ภาษาไทยเก็บที่แถว th: attribute แยกภาษาทุกแถวต้องมี locale_id
 * (ตัวอ่านทุกจุด fallback ภาษาที่ขอ → th → แถว NULL ผ่าน LocaleFallback อยู่แล้ว เลยรันได้ทุกเมื่อหลัง deploy)
 *
 * ต่อ scope (product, attribute, group, channel) ของ attribute ที่แยกภาษา:
 *   1. มีแถว NULL แต่ไม่มีแถว th → ย้ายแถว NULL เป็นแถว th
 *   2. มีทั้งคู่ → เก็บแถว th (ค่าที่คนแก้ทีหลัง — ตัดสินใจแล้ว) ลบแถว NULL
 *   3. แถวภาษาอื่นที่เปิดใช้งาน (en/zh/es …) ที่ค่าตรงกับภาษาไทยทุกตัวอักษร = copy ที่ไม่เคยแปล → ลบ
 *      (หน้าจอ/export/marketplace แสดงภาษาไทยแทนผ่าน fallback, AI translate เห็นเป็น "ยังไม่แปล")
 * ภาษาที่ปิดใช้งาน (ja/pt) ไม่ถูกแตะ แถวที่แก้/ลบ export เป็น CSV ใน storage/app/backups ก่อนเสมอ
 *
 * ต้องรัน pim:normalize-locale-values ก่อน — attribute ที่ไม่ขึ้นกับภาษา (ตัวเลข/select/รหัส) ต้องเป็น
 * ไม่แยกภาษาไปก่อน ไม่งั้นจะถูกย้ายเข้า th แทนที่จะอยู่แถว NULL
 */
class MoveBaseLocaleValuesCommand extends Command
{
    protected $signature = 'pim:move-base-locale-values {--dry-run : แสดงสรุป + export CSV โดยไม่แก้จริง}';

    protected $description = 'Phase 2b: move Thai content of locale-based attributes from the NULL-locale row into the th row and drop untranslated per-locale copies.';

    private const SCOPE_JOIN = 'o.product_id = b.product_id AND o.attribute_id = b.attribute_id
        AND o.attribute_group_id IS NOT DISTINCT FROM b.attribute_group_id
        AND o.channel_id IS NOT DISTINCT FROM b.channel_id';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $thId = LocaleFallback::baseLocaleId();
        if (! $thId) {
            $this->error('Locale "'.LocaleFallback::BASE_LOCALE_CODE.'" not found.');

            return self::FAILURE;
        }

        $neutral = Attribute::where('is_locale_based', true)
            ->where(fn ($q) => $q->whereIn('type', NormalizeLocaleValuesCommand::LANGUAGE_NEUTRAL_TYPES)->orWhere('is_unique', true))
            ->pluck('code');
        if ($neutral->isNotEmpty()) {
            $this->error('Run `php artisan pim:normalize-locale-values` first — still locale based: '.$neutral->implode(', '));

            return self::FAILURE;
        }

        $copyLocaleIds = DB::table('locales')->where('enabled', true)->where('id', '!=', $thId)->pluck('id')->all();
        $log = [];

        DB::beginTransaction();
        try {
            // 2. แถว NULL ที่มีแถว th อยู่แล้ว → ลบ (th ชนะ)
            $dropped = DB::select(<<<SQL
                SELECT b.id, p.sku, a.code, b.value AS old_value, o.value AS th_value
                FROM product_values b
                JOIN attributes a ON a.id = b.attribute_id AND a.is_locale_based
                JOIN products p ON p.id = b.product_id
                JOIN product_values o ON {$this->scopeJoin()} AND o.locale_id = ?
                WHERE b.locale_id IS NULL
                SQL, [$thId]);
            foreach ($dropped as $row) {
                $log[] = ['delete_base_th_exists', $row->sku, $row->code, $row->id, 'NULL', $row->old_value, $row->th_value];
            }
            $this->deleteIds(array_column($dropped, 'id'));

            // 1. แถว NULL ที่เหลือ (ไม่มีแถว th) → ย้ายเป็นแถว th
            $moved = DB::select(<<<'SQL'
                SELECT b.id, p.sku, a.code, b.value
                FROM product_values b
                JOIN attributes a ON a.id = b.attribute_id AND a.is_locale_based
                JOIN products p ON p.id = b.product_id
                WHERE b.locale_id IS NULL
                SQL);
            foreach ($moved as $row) {
                $log[] = ['move_base_to_th', $row->sku, $row->code, $row->id, 'NULL→th', $row->value, $row->value];
            }
            foreach (array_chunk(array_column($moved, 'id'), 1000) as $ids) {
                DB::table('product_values')->whereIn('id', $ids)->update(['locale_id' => $thId]);
            }

            // 3. copy ภาษาอื่นที่ค่าตรงกับภาษาไทย → ลบ
            $copies = empty($copyLocaleIds) ? [] : DB::select(sprintf(<<<SQL
                SELECT b.id, p.sku, a.code, l.code AS locale, b.value
                FROM product_values b
                JOIN attributes a ON a.id = b.attribute_id AND a.is_locale_based
                JOIN products p ON p.id = b.product_id
                JOIN locales l ON l.id = b.locale_id
                JOIN product_values o ON {$this->scopeJoin()} AND o.locale_id = ?
                WHERE b.locale_id IN (%s) AND b.value = o.value
                SQL, implode(',', array_fill(0, count($copyLocaleIds), '?'))), [$thId, ...$copyLocaleIds]);
            foreach ($copies as $row) {
                $log[] = ['delete_untranslated_copy', $row->sku, $row->code, $row->id, $row->locale, $row->value, null];
            }
            $this->deleteIds(array_column($copies, 'id'));

            $conflicts = array_values(array_filter($dropped, fn ($row) => $row->old_value !== $row->th_value));

            $this->line(sprintf('1) %d NULL-locale row(s) moved to th', count($moved)));
            $this->line(sprintf('2) %d NULL-locale row(s) removed — a th row already exists (%d with a different value, th kept)', count($dropped), count($conflicts)));
            $this->line(sprintf('3) %d untranslated copy row(s) removed (%s)', count($copies), $this->countByLocale($copies)));

            if ($conflicts) {
                $this->warn('NULL-locale values that differed from th (th kept):');
                $this->table(['SKU', 'Attribute', 'Removed NULL value', 'Kept th value'], array_map(fn ($row) => [
                    $row->sku, $row->code, mb_strimwidth((string) $row->old_value, 0, 30, '…'), mb_strimwidth((string) $row->th_value, 0, 30, '…'),
                ], array_slice($conflicts, 0, 30)));
            }

            $this->line('Changed rows exported to: '.$this->exportCsv($log, $dryRun));

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

        $this->info('Done.');

        return self::SUCCESS;
    }

    private function scopeJoin(): string
    {
        return self::SCOPE_JOIN;
    }

    /**
     * @param  array<int, int>  $ids
     */
    private function deleteIds(array $ids): void
    {
        foreach (array_chunk($ids, 1000) as $chunk) {
            DB::table('product_values')->whereIn('id', $chunk)->delete();
        }
    }

    /**
     * @param  array<int, object>  $rows
     */
    private function countByLocale(array $rows): string
    {
        $counts = array_count_values(array_map(fn ($row) => $row->locale, $rows));
        ksort($counts);

        return $counts ? implode(', ', array_map(fn ($locale, $n) => "{$locale} {$n}", array_keys($counts), $counts)) : '-';
    }

    /**
     * @param  array<int, array<int, mixed>>  $log
     */
    private function exportCsv(array $log, bool $dryRun): string
    {
        $path = 'backups/move_base_locale_values_'.now()->format('Ymd_His').($dryRun ? '_dryrun' : '').'.csv';

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF"); // BOM — ให้ Excel อ่านภาษาไทยถูก
        fputcsv($handle, ['action', 'sku', 'attribute_code', 'row_id', 'locale', 'old_value', 'new_value']);
        foreach ($log as $row) {
            fputcsv($handle, $row);
        }
        rewind($handle);
        Storage::disk('local')->put($path, stream_get_contents($handle));
        fclose($handle);

        return Storage::disk('local')->path($path);
    }
}
