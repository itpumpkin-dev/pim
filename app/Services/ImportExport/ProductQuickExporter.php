<?php

namespace App\Services\ImportExport;

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use App\Services\ImportExport\Exporters\ProductRowExporter;
use App\Services\ImportExport\Importers\ProductRowImporter;
use Illuminate\Support\Traits\Localizable;

/**
 * "ส่งออกด่วน" ของหน้ารายการสินค้า — เดิมอยู่ใน ProductController::quickExport() และสร้าง
 * ไฟล์ระหว่าง request เลย ตั้งแต่ส่งออกได้ครบทุก attribute (~730 คอลัมน์) ไฟล์ทั้งระบบใช้เวลา
 * เกิน max_execution_time (60 วินาที) เลยย้ายมาเป็น service ให้ QuickExportProductsJob เรียก
 * ในคิวแทน แล้วแจ้งผลที่กระดิ่ง
 */
class ProductQuickExporter
{
    use Localizable;

    /**
     * @param  array{format:string, ids?:array<int,int>, search?:?string, columns?:array<int,string>, types?:array<int,string>, category_id?:?int}  $params
     * @param  (callable(int): void)|null  $afterChunk  เรียกหลังเขียนครบแต่ละชุด 500 แถว (ส่งจำนวนแถวสะสม) — QuickExportProductsJob
     *         ใช้เช็คคำขอยกเลิก แล้ว throw JobCancelledException ออกมาจาก generator นี้
     * @return int จำนวนแถวที่เขียน
     */
    public function write(?User $user, array $params, string $absolutePath, ?callable $afterChunk = null): int
    {
        $format = $params['format'];
        $ids = $params['ids'] ?? [];

        $allColumns = (new ProductRowExporter($user))->columns();
        // ไม่ได้เลือกคอลัมน์มา = ทุกคอลัมน์ ถ้าเลือกมาก็เอาแค่ที่ตรงกัน (เรียงตาม $allColumns)
        // sku ถูกเก็บไว้เสมอ ให้ทุกแถวยังมี identity แม้แอดมินจะไม่ได้ติ๊ก sku
        $selectedColumns = ! empty($params['columns'])
            ? array_values(array_intersect($allColumns, $params['columns']))
            : $allColumns;
        if (! in_array('sku', $selectedColumns, true)) {
            array_unshift($selectedColumns, 'sku');
        }
        $selectedSet = array_flip($selectedColumns);

        // เฉพาะ attribute ที่ถูกเลือก — เดิมวน in_array($code, $selectedColumns) ทุก attribute ของ
        // ทุกสินค้า (730 × 730 × จำนวนสินค้า) ซึ่งเป็นตัวที่ทำให้ไฟล์ทั้งระบบช้าจนเกินเวลา
        $attributeCodes = array_values(array_filter(
            array_slice($allColumns, count(ProductRowImporter::FIXED_COLUMNS)),
            fn ($code) => isset($selectedSet[$code]),
        ));
        $attributesByCode = Attribute::whereIn('code', $attributeCodes)->get(['id', 'code', 'name'])->keyBy('code');

        $query = Product::with('family')->orderBy('id');
        if (! empty($ids)) {
            // ติ๊กเลือกแถวมาชัดเจน = เอาแค่สินค้ากลุ่มนี้ ฟิลเตอร์อื่นไม่ใช้
            $query->whereIn('id', $ids);
        } else {
            if (! empty($params['search'])) {
                $query->where('sku', 'ilike', '%'.$params['search'].'%');
            }
            if (! empty($params['types'])) {
                $query->whereIn('type', $params['types']);
            }
            if (! empty($params['category_id'])) {
                $query->whereHas('categories', fn ($q) => $q->where('categories.id', $params['category_id']));
            }
        }

        $defaultLocaleId = ProductRowExporter::defaultLocaleId();
        $attributeIds = $attributesByCode->pluck('id')->all();
        $rowCount = 0;

        $rows = (function () use ($query, $attributesByCode, $attributeIds, $selectedSet, $defaultLocaleId, $afterChunk, &$rowCount) {
            foreach ($query->cursor()->chunk(500) as $products) {
                // ทุกภาษา ไม่ใช่แค่ locale_id NULL — attribute เกือบทั้งหมดเป็น locale-based
                // ProductRowExporter::pickValues() เลือกค่าหลักให้
                $valuesByProduct = empty($attributeIds)
                    ? collect()
                    : ProductValue::whereIn('product_id', $products->pluck('id'))
                        ->whereNull('channel_id')
                        ->whereIn('attribute_id', $attributeIds)
                        ->get(['product_id', 'attribute_id', 'locale_id', 'attribute_group_id', 'value'])
                        ->groupBy('product_id');

                foreach ($products as $product) {
                    $values = ProductRowExporter::pickValues($valuesByProduct->get($product->id, collect()), $defaultLocaleId);

                    $row = array_intersect_key([
                        'sku' => $product->sku,
                        'family_code' => $product->family?->code ?? '',
                        'type' => $product->type,
                        'enabled' => $product->enabled ? '1' : '0',
                        'status' => $product->status,
                    ], $selectedSet);

                    foreach ($attributesByCode as $code => $attribute) {
                        $row[$code] = $values->get($attribute->id, '');
                    }

                    $rowCount++;
                    yield $row;
                }

                if ($afterChunk) {
                    $afterChunk($rowCount);
                }
            }
        })();

        // หัวคอลัมน์เป็นชื่อ (ภาษาที่ผู้ใช้เปิดหน้าจออยู่) แทน code — ไฟล์ยังนำเข้ากลับได้เพราะ
        // RowHeaderNormalizer แปลงชื่อกลับเป็น code ให้ตอน import (ชื่อที่ชนกันใช้ code แทน ดู headerLabels())
        $headers = $this->headerLabels($selectedColumns, $attributesByCode, $params['locale'] ?? app()->getLocale());
        SpreadsheetWriter::write($absolutePath, $format, $selectedColumns, $rows, ',', $headers);

        return $rowCount;
    }

    /**
     * index => ชื่อหัวคอลัมน์ ตามลำดับ $columns — attribute ใช้ label ของ locale นั้น
     * (ไม่มีก็ name แล้วค่อย code) คอลัมน์คงที่ใช้ import.columns.* ชุดเดียวกับ template นำเข้า
     *
     * ชื่อไม่ได้บังคับ unique — ถ้าสองคอลัมน์ได้ชื่อเดียวกัน (หรือชื่อไปตรงกับ code ของอีกคอลัมน์)
     * ตอนนำเข้ากลับ RowHeaderNormalizer จะ map ทั้งคู่ไป code เดียว ค่าคอลัมน์หนึ่งทับอีกคอลัมน์
     * แบบเงียบๆ คอลัมน์ที่ชนกันเลยใช้ code ดิบ ซึ่ง normalizer รับตรงๆ อยู่แล้ว
     *
     * @param  array<int, string>  $columns
     * @return array<int, string>
     */
    private function headerLabels(array $columns, \Illuminate\Support\Collection $attributesByCode, string $locale): array
    {
        $localeId = Locale::idForCode($locale);

        $labels = $this->withLocale($locale, fn () => array_map(function (string $code) use ($attributesByCode, $localeId) {
            $attribute = $attributesByCode->get($code);
            if (! $attribute) {
                $label = __("import.columns.{$code}");

                return $label === "import.columns.{$code}" ? $code : $label;
            }

            $translation = $localeId ? $attribute->translations->firstWhere('locale_id', $localeId) : null;

            return ($translation && trim((string) $translation->label) !== '')
                ? $translation->label
                : ($attribute->getRawOriginal('name') ?: $code);
        }, $columns));

        // key แบบเดียวกับ RowHeaderNormalizer::key() — ตัวพิมพ์/ช่องว่างต่างกันก็นับว่าชนกัน
        $key = fn (string $value) => mb_strtolower(trim($value));
        $labelCounts = array_count_values(array_map($key, $labels));
        $codeKeys = array_flip(array_map($key, $columns));

        foreach ($labels as $i => $label) {
            $k = $key($label);
            if ($labelCounts[$k] > 1 || (isset($codeKeys[$k]) && $k !== $key($columns[$i]))) {
                $labels[$i] = $columns[$i];
            }
        }

        return $labels;
    }
}
