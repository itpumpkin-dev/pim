<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Models\LazadaAttributeMapping;
use App\Models\Product;
use App\Models\ShopeeAttributeMapping;
use App\Models\TikTokAttributeMapping;
use App\Models\WooCommerceAttributeMapping;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;
use App\Services\Catalog\LocaleFallback;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * DB cleanup Phase 3a — รวม attribute master ที่ซ้ำกัน (เก็บตัวที่โค้ดใช้จริง):
 *   brand → pbrand, attribute_13 → producttype
 * และแก้ unitinfo ที่ถูกผูกกับ master หน่วยนับผิด (เป็นข้อความ "ขนาด" เช่น "290 ML/หลอด" ที่หน้าร้านโชว์
 * เป็น size — ไม่ใช่หน่วยนับ pbaseunit) ให้กลับเป็น text
 *
 * ต่อคู่ที่รวม: ค่าที่ตัวหลักยังไม่มีย้ายไปตัวหลัก (มีแล้ว = ทิ้งค่าตัวรอง), mapping marketplace ย้ายไปตัวหลัก
 * (option mapping จับคู่ตาม option code — ถ้าตัวหลักมี mapping ของ platform นั้นอยู่แล้ว mapping ตัวรองถูกลบ),
 * เอาออกจาก family, ปลด master_source (ไม่ให้ catalog:sync-master-options sync ต่อ) แล้ว soft-delete
 * แถวที่แก้/ลบ export เป็น CSV ใน storage/app/backups ก่อนเสมอ
 */
class MergeDuplicateMastersCommand extends Command
{
    protected $signature = 'pim:merge-duplicate-masters {--dry-run : แสดงสรุป + export CSV โดยไม่แก้จริง}';

    protected $description = 'Phase 3a: merge duplicate master attributes (brand→pbrand, attribute_13→producttype) and turn unitinfo back into a text field.';

    /** ตัวรอง => ตัวหลัก */
    public const MERGES = ['brand' => 'pbrand', 'attribute_13' => 'producttype'];

    /** ตาราง mapping marketplace => คอลัมน์ FK ของตาราง option mapping (null = ไม่มี option mapping) */
    private const MAPPING_TABLES = [
        'lazada_attribute_mappings' => ['lazada_attribute_option_mappings', 'lazada_attribute_mapping_id'],
        'shopee_attribute_mappings' => ['shopee_attribute_option_mappings', 'shopee_attribute_mapping_id'],
        'tiktok_attribute_mappings' => ['tiktok_attribute_option_mappings', 'tiktok_attribute_mapping_id'],
        'woocommerce_attribute_mappings' => null,
    ];

    private const PRODUCT_TYPE_LABEL = 'ประเภทสินค้า';

    /** @var array<int, array<int, mixed>> */
    private array $log = [];

    public function handle(EffectiveFamilyAttributeResolver $families): int
    {
        $dryRun = (bool) $this->option('dry-run');

        DB::beginTransaction();
        try {
            foreach (self::MERGES as $fromCode => $toCode) {
                $this->merge($fromCode, $toCode, $families);
            }
            $this->fixUnitInfo();
            $this->renameProductType();

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

        Attribute::bumpCodeMapVersion();
        Attribute::bumpListVersion();
        // mapping แก้ผ่าน DB::table — cache รายการ mapping (rememberForever) ต้องล้างเอง ไม่งั้น sync
        // marketplace ยังอ่าน mapping เก่าที่ชี้ไปที่ attribute ที่ถูกลบ
        LazadaAttributeMapping::bumpListVersion();
        ShopeeAttributeMapping::bumpListVersion();
        TikTokAttributeMapping::bumpListVersion();
        WooCommerceAttributeMapping::bumpListVersion();
        $this->info('Done.');

        return self::SUCCESS;
    }

    private function merge(string $fromCode, string $toCode, EffectiveFamilyAttributeResolver $families): void
    {
        $from = Attribute::where('code', $fromCode)->first();
        $to = Attribute::where('code', $toCode)->first();
        if (! $from || ! $to) {
            $this->line("{$fromCode} → {$toCode}: skipped (".(! $from ? "{$fromCode} not found / already deleted" : "{$toCode} not found").')');

            return;
        }

        // 1. ค่า — ตัวหลักมีค่าของสินค้านี้ (channel เดียวกัน ภาษาใดก็ได้ — คู่ที่รวมเป็น select ไม่แยกภาษา)
        // อยู่แล้ว = ทิ้ง ไม่งั้นย้ายไปตัวหลัก
        $moved = $dropped = $differ = 0;
        foreach (DB::table('product_values')->where('attribute_id', $from->id)->orderBy('id')->get() as $row) {
            $existing = DB::table('product_values')
                ->where('product_id', $row->product_id)->where('attribute_id', $to->id)
                ->where('channel_id', $row->channel_id)
                ->orderByRaw('locale_id IS NOT NULL') // แถว NULL ก่อน
                ->value('value');
            $sku = Product::whereKey($row->product_id)->value('sku');

            if ($existing !== null) {
                $dropped++;
                if ($existing !== $row->value) {
                    $differ++;
                }
                $this->log[] = ['drop_value', $fromCode, $sku, $row->id, $row->value, $existing];
                DB::table('product_values')->where('id', $row->id)->delete();

                continue;
            }

            $product = Product::find($row->product_id);
            $groupId = $families->primaryGroupIdFor($to->id, $families->effectiveFamilyIds($product));
            $this->log[] = ['move_value', $fromCode, $sku, $row->id, $row->value, "{$toCode} (group ".($groupId ?? 'none').')'];
            DB::table('product_values')->where('id', $row->id)->update([
                'attribute_id' => $to->id,
                'attribute_group_id' => $groupId,
                // ตัวหลักแยกภาษา: แถว NULL ของตัวรองเป็นเนื้อหาภาษาไทย → th (กติกา Phase 2b)
                'locale_id' => $to->is_locale_based ? ($row->locale_id ?? LocaleFallback::baseLocaleIdFor($to)) : null,
            ]);
            $moved++;
        }

        // 2. mapping marketplace
        $mappingNotes = [];
        foreach (self::MAPPING_TABLES as $table => $optionTable) {
            foreach (DB::table($table)->where('attribute_id', $from->id)->get() as $mapping) {
                $platform = str_replace('_attribute_mappings', '', $table);
                if (DB::table($table)->where('attribute_id', $to->id)->exists()) {
                    $this->log[] = ['delete_mapping', $fromCode, $platform, $mapping->id, json_encode($mapping, JSON_UNESCAPED_UNICODE), "{$toCode} already mapped"];
                    DB::table($table)->where('id', $mapping->id)->delete(); // option mapping ลบตาม (cascade)
                    $mappingNotes[] = "{$platform}: removed ({$toCode} already has a {$platform} mapping)";

                    continue;
                }

                $this->log[] = ['move_mapping', $fromCode, $platform, $mapping->id, json_encode($mapping, JSON_UNESCAPED_UNICODE), $toCode];
                DB::table($table)->where('id', $mapping->id)->update(['attribute_id' => $to->id]);
                $remapped = $optionTable ? $this->remapOptionMappings($optionTable[0], $optionTable[1], $mapping->id, $from->id, $to->id, $fromCode) : 0;
                $mappingNotes[] = "{$platform}: moved to {$toCode}".($optionTable ? " ({$remapped} option mapping(s) remapped)" : '');
            }
        }

        // 3. family, master binding, soft-delete
        $placements = DB::table('family_attributes')->where('attribute_id', $from->id)->count();
        if ($placements) {
            $this->log[] = ['delete_family_placements', $fromCode, '', '', $placements, ''];
            DB::table('family_attributes')->where('attribute_id', $from->id)->delete();
        }
        $from->forceFill(['master_source' => null])->save();
        $from->delete();
        $this->log[] = ['soft_delete_attribute', $fromCode, '', $from->id, '', "merged into {$toCode}"];

        $this->line("{$fromCode} → {$toCode}:");
        $this->line("   values: {$moved} moved, {$dropped} dropped ({$toCode} already had a value; {$differ} different)");
        $this->line('   marketplace mappings: '.($mappingNotes ? implode('; ', $mappingNotes) : 'none'));
        $this->line("   family placements removed: {$placements}; {$fromCode} unbound from master and soft-deleted");
    }

    private function remapOptionMappings(string $table, string $fkColumn, int $mappingId, int $fromAttributeId, int $toAttributeId, string $fromCode): int
    {
        $remapped = 0;
        $rows = DB::table($table)->where($fkColumn, $mappingId)
            ->join('attribute_options', 'attribute_options.id', '=', "{$table}.attribute_option_id")
            ->where('attribute_options.attribute_id', $fromAttributeId)
            ->get(["{$table}.id", 'attribute_options.code']);

        foreach ($rows as $row) {
            $targetOptionId = DB::table('attribute_options')->where('attribute_id', $toAttributeId)->where('code', $row->code)->value('id');
            $taken = $targetOptionId && DB::table($table)->where($fkColumn, $mappingId)->where('attribute_option_id', $targetOptionId)->exists();

            if (! $targetOptionId || $taken) {
                $this->log[] = ['delete_option_mapping', $fromCode, $table, $row->id, $row->code, $targetOptionId ? 'target option already mapped' : 'no option with this code'];
                DB::table($table)->where('id', $row->id)->delete();

                continue;
            }

            DB::table($table)->where('id', $row->id)->update(['attribute_option_id' => $targetOptionId]);
            $remapped++;
        }

        return $remapped;
    }

    private function fixUnitInfo(): void
    {
        $unitInfo = Attribute::where('code', 'unitinfo')->first();
        if (! $unitInfo || ($unitInfo->type === 'text' && $unitInfo->master_source === null)) {
            $this->line('unitinfo: already a text field — skipped');

            return;
        }

        $oldType = $unitInfo->type;
        $options = DB::table('attribute_options')->where('attribute_id', $unitInfo->id)->get(['id', 'code']);
        $values = DB::table('product_values')->where('attribute_id', $unitInfo->id)->count();
        $this->log[] = ['unitinfo_to_text', 'unitinfo', $unitInfo->type, $unitInfo->id, (string) $unitInfo->master_source, 'text'];
        foreach ($options as $option) {
            $this->log[] = ['delete_option', 'unitinfo', '', $option->id, $option->code, ''];
        }
        DB::table('attribute_options')->where('attribute_id', $unitInfo->id)->delete();
        $unitInfo->forceFill(['type' => 'text', 'master_source' => null, 'swatch_type' => null])->save();

        $this->line("unitinfo: {$oldType} bound to master → text; {$options->count()} synced option(s) removed; {$values} product value(s) kept as-is");
    }

    private function renameProductType(): void
    {
        $productType = Attribute::where('code', 'producttype')->first();
        $thId = DB::table('locales')->where('code', 'th')->value('id');
        if (! $productType) {
            return;
        }

        $changes = [];
        $rawName = $productType->getRawOriginal('name'); // ->name แปลตามภาษาหน้าจอ (accessor)
        if ($rawName !== self::PRODUCT_TYPE_LABEL) {
            $this->log[] = ['rename', 'producttype', 'name', $productType->id, $rawName, self::PRODUCT_TYPE_LABEL];
            $changes[] = "name \"{$rawName}\"";
            $productType->forceFill(['name' => self::PRODUCT_TYPE_LABEL])->save();
        }
        if ($thId) {
            $label = DB::table('attribute_translations')->where('attribute_id', $productType->id)->where('locale_id', $thId)->value('label');
            if ($label !== null && $label !== self::PRODUCT_TYPE_LABEL) {
                $this->log[] = ['rename', 'producttype', 'th label', $productType->id, $label, self::PRODUCT_TYPE_LABEL];
                $changes[] = "th label \"{$label}\"";
                DB::table('attribute_translations')->where('attribute_id', $productType->id)->where('locale_id', $thId)
                    ->update(['label' => self::PRODUCT_TYPE_LABEL, 'updated_at' => now()]);
            }
        }

        $this->line('producttype: '.($changes ? implode(', ', $changes).' → "'.self::PRODUCT_TYPE_LABEL.'"' : 'label already correct'));
    }

    private function exportCsv(bool $dryRun): string
    {
        $path = 'backups/merge_duplicate_masters_'.now()->format('Ymd_His').($dryRun ? '_dryrun' : '').'.csv';

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, "\xEF\xBB\xBF"); // BOM — ให้ Excel อ่านภาษาไทยถูก
        fputcsv($handle, ['action', 'attribute', 'detail', 'row_id', 'old_value', 'new_value']);
        foreach ($this->log as $row) {
            fputcsv($handle, $row);
        }
        rewind($handle);
        Storage::disk('local')->put($path, stream_get_contents($handle));
        fclose($handle);

        return Storage::disk('local')->path($path);
    }
}
