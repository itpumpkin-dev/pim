<?php

namespace App\Services\Catalog;

use App\Models\Locale;

/**
 * กติกาเดียวของ "ค่าของ attribute ในภาษา X" (DB cleanup Phase 2b):
 *   ภาษาที่ขอ → ภาษาหลัก (th) → แถว locale_id = NULL → (ถ้าอนุญาต) ภาษาอื่นที่ id ต่ำสุด
 *
 * ภาษาไทยเก็บที่แถว th — attribute แยกภาษา ทุกแถวมี locale_id ส่วน attribute ไม่แยกภาษามีแถว NULL
 * แถวเดียว แถว NULL ของ attribute แยกภาษายังเป็น fallback ไว้ (ข้อมูลเก่าก่อน pim:move-base-locale-values
 * และ attribute ที่เพิ่งเปลี่ยน is_locale_based) ทุกจุดที่อ่านค่ารายภาษาควรผ่านคลาสนี้ ไม่เขียนลำดับเอง
 *
 * จุดที่ "ห้าม" ถอยไปภาษาไทย (ช่องภาษาอังกฤษของ marketplace, TranslatePress) ไม่ใช้คลาสนี้
 */
final class LocaleFallback
{
    public const BASE_LOCALE_CODE = 'th';

    public static function baseLocaleId(): ?int
    {
        return Locale::idForCode(self::BASE_LOCALE_CODE);
    }

    /**
     * locale_id ที่ต้องเขียนเมื่อบันทึก "ค่าหลัก" (เนื้อหาภาษาไทย) ของ attribute — แยกภาษา = th,
     * ไม่แยกภาษา = NULL (import/ค่าเริ่มต้น/นำเข้ารูปจาก marketplace ใช้ตัวนี้ ไม่เขียน NULL ตรงๆ)
     * attribute ที่ต้องไม่ซ้ำ (pid, barcode_*) เป็นรหัส ใช้แถว NULL เสมอ — การเช็คค่าซ้ำดูแถว NULL
     * (ก่อนรัน pim:normalize-locale-values ตัวพวกนี้ยังติ๊กแยกภาษาอยู่)
     */
    public static function baseLocaleIdFor(object $attribute): ?int
    {
        return $attribute->is_locale_based && ! $attribute->is_unique ? self::baseLocaleId() : null;
    }

    /**
     * locale_id ที่ลองตามลำดับ (ไม่รวมแถว NULL ซึ่งเป็นลำดับถัดไปเสมอ)
     *
     * @return array<int, int>
     */
    public static function chain(?int $localeId): array
    {
        return array_values(array_unique(array_filter([$localeId, self::baseLocaleId()])));
    }

    /**
     * ORDER BY สำหรับ query ที่ดึงหลายภาษามาแล้วหยิบแถวแรก — แถวนอก chain อยู่ท้ายสุด เรียงตาม locale_id
     *
     * @return array{0: string, 1: array<int, int>}
     */
    public static function orderBy(?int $localeId, string $column = 'locale_id'): array
    {
        $chain = self::chain($localeId);
        $sql = 'CASE';
        foreach ($chain as $rank => $id) {
            $sql .= " WHEN {$column} = ? THEN {$rank}";
        }
        $sql .= " WHEN {$column} IS NULL THEN ".count($chain).' ELSE '.(count($chain) + 1)." END ASC, {$column} ASC";

        return [$sql, $chain];
    }

    /**
     * อันดับของแถวหนึ่งตามกติกา (ยิ่งน้อยยิ่งดี) — ใช้ sort collection ที่ดึงมาแล้ว
     */
    public static function rank(?int $rowLocaleId, ?int $localeId): int
    {
        $chain = self::chain($localeId);
        if ($rowLocaleId === null) {
            return count($chain);
        }
        $index = array_search((int) $rowLocaleId, $chain, true);

        return $index === false ? count($chain) + 1 : $index;
    }

    /**
     * แถวที่ดีที่สุดจาก rows ของ scope เดียว (product + attribute [+ group/channel]) — ข้ามค่าว่าง
     * $anyLocale = false: ไม่หยิบภาษาอื่นนอก chain (เช่น ไม่เอาภาษาจีนมาแสดงแทนภาษาอังกฤษ)
     *
     * @template T of object
     *
     * @param  iterable<T>  $rows  แต่ละแถวมี ->locale_id และ ->value
     * @return T|null
     */
    public static function pick(iterable $rows, ?int $localeId, bool $anyLocale = false): ?object
    {
        $chainLength = count(self::chain($localeId));
        $best = null;
        $bestRank = PHP_INT_MAX;

        foreach ($rows as $row) {
            if ($row->value === null || $row->value === '') {
                continue;
            }
            $rank = self::rank($row->locale_id === null ? null : (int) $row->locale_id, $localeId);
            if ($rank > $chainLength && ! $anyLocale) {
                continue;
            }
            if ($rank < $bestRank || ($rank === $bestRank && $best !== null && (int) $row->locale_id < (int) $best->locale_id)) {
                $best = $row;
                $bestRank = $rank;
            }
        }

        return $best;
    }
}
