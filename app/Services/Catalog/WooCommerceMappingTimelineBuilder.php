<?php

namespace App\Services\Catalog;

use App\Models\AuditLog;
use App\Models\Category;
use Illuminate\Support\Collection;

/**
 * Mirror ของ ShopeeMappingTimelineBuilder แต่**เล็กกว่ามาก** — WooCommerce
 * attribute เป็น global ทั้งหมด ไม่ผูกกับ category เหมือน Lazada/Shopee/
 * TikTok เลย (ไม่มี category-attribute schema tree — ดู
 * WooCommerceAttributeMappingController's docblock) เลยไม่มี attribute-ระดับ-
 * category ให้ join กับ category นี้โดยเฉพาะแบบ 3 platform ก่อน
 *
 * มี AttributeFamily auto-generation สำหรับ WooCommerce ด้วยเหมือนกัน (ดู
 * WooCommerceAttributeFamilyGenerator) แต่เป็น family เดียวของทั้งระบบ
 * (`code='woocommerce_family'`) ไม่ใช่ 1 family ต่อ 1 marketplace category
 * แบบ Lazada/Shopee/TikTok — เลยไม่มี familyLogs() แบบ
 * ShopeeMappingTimelineBuilder ที่ join จาก AttributeFamily's own audit log
 * ตรงๆ (family เดียวกันอาจผูกกับหลาย category ก็ได้ log ของตัว family เอง
 * จึงไม่ scope ต่อ category ใดเป็นการเฉพาะ จะดึงมารวมในทุก category's
 * timeline เหมือนกันหมด สร้าง noise มากกว่าจะช่วยอะไร) — ยังคง match
 * `attribute_family_id` ใน categoryLogs() ด้านล่างเหมือนกัน เพราะ event
 * "ผูก family เข้ากับ category นี้" (attachFamilyToCategory()) log ไว้ที่ตัว
 * Category เองอยู่แล้ว เหมือน 3 platform อื่น
 *
 * การแมป attribute แบบ global (target_field='wc_attribute'/payload fields)
 * เกิดขึ้นได้จากสินค้าตัวไหนก็ได้ ไม่เกี่ยวกับ category นี้เจาะจง เลยไม่รวมไว้ใน
 * timeline นี้ — ดูประวัติของมันได้จาก audit log ของ Attribute/
 * WooCommerceAttributeMapping โดยตรงแทน (นอกขอบเขตของ "เส้นทางการแมพของ
 * category นี้")
 */
class WooCommerceMappingTimelineBuilder
{
    public function build(Category $category): Collection
    {
        return $this->categoryLogs($category)->sortByDesc('created_at')->values();
    }

    private function categoryLogs(Category $category): Collection
    {
        return AuditLog::where('auditable_type', $category->getMorphClass())
            ->where('auditable_id', $category->getKey())
            ->where(function ($q) {
                $q->whereNotNull('old_values->woocommerce_category_id')
                    ->orWhereNotNull('new_values->woocommerce_category_id')
                    ->orWhereNotNull('new_values->attribute_family_id');
            })
            ->with('user:id,first_name,last_name,email')
            ->get();
    }
}
