<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use Illuminate\Support\Collection;

/**
 * Mirror ของ ShopeeMappingTimelineBuilder เป๊ะ — ดูตัวนั้นๆ docblock สำหรับ
 * เหตุผลเต็มๆ (5 auditable source, ขอบเขตที่ตั้งใจ, ข้อจำกัดที่รู้ตัว) ต่างกัน
 * แค่จับคู่ด้วย `tiktok_category_id` และ join attribute-level tables ผ่าน
 * TikTokAttribute.id (string) แทน ShopeeAttribute.id (ตัวเลข)
 */
class TikTokMappingTimelineBuilder
{
    public function build(Category $category): Collection
    {
        $logs = collect();

        $logs = $logs->merge($this->categoryLogs($category));

        if ($category->tiktok_category_id) {
            $logs = $logs->merge($this->familyLogs((int) $category->tiktok_category_id));

            $mappedAttributeIds = $this->resolveMappedAttributeIds((int) $category->tiktok_category_id);
            if ($mappedAttributeIds !== []) {
                $logs = $logs->merge($this->attributeLogs($mappedAttributeIds));

                $mappingIds = TikTokAttributeMapping::whereIn('attribute_id', $mappedAttributeIds)->pluck('id');
                if ($mappingIds->isNotEmpty()) {
                    $logs = $logs->merge($this->mappingLogs($mappingIds));
                    $logs = $logs->merge($this->optionMappingLogs($mappingIds));
                }
            }
        }

        return $logs->unique('id')->sortByDesc('created_at')->values();
    }

    private function categoryLogs(Category $category): Collection
    {
        return AuditLog::where('auditable_type', $category->getMorphClass())
            ->where('auditable_id', $category->getKey())
            ->where(function ($q) {
                $q->whereNotNull('old_values->tiktok_category_id')
                    ->orWhereNotNull('new_values->tiktok_category_id')
                    ->orWhereNotNull('new_values->attribute_family_id');
            })
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function familyLogs(int $tiktokCategoryId): Collection
    {
        return AuditLog::where('auditable_type', (new AttributeFamily())->getMorphClass())
            ->where(function ($q) use ($tiktokCategoryId) {
                $q->where('old_values->tiktok_category_id', $tiktokCategoryId)
                    ->orWhere('new_values->tiktok_category_id', $tiktokCategoryId);
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
        return AuditLog::where('auditable_type', (new TikTokAttributeMapping())->getMorphClass())
            ->whereIn('auditable_id', $mappingIds)
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    private function optionMappingLogs(Collection $mappingIds): Collection
    {
        $optionMappingIds = TikTokAttributeOptionMapping::whereIn('tiktok_attribute_mapping_id', $mappingIds)->pluck('id');
        if ($optionMappingIds->isEmpty()) {
            return collect();
        }

        return AuditLog::where('auditable_type', (new TikTokAttributeOptionMapping())->getMorphClass())
            ->whereIn('auditable_id', $optionMappingIds)
            ->with('user:id,first_name,last_name,email')
            ->get();
    }

    /**
     * เหมือนกับ TikTokAttributeFamilyGenerator::resolveMappedAttributeIds()
     * เป๊ะ (duplicate ตั้งใจ — เหตุผลเดียวกับ ShopeeMappingTimelineBuilder's)
     */
    private function resolveMappedAttributeIds(int $tiktokCategoryId): array
    {
        $tiktokAttributeIds = TikTokAttribute::where('category_id', $tiktokCategoryId)->pluck('id');
        if ($tiktokAttributeIds->isEmpty()) {
            return [];
        }

        return TikTokAttributeMapping::where('target_field', 'tiktok_attribute')
            ->whereIn('tiktok_attribute_id', $tiktokAttributeIds)
            ->whereHas('attribute')
            ->with('attribute:id')
            ->get()
            ->pluck('attribute.id')
            ->unique()
            ->values()
            ->all();
    }
}
