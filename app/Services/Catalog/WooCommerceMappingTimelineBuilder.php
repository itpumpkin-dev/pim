<?php

namespace App\Services\Catalog;

use App\Models\AuditLog;
use App\Models\Category;
use Illuminate\Support\Collection;

/**
 * Mirror ของ ShopeeMappingTimelineBuilder แต่**เล็กกว่ามาก** — WooCommerce
 * attribute เป็น global ทั้งหมด ไม่ผูกกับ category เหมือน Lazada/Shopee/
 * TikTok เลย (ไม่มี category-attribute schema tree, ไม่มี AttributeFamily
 * auto-generation สำหรับ WooCommerce — ดู WooCommerceAttributeMappingController's
 * docblock) เลยไม่มี attribute-ระดับ-category ให้ join กับ category นี้
 * โดยเฉพาะแบบ 3 platform ก่อน — ขอบเขตจึงเหลือแค่ audit log ของตัว Category
 * เองที่แตะ `woocommerce_category_id` เท่านั้น (mirror ของ
 * ShopeeMappingTimelineBuilder::categoryLogs() อย่างเดียว ตัดส่วน
 * `attribute_family_id` ออกด้วย เพราะไม่มี AttributeFamily auto-generation
 * สำหรับ WooCommerce เลย)
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
                    ->orWhereNotNull('new_values->woocommerce_category_id');
            })
            ->with('user:id,first_name,last_name,email')
            ->get();
    }
}
