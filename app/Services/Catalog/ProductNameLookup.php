<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\Locale;
use App\Models\ProductValue;

/**
 * ชื่อสินค้า (pname) ในภาษาที่ผู้ใช้เปิดหน้าจออยู่ ตามกติกา LocaleFallback — แทน helper หน้าตาเดียวกัน
 * ที่เคยมีอยู่ใน ProductController/GlobalSearch/BOM/วัตถุดิบ/หน้า matching ฯลฯ ซึ่งแต่ละที่ fallback
 * ไม่เหมือนกัน (บางที่ไม่มองแถว th เลย)
 */
final class ProductNameLookup
{
    /**
     * @param  iterable<int>  $productIds
     * @param  int|null  $localeId  null = ภาษาของหน้าจอปัจจุบัน
     * @return array<int, string> product_id => ชื่อ (สินค้าที่ไม่มีชื่อเลยจะไม่อยู่ใน array)
     */
    public static function names(iterable $productIds, ?int $localeId = null): array
    {
        $ids = collect($productIds)->filter()->unique()->values();
        $nameAttributeId = Attribute::idForCode('pname');
        if (! $nameAttributeId || $ids->isEmpty()) {
            return [];
        }

        $localeId ??= Locale::idForCode(app()->getLocale());

        $names = [];
        $rowsByProduct = ProductValue::whereIn('product_id', $ids)
            ->where('attribute_id', $nameAttributeId)
            ->whereNull('channel_id')
            ->orderByRaw('COALESCE(attribute_group_id, -1) ASC') // ไม่มี group ก่อน แล้วค่อย group id ต่ำสุด
            ->get(['product_id', 'locale_id', 'value'])
            ->groupBy('product_id');

        foreach ($rowsByProduct as $productId => $rows) {
            $row = LocaleFallback::pick($rows, $localeId, anyLocale: true);
            if ($row !== null) {
                $names[(int) $productId] = $row->value;
            }
        }

        return $names;
    }
}
