<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use Illuminate\Support\Collection;

/**
 * Mirror ของ LazadaMappingTimelineBuilder เป๊ะ — ดูตัวนั้นๆ docblock สำหรับ
 * เหตุผลเต็มๆ (5 auditable source, ขอบเขตที่ตั้งใจ, ข้อจำกัดที่รู้ตัว) ต่างกัน
 * แค่จับคู่ด้วย `shopee_category_id` และ join attribute-level tables ผ่าน
 * ShopeeAttribute.id (ตัวเลข) แทน LazadaAttribute.name (string)
 */
class ShopeeMappingTimelineBuilder
{
    public function build(Category $category): Collection
    {
        $logs = collect();

        $logs = $logs->merge($this->categoryLogs($category));

        if ($category->shopee_category_id) {
            $logs = $logs->merge($this->familyLogs((int) $category->shopee_category_id));

            $mappedAttributeIds = $this->resolveMappedAttributeIds((int) $category->shopee_category_id);
            if ($mappedAttributeIds !== []) {
                $logs = $logs->merge($this->attributeLogs($mappedAttributeIds));

                $mappingIds = ShopeeAttributeMapping::whereIn('attribute_id', $mappedAttributeIds)->pluck('id');
                if ($mappingIds->isNotEmpty()) {
                    $logs = $logs->merge($this->mappingLogs($mappingIds));
                    $logs = $logs->merge($this->optionMappingLogs($mappingIds));
                }
            }
        }

        return $logs->unique('id')->sortByDesc('created_at')->values();
    }

    /**
     * เฉพาะ entry ที่มีคีย์ `shopee_category_id` หรือ `attribute_family_id`
     * — ดู LazadaMappingTimelineBuilder::categoryLogs()'s docblock
     */
    private function categoryLogs(Category $category): Collection
    {
        return AuditLog::where('auditable_type', $category->getMorphClass())
            ->where('auditable_id', $category->getKey())
            ->where(function ($q) {
                $q->whereNotNull('old_values->shopee_category_id')
                    ->orWhereNotNull('new_values->shopee_category_id')
                    ->orWhereNotNull('new_values->attribute_family_id');
            })
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function familyLogs(int $shopeeCategoryId): Collection
    {
        return AuditLog::where('auditable_type', (new AttributeFamily())->getMorphClass())
            ->where(function ($q) use ($shopeeCategoryId) {
                $q->where('old_values->shopee_category_id', $shopeeCategoryId)
                    ->orWhere('new_values->shopee_category_id', $shopeeCategoryId);
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
        return AuditLog::where('auditable_type', (new ShopeeAttributeMapping())->getMorphClass())
            ->whereIn('auditable_id', $mappingIds)
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function optionMappingLogs(Collection $mappingIds): Collection
    {
        $optionMappingIds = ShopeeAttributeOptionMapping::whereIn('shopee_attribute_mapping_id', $mappingIds)->pluck('id');
        if ($optionMappingIds->isEmpty()) {
            return collect();
        }

        return AuditLog::where('auditable_type', (new ShopeeAttributeOptionMapping())->getMorphClass())
            ->whereIn('auditable_id', $optionMappingIds)
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    /**
     * เหมือนกับ ShopeeAttributeFamilyGenerator::resolveMappedAttributeIds()
     * เป๊ะ (duplicate ตั้งใจ — เหตุผลเดียวกับ LazadaMappingTimelineBuilder's)
     */
    private function resolveMappedAttributeIds(int $shopeeCategoryId): array
    {
        $shopeeAttributeIds = ShopeeAttribute::where('category_id', $shopeeCategoryId)->pluck('id');
        if ($shopeeAttributeIds->isEmpty()) {
            return [];
        }

        return ShopeeAttributeMapping::where('target_field', 'shopee_attribute')
            ->whereIn('shopee_attribute_id', $shopeeAttributeIds)
            ->whereHas('attribute')
            ->with('attribute:id')
            ->get()
            ->pluck('attribute.id')
            ->unique()
            ->values()
            ->all();
    }
}
