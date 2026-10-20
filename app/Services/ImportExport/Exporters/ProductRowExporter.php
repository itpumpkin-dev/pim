<?php

namespace App\Services\ImportExport\Exporters;

use App\Models\Attribute;
use App\Models\ExportConfig;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\ImportExport\Importers\ProductRowImporter;
use Illuminate\Support\Collection;

class ProductRowExporter implements RowExporterInterface, HasMediaFiles
{
    private ?array $columnsCache = null;

    /**
     * $user, when given, restricts columns()/rows() to attributes this
     * user's role can *view* (per AttributeAccessPolicy — both the
     * attribute itself and its Attribute Group, in every family it belongs
     * to) — null (the default) keeps every existing caller that doesn't
     * pass one unfiltered, matching the prior behavior.
     */
    public function __construct(private readonly ?User $user = null)
    {
    }

    public function columns(): array
    {
        return $this->columnsCache ??= array_merge(
            ProductRowImporter::FIXED_COLUMNS,
            // ทุก attribute ที่นำเข้ากลับได้ (ทุกตัวยกเว้น channel-based) — เดิมใช้ baseAttributeCodes()
            // (เฉพาะที่ไม่ใช่ locale-based) แต่ attribute เกือบทั้งหมดในระบบเป็น locale-based ไฟล์
            // ที่ส่งออกเลยเหลือแค่ sku/type/enabled/status ตัว importer แก้กติกานี้ไปแล้ว (ดู
            // ProductRowImporter::importableAttributeCodes()) ตัวนี้ตามให้ตรงกัน ไฟล์จะได้นำเข้ากลับได้
            app(AttributeAccessPolicy::class)->filterAttributeCodes($this->user, ProductRowImporter::importableAttributeCodes(), 'view'),
        );
    }

    /**
     * ค่าของแต่ละ attribute (attribute_id => value) จากแถว product_values ของสินค้าหนึ่งตัว
     * (scope channel = global) — ไฟล์มีคอลัมน์เดียวต่อ attribute เลยต้องเลือก "ค่าหลัก" ตัวเดียว:
     *   1. ไม่ระบุภาษา (locale_id NULL — ค่าที่ importer เขียนและทุก read path ใช้เป็น fallback)
     *   2. ภาษาตั้งต้นของระบบ (config app.locale) 3. ภาษาอื่นที่ id ต่ำสุด
     * แล้วภายในภาษาเดียวกัน: ไม่มี group ก่อน แล้วค่อย group id ต่ำสุด (เหมือน primaryGroupIdFor())
     * ข้ามค่าว่าง ไม่งั้นแถวว่างของภาษาหนึ่งจะบังค่าจริงของอีกภาษา
     *
     * @param  Collection<int, object{attribute_id:int, locale_id:?int, attribute_group_id:?int, value:?string}>  $rows
     * @return Collection<int, string>
     */
    public static function pickValues(Collection $rows, ?int $defaultLocaleId): Collection
    {
        return $rows
            ->filter(fn ($r) => $r->value !== null && $r->value !== '')
            ->sortBy(fn ($r) => sprintf(
                '%d|%d|%010d|%010d',
                $r->locale_id === null ? 0 : ((int) $r->locale_id === $defaultLocaleId ? 1 : 2),
                $r->attribute_group_id === null ? 0 : 1,
                (int) ($r->attribute_group_id ?? 0),
                (int) ($r->locale_id ?? 0),
            ))
            ->groupBy('attribute_id')
            ->map(fn (Collection $group) => (string) $group->first()->value);
    }

    public static function defaultLocaleId(): ?int
    {
        $id = Locale::where('code', config('app.locale'))->value('id');

        return $id !== null ? (int) $id : null;
    }

    public function rows(ExportConfig $config): \Generator
    {
        $attributeCodes = array_slice($this->columns(), count(ProductRowImporter::FIXED_COLUMNS));
        $attributesByCode = Attribute::whereIn('code', $attributeCodes)->get()->keyBy('code');
        $defaultLocaleId = self::defaultLocaleId();

        foreach (Product::with('family')->orderBy('id')->cursor() as $product) {
            // ตั้งแต่ 1 attribute อยู่ได้หลาย attribute_group_id พร้อมกัน (ดู
            // migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table)
            // อาจมีมากกว่า 1 แถวต่อ attribute ที่ scope นี้แล้ว — CSV export
            // ยังไม่รองรับคอลัมน์แยกตาม group (v1) เลยต้องเลือก "ค่าหลัก" แบบ
            // deterministic เดียวกับ primaryGroupIdFor() (ไม่มี group ก่อน
            // แล้วค่อย group id ต่ำสุด) — เรียงให้แถวที่ต้องการ "ชนะ" มาท้ายสุด
            // แล้วอาศัย pluck() ที่ key ซ้ำแล้วแถวหลังทับแถวก่อนหน้าเสมอ แทนที่
            // จะปล่อยให้ DB คืนแถวไหนมาก่อนก็ได้แบบสุ่ม
            $values = self::pickValues(
                ProductValue::where('product_id', $product->id)
                    ->whereNull('channel_id')
                    ->get(['attribute_id', 'locale_id', 'attribute_group_id', 'value']),
                $defaultLocaleId,
            );

            $row = [
                'sku' => $product->sku,
                'family_code' => $product->family?->code ?? '',
                'type' => $product->type,
                'enabled' => $product->enabled ? '1' : '0',
                'status' => $product->status,
            ];

            foreach ($attributesByCode as $code => $attribute) {
                $row[$code] = $values->get($attribute->id, '');
            }

            yield $row;
        }
    }

    public function mediaPaths(ExportConfig $config): iterable
    {
        $mediaAttributeIds = Attribute::whereIn('type', ['image', 'file', 'gallery', 'video'])->pluck('id');
        if ($mediaAttributeIds->isEmpty()) {
            return;
        }

        foreach (ProductValue::whereIn('attribute_id', $mediaAttributeIds)->whereNotNull('value')->cursor() as $value) {
            if ($value->value === '') {
                continue;
            }

            $decoded = json_decode($value->value, true);
            if (is_array($decoded)) {
                foreach ($decoded as $path) {
                    if (is_string($path) && $path !== '') {
                        yield $path;
                    }
                }
                continue;
            }

            yield $value->value;
        }
    }
}
