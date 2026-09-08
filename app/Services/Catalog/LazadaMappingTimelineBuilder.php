<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use Illuminate\Support\Collection;

/**
 * รวม audit trail ของ "เส้นทางการแมพ Lazada" ของ category หนึ่งตัว (category
 * มาสเตอร์ของสินค้าที่กำลังดูอยู่ที่หน้า lazada-products.tsx) ให้เป็น timeline
 * เดียว — งานนี้กระจาย auditable model อยู่ 5 ตัวคนละที่กัน (Category ->
 * AttributeFamily -> Attribute -> LazadaAttributeMapping ->
 * LazadaAttributeOptionMapping) ไม่มีโมเดลไหนโมเดลเดียวที่ "เป็นเจ้าของ" เรื่อง
 * ทั้งหมด ต่างจาก HasVersionHistory (ที่ 1 entity = 1 history) — มิเรอร์
 * แนวทาง multi-source query ของ UserController::history() (auditable ของ user
 * เอง + auditable ที่ user เป็น actor) แต่ที่นี่ "แหล่งข้อมูล" คือ 5 auditable
 * type ที่เกี่ยวกับ Lazada category นี้แทน
 *
 * ขอบเขตที่ตั้งใจไว้ (ไม่ใช่ทุก audit log ที่เคยเกิดขึ้นกับทุกอย่างในระบบ):
 *  - Category: เฉพาะ entry ที่แตะ `lazada_category_id` หรือ
 *    `attribute_family_id` เท่านั้น (ล้วนคีย์ที่เกี่ยวกับ Lazada mapping
 *    โดยตรง) — ไม่เอา entry อื่นของ category นี้ (เช่นแก้ชื่อ, business_type
 *    ฯลฯ) มาปนเพราะไม่เกี่ยวกับ "เส้นทางการแมพ Lazada" ที่ผู้ใช้ถาม
 *  - AttributeFamily: จับคู่ด้วย `lazada_category_id` ที่ปรากฏใน old/new
 *    values ตรงๆ (ไม่ใช่ query ผ่าน current row เพียงอย่างเดียว) เพื่อให้เห็น
 *    ประวัติได้แม้ family เดิมจะถูกลบไปแล้วและมี family ใหม่มาแทนที่ (เคสจริง
 *    ที่เจอมาก่อนหน้านี้ในงานนี้ — แอดมินลบ family ทิ้งจากหน้า review link)
 *  - Attribute / LazadaAttributeMapping / LazadaAttributeOptionMapping: ผูก
 *    กับ "ชุด PIM attribute ที่แมปกับ Lazada attribute ของ category นี้อยู่
 *    ณ ตอนนี้" (resolveMappedAttributeIds() เดียวกับที่
 *    LazadaAttributeFamilyGenerator ใช้ตัดสินใจว่า attribute ไหนควรอยู่ใน
 *    family) — ข้อจำกัดที่รู้ตัว: ถ้า mapping ของ attribute ตัวหนึ่งเคยถูก
 *    สร้างแล้วลบทิ้งไปทั้งคู่ (ไม่เหลือแถวมีชีวิตอยู่เลย ณ ตอนนี้) ประวัติของ
 *    มันจะไม่โผล่ในนี้ — ยอมรับข้อจำกัดนี้ไว้ตรงๆ เพื่อไม่ต้อง parse
 *    old_values/new_values ของทุก mapping ในระบบเพื่อหา lazada_attribute_name
 *    ที่เคยตรงกับ category นี้ (แพงเกินไปเทียบกับประโยชน์ที่ได้)
 */
class LazadaMappingTimelineBuilder
{
    public function build(Category $category): Collection
    {
        $logs = collect();

        $logs = $logs->merge($this->categoryLogs($category));

        if ($category->lazada_category_id) {
            $logs = $logs->merge($this->familyLogs((int) $category->lazada_category_id));

            $mappedAttributeIds = $this->resolveMappedAttributeIds((int) $category->lazada_category_id);
            if ($mappedAttributeIds !== []) {
                $logs = $logs->merge($this->attributeLogs($mappedAttributeIds));

                $mappingIds = LazadaAttributeMapping::whereIn('attribute_id', $mappedAttributeIds)->pluck('id');
                if ($mappingIds->isNotEmpty()) {
                    $logs = $logs->merge($this->mappingLogs($mappingIds));
                    $logs = $logs->merge($this->optionMappingLogs($mappingIds));
                }
            }
        }

        return $logs->unique('id')->sortByDesc('created_at')->values();
    }

    /**
     * เฉพาะ entry ที่มีคีย์ `lazada_category_id` (การแมพ category ->
     * Lazada category, ทั้งจาก CategoryController::bulkMapLazada()'s
     * explicit 'lazada_category_mapped' event และจาก Auditable trait's
     * อัตโนมัติ 'updated' event ตอน ProductGroupController::update() แก้
     * ฟิลด์เดียวกันตรงๆ) หรือ `attribute_family_id` (
     * LazadaAttributeFamilyGenerator::attachFamilyToCategory()'s
     * 'lazada_family_attached_to_category' event ที่ log ไว้ที่ Category
     * ไม่ใช่ที่ Family)
     */
    private function categoryLogs(Category $category): Collection
    {
        return AuditLog::where('auditable_type', $category->getMorphClass())
            ->where('auditable_id', $category->getKey())
            ->where(function ($q) {
                $q->whereNotNull('old_values->lazada_category_id')
                    ->orWhereNotNull('new_values->lazada_category_id')
                    ->orWhereNotNull('new_values->attribute_family_id');
            })
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function familyLogs(int $lazadaCategoryId): Collection
    {
        return AuditLog::where('auditable_type', (new AttributeFamily())->getMorphClass())
            ->where(function ($q) use ($lazadaCategoryId) {
                $q->where('old_values->lazada_category_id', $lazadaCategoryId)
                    ->orWhere('new_values->lazada_category_id', $lazadaCategoryId);
            })
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function attributeLogs(array $attributeIds): Collection
    {
        return AuditLog::where('auditable_type', (new Attribute())->getMorphClass())
            ->whereIn('auditable_id', $attributeIds)
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function mappingLogs(Collection $mappingIds): Collection
    {
        return AuditLog::where('auditable_type', (new LazadaAttributeMapping())->getMorphClass())
            ->whereIn('auditable_id', $mappingIds)
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function optionMappingLogs(Collection $mappingIds): Collection
    {
        $optionMappingIds = LazadaAttributeOptionMapping::whereIn('lazada_attribute_mapping_id', $mappingIds)->pluck('id');
        if ($optionMappingIds->isEmpty()) {
            return collect();
        }

        return AuditLog::where('auditable_type', (new LazadaAttributeOptionMapping())->getMorphClass())
            ->whereIn('auditable_id', $optionMappingIds)
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    /**
     * เหมือนกับ LazadaAttributeFamilyGenerator::resolveMappedAttributeIds()
     * เป๊ะ (ตั้งใจ duplicate แทนที่จะ inject service นั้นมาแล้วเรียก method
     * private ข้ามคลาส — 2 บรรทัด query ไม่คุ้มที่จะเปลี่ยน visibility หรือ
     * เพิ่ม dependency ข้ามคลาสแค่เพื่อ reuse)
     */
    private function resolveMappedAttributeIds(int $lazadaCategoryId): array
    {
        $lazadaAttributeNames = LazadaAttribute::where('category_id', $lazadaCategoryId)->pluck('name');
        if ($lazadaAttributeNames->isEmpty()) {
            return [];
        }

        return LazadaAttributeMapping::where('target_field', 'lazada_attribute')
            ->whereIn('lazada_attribute_name', $lazadaAttributeNames)
            ->whereHas('attribute')
            ->with('attribute:id')
            ->get()
            ->pluck('attribute.id')
            ->unique()
            ->values()
            ->all();
    }
}
