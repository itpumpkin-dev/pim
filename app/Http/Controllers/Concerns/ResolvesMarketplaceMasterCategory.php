<?php

namespace App\Http\Controllers\Concerns;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Collection;

/**
 * ใช้ร่วมกันโดย LazadaAttributeMappingController::lazadaProducts() และ
 * ShopeeAttributeMappingController::shopeeProducts() — เดิม duplicate โค้ด
 * เดียวกันเป๊ะไว้ 2 ที่ (ตามธรรมเนียม "mirror ข้าม platform" ของงานชุดนี้) แต่
 * ตัวนี้ซับซ้อนพอที่ future fix จะพลาดแก้ไม่ครบทั้งคู่ได้ง่าย (พบจาก code
 * review) เลยดึงออกมาเป็น trait กลางแทน
 */
trait ResolvesMarketplaceMasterCategory
{
    /**
     * เลือก "Master Category" ที่ควรใช้แทนสินค้าตัวนี้สำหรับแสดงผล (ทั้ง
     * คอลัมน์ Master Category ในตาราง และ facet "PIM: ..." บนหัว Object Page
     * — สองที่นี้ใช้ข้อมูลชุดเดียวกัน เพราะ Object Page แค่ set state จาก row
     * ที่คลิกในตาราง ไม่ได้ fetch ซ้ำ) — สินค้าหนึ่งตัวอาจถูกผูกกับหลาย
     * หมวดหมู่พร้อมกันในสายเดียวกัน (ตัวเลือกหมวดหมู่ที่หน้าแก้ไขสินค้า
     * auto-check หมวดแม่ขึ้นไปจนถึง root ให้เองเสมอ — ดู pattern เดียวกันที่
     * ProductController's SKU-search action ใช้อยู่แล้ว) เดิมใช้
     * `$product->categories->first()` เฉยๆ ซึ่งสุ่มได้ตัว "แม่" (root, ไม่มี
     * parent ของตัวเอง เลย path ว่างเปล่า มองไม่เห็นสาย sub-category เลยแม้จะ
     * มีจริง — บั๊กที่ผู้ใช้เจอ) แทนที่จะเป็นตัวที่ลึกที่สุด (product group
     * จริง ที่ path จะไล่ขึ้นไปถึง root ให้ครบเองอยู่แล้ว) — กรอง ancestor id
     * ออกก่อนเหมือน ProductController::searchBySku() แล้วถ้ามีหลายสาย (leaf)
     * พร้อมกัน ให้ priority กับสายที่แมป $mappingColumn
     * (lazada_category_id/shopee_category_id) ไว้แล้วก่อน เพราะ relevant สุด
     * กับหน้านี้
     */
    private function resolveMasterCategory(Product $product, Collection $allPimCategories, string $mappingColumn): ?Category
    {
        $categoryIds = $product->categories->pluck('id');
        if ($categoryIds->isEmpty()) {
            return null;
        }

        $allAncestorIds = $categoryIds->flatMap(fn ($id) => $this->ancestorIdsOf((int) $id, $allPimCategories))->unique();
        $leafCategoryIds = $categoryIds->diff($allAncestorIds);
        if ($leafCategoryIds->isEmpty()) {
            // ทุกตัวเป็น ancestor ของกันเองหมด (ไม่ควรเกิดจริง แต่กันไว้) — ใช้
            // ชุดเดิมทั้งหมดแทนที่จะคืน null
            $leafCategoryIds = $categoryIds;
        }

        $leafCategories = $product->categories->whereIn('id', $leafCategoryIds);

        return $leafCategories->first(fn (Category $c) => $c->{$mappingColumn}) ?? $leafCategories->first();
    }

    /**
     * หมวดหมู่ที่ผูก $mappingColumn ไว้จริง — คนละหน้าที่กับ
     * resolveMasterCategory() ด้านบน (ตัวนั้นเลือกเพื่อ "แสดงผล path" เท่านั้น
     * ตัวที่ผูก mapping ไว้จริงอาจเป็นหมวดแม่ของมันแทนก็ได้ เช่น ผู้ใช้แมป
     * Category ไว้ที่ root ไม่ใช่ product group) — ไล่หาในทุกหมวดหมู่ของสินค้า
     * ไม่ใช่แค่หมวดที่ resolveMasterCategory() เลือกไว้ ไม่งั้นจะเห็น
     * "ยังไม่ได้ map" ผิดๆ ทั้งที่แมปไว้จริงแล้วที่หมวดแม่ (บั๊กจริงที่เจอจาก
     * code review รอบก่อน)
     *
     * ถ้ามีมากกว่าหนึ่งหมวดหมู่ที่ผูกไว้พร้อมกัน (เช่นทั้ง root และ product
     * group ต่างก็มี mapping ของตัวเอง) เลือกตัวที่ "ลึกที่สุด" (เจาะจงที่สุด)
     * เสมอ — ไม่ใช่แค่ตัวแรกที่เจอตามลำดับ pivot ซึ่งไม่มีความหมายอะไร (บั๊ก
     * จริงอีกอันที่เจอจาก code review รอบเดียวกัน: ->first() เดิมอิงลำดับใน
     * collection ที่ไม่รับประกันว่าเรียงตามความลึก)
     */
    private function resolveMappedCategory(Product $product, Collection $allPimCategories, string $mappingColumn): ?Category
    {
        $candidates = $product->categories->filter(fn (Category $c) => $c->{$mappingColumn});
        if ($candidates->isEmpty()) {
            return null;
        }

        return $candidates
            ->sortByDesc(fn (Category $c) => count($this->ancestorIdsOf((int) $c->id, $allPimCategories)))
            ->first();
    }

    private function ancestorIdsOf(int $categoryId, Collection $allPimCategories): array
    {
        $ids = [];
        $node = $allPimCategories->get($categoryId);
        while ($node?->parent_id) {
            $ids[] = $node->parent_id;
            $node = $allPimCategories->get($node->parent_id);
        }

        return $ids;
    }
}
