<?php

namespace App\Services\Catalog;

use App\Models\FamilyAttribute;
use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * ตระกูลแอตทริบิวต์ที่ "มีผลจริง" กับสินค้าหนึ่งตัวตอนนี้ และ family_attributes
 * ที่รวมมาจากทุกตระกูลเหล่านั้น — เดิมเป็น private method บน ProductController
 * (effectiveFamilyIds()/resolveEffectiveFamilyAttributes()) ย้ายออกมาเป็น
 * service แยกเพื่อให้ใช้ซ้ำได้จากที่อื่นนอก ProductController เช่น backfill
 * command ที่ต้อง reproduce ตรรกะ "attribute ตัวนี้ของสินค้าตัวนี้ควรอยู่ group
 * ไหนบ้างตอนนี้" ให้ตรงกับหน้าแก้ไขสินค้าเป๊ะๆ, และ primaryGroupIdFor() ที่ระบบ
 * อื่น (marketplace sync, import/export, AI แปลภาษา ฯลฯ) ที่ยังไม่รองรับ
 * หลาย group ต่อ attribute ใช้เลือก "ค่าหลัก" ตัวเดียวแบบ deterministic
 */
class EffectiveFamilyAttributeResolver
{
    /**
     * ดึงจากตระกูลที่ผูกกับกลุ่มสินค้า (categories) ที่สินค้านี้อยู่ทุกตัว (ดู
     * Category::attributeFamilies() — เรียงตาม sort_order ที่ตั้งไว้ในหน้าแก้ไข
     * กลุ่มสินค้า) เพราะงั้นถ้ามีคนไปเพิ่มตระกูลที่ 2 ให้กลุ่มสินค้าทีหลัง สินค้าเดิม
     * ที่อยู่ในกลุ่มนั้นจะเห็นแอตทริบิวต์ของตระกูลใหม่ทันทีตอนเปิดแก้ไข โดยไม่ต้อง
     * แก้อะไรที่ตัวสินค้าเองเลย ไม่มี fallback กลับไปที่ product.family_id เดิม —
     * ยังไม่ได้ผูกกลุ่มสินค้ากับตระกูลไหนเลย = ไม่มีตระกูล ไม่ว่า family_id เดิม
     * จะมีค่าค้างอยู่หรือไม่ก็ตาม
     *
     * @return array<int, int>  ลำดับที่ใช้ตอนแสดงผล (family ที่มาก่อนในลิสต์นี้
     *                            แสดงก่อน) รองรับได้มากกว่า 1 ตระกูลพร้อมกันเสมอ —
     *                            ดู resolveEffectiveFamilyAttributes() สำหรับวิธี
     *                            รวม attribute ของหลายตระกูลเข้าด้วยกัน
     *
     * สินค้าผูกกับหลายระดับพร้อมกัน (หมวดหมู่ → หมวดหมู่ย่อย → กลุ่มสินค้า — ดู
     * ProductCategoryLinker) และ sort_order นับแยกต่อหมวดหมู่ (ทุกหมวดหมู่เริ่มที่ 0)
     * เดิมเรียงด้วย sort_order อย่างเดียว ตระกูลของคนละหมวดหมู่ที่ sort_order เท่ากัน
     * เลยออกมาลำดับไหนก็ได้ (PostgreSQL ไม่การันตีลำดับของค่าที่เท่ากัน) — เช่นตระกูล
     * "สเปค" ที่ผูกไว้ที่หมวดหมู่แม่ด้วย แซงตระกูล "พื้นฐาน" ที่กลุ่มสินค้าตั้งเป็นตัว
     * แรก ตอนนี้หมวดหมู่ที่เฉพาะเจาะจงกว่า (ลึกกว่า = กลุ่มสินค้า) มาก่อน แล้วค่อย
     * sort_order ภายในหมวดหมู่นั้น — ลำดับที่ตั้งในหน้าแก้ไขกลุ่มสินค้าจึงเป็นหลักเสมอ
     */
    public function effectiveFamilyIds(Product $product): array
    {
        $categoryIds = $product->relationLoaded('categories')
            ? $product->categories->pluck('id')
            : $product->categories()->pluck('categories.id');

        if ($categoryIds->isEmpty()) {
            return [];
        }

        $depthByCategory = $this->categoryDepths($categoryIds->all());

        return DB::table('category_attribute_family')
            ->whereIn('category_id', $categoryIds)
            ->get(['category_id', 'family_id', 'sort_order'])
            ->sortBy([
                fn ($a, $b) => ($depthByCategory[$b->category_id] ?? 0) <=> ($depthByCategory[$a->category_id] ?? 0),
                fn ($a, $b) => $a->sort_order <=> $b->sort_order,
                fn ($a, $b) => $a->category_id <=> $b->category_id,
            ])
            ->pluck('family_id')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * ความลึกของแต่ละหมวดหมู่ในต้นไม้ (root = 0) — ไล่ parent_id ขึ้นไปทีละชั้น
     * ต้นไม้หมวดหมู่ตื้น (3–4 ชั้น) เลยใช้ query ต่อชั้นได้โดยไม่ต้องพึ่ง recursive CTE
     *
     * @param  array<int, int>  $categoryIds
     * @return array<int, int>
     */
    private function categoryDepths(array $categoryIds): array
    {
        $parentOf = [];
        $pending = $categoryIds;
        while ($pending !== []) {
            $rows = DB::table('categories')->whereIn('id', $pending)->pluck('parent_id', 'id');
            $pending = [];
            foreach ($rows as $id => $parentId) {
                $parentOf[$id] = $parentId;
                if ($parentId !== null && ! array_key_exists($parentId, $parentOf)) {
                    $pending[] = $parentId;
                }
            }
            $pending = array_values(array_unique(array_diff($pending, array_keys($parentOf))));
        }

        $depths = [];
        foreach ($categoryIds as $id) {
            $depth = 0;
            $seen = [];
            for ($cur = $parentOf[$id] ?? null; $cur !== null && ! isset($seen[$cur]); $cur = $parentOf[$cur] ?? null) {
                $seen[$cur] = true;
                $depth++;
            }
            $depths[$id] = $depth;
        }

        return $depths;
    }

    /**
     * รวม family_attributes ของทุก family ที่มีผลกับสินค้า ($effectiveFamilyIds
     * จาก effectiveFamilyIds() — เรียงตามลำดับความสำคัญ) เข้าเป็นชุดเดียว
     *
     * ตั้งใจให้รองรับ "ตระกูลพื้นฐานได้มากกว่า 1" — ถ้า attribute ตัวเดียวกันถูก
     * ผูกอยู่ในหลาย family พร้อมกัน (เช่น family "พื้นฐาน" ผูกไว้ใน group ทั่วไป
     * และ family เฉพาะสินค้าอีกตัวผูกไว้ใน group ของตัวเอง) ทุก family จะได้แสดง
     * group ของตัวเองครบ ไม่มี family ไหน "ชนะ" แล้วบัง group ของอีก family ทิ้ง
     * ไปทั้งกลุ่ม — ลำดับความสำคัญใน effectiveFamilyIds() ตอนนี้มีผลแค่ "ลำดับการ
     * แสดงผล" เท่านั้น ไม่ได้ใช้ตัดสินว่า family ไหนมีสิทธิ์แสดง attribute นั้นอีกต่อไป
     *
     * กันซ้ำแค่ระดับคู่ (attribute_id, attribute_group_id) เดียวกันเป๊ะๆ เท่านั้น
     * (เผื่อกรณีคนไปตั้ง 2 family ให้ผูก attribute ตัวเดียวกันไว้ใน group เดียวกัน
     * เป๊ะๆ โดยบังเอิญ — ไม่งั้นจะเห็นฟิลด์เดียวกันซ้ำสองแถวในแผงเดียวกัน) ส่วน
     * attribute เดียวกันที่อยู่คนละ group (ไม่ว่าจะอยู่ family เดียวกันหรือคนละ
     * family) ถือเป็นคนละตำแหน่งที่ต้องแสดงทั้งคู่ — ตั้งแต่ product_values มี
     * attribute_group_id แล้ว (migration
     * 2026_09_23_000001_add_attribute_group_id_to_product_values_table) แต่ละ
     * ตำแหน่งเก็บค่าของตัวเองแยกกันจริงๆ ไม่แชร์กันอีกต่อไป
     *
     * @param  array<int, int>  $effectiveFamilyIds
     * @param  array<int, string>  $with  relation ให้ eager-load บน FamilyAttribute
     */
    public function resolveEffectiveFamilyAttributes(array $effectiveFamilyIds, array $with = []): Collection
    {
        $familyAttributesByFamily = FamilyAttribute::with($with)
            ->whereIn('family_id', $effectiveFamilyIds)
            ->orderBy('sort_order')
            ->get()
            ->groupBy('family_id');

        $resolved = collect();
        $seenPairs = [];

        foreach ($effectiveFamilyIds as $familyId) {
            $rowsForFamily = $familyAttributesByFamily->get($familyId, collect())
                ->reject(function (FamilyAttribute $row) use (&$seenPairs) {
                    $pairKey = $row->attribute_id.'-'.$row->attribute_group_id;
                    if (isset($seenPairs[$pairKey])) {
                        return true;
                    }
                    $seenPairs[$pairKey] = true;

                    return false;
                });

            $resolved = $resolved->merge($rowsForFamily);
        }

        return $resolved->values();
    }

    /**
     * "ค่าหลัก" ของ attribute หนึ่งตัวแบบ deterministic — สำหรับระบบที่ยังไม่
     * รองรับหลาย group ต่อ attribute (marketplace sync, CSV import/export,
     * ระบบแปลภาษา AI, storefront, external API) ที่ยังอ่าน/เขียน product_values
     * แบบ "1 attribute = 1 ค่า" อยู่ — ไม่สุ่มว่า DB จะคืนแถวไหนมาก่อน แต่เลือก
     * ตามกติกาคงที่เสมอ: ไม่มี group (NULL) มาก่อน ถ้าไม่มีเลยค่อยเอา group_id
     * ต่ำสุดในบรรดาตำแหน่งที่ attribute นี้ถูกผูกไว้จริงๆ ตอนนี้
     *
     * คืน null ทั้งกรณี "attribute ไม่มี placement เป็น group เลย" (เช่น
     * attribute ระบบอย่าง pcatname/price_std ที่ไม่เคยอยู่ใน family_attributes)
     * และกรณี "attribute ไม่ได้ถูกผูกไว้ใน family ที่ effectiveFamilyIds() ให้มา
     * เลย" — ทั้งสองแปลว่า "ใช้แถว attribute_group_id เป็น NULL" เหมือนกัน
     *
     * @param  array<int, int>  $effectiveFamilyIds
     */
    public function primaryGroupIdFor(int $attributeId, array $effectiveFamilyIds): ?int
    {
        if (empty($effectiveFamilyIds)) {
            return null;
        }

        $groupIds = FamilyAttribute::whereIn('family_id', $effectiveFamilyIds)
            ->where('attribute_id', $attributeId)
            ->whereNotNull('attribute_group_id')
            ->pluck('attribute_group_id')
            ->unique();

        if ($groupIds->isEmpty()) {
            return null;
        }

        return (int) $groupIds->sort()->first();
    }
}
