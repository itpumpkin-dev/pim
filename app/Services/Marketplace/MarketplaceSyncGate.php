<?php

namespace App\Services\Marketplace;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\LazadaAttributeMapping;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * The "is this product actually ready to push to {platform}?" checks, shared
 * between ProductController's synchronous pre-flight (fail fast before even
 * queuing a job — see queueMarketplaceSync()) and the auto-sync path (see
 * AutoSyncProductToMarketplaceJob), which needs the exact same category/brand
 * gating but has no HTTP request to return a 422 from — it just skips the
 * auto-push silently and leaves the real error for the user to discover the
 * next time they push manually.
 *
 * Moved out of ProductController verbatim (was hasMarketplaceCategoryMapped()/
 * hasMarketplaceBrandMapped()) rather than duplicated, so the two call sites
 * can't drift out of sync with each other.
 */
class MarketplaceSyncGate
{
    /**
     * เช็คแบบเดียวกับที่ Shopee/Lazada/TikTok/WooCommerceProductSyncService::
     * resolve*CategoryId() ใช้จริงตอน build payload: ใช้ค่า override เฉพาะสินค้า
     * (products.{platform}_category_id) ถ้ามี ไม่งั้น fallback ไปดูว่า
     * PIM category ที่สินค้าผูกอยู่ มี mapping ของ platform นี้หรือเปล่า
     */
    public function categoryMapped(Product $product, string $platform): bool
    {
        $column = "{$platform}_category_id";
        if ($product->{$column}) {
            return true;
        }

        return $product->categories()->whereNotNull($column)->exists();
    }

    /**
     * เช็คแบบเดียวกับที่ mappedBrandOptionId() (ResolvesProductAttributeValues
     * trait ที่ sync service ทุกตัวใช้ตอน build payload จริง) ใช้: ค่า override
     * เฉพาะสินค้า (products.{platform}_brand_id) ถ้ามี ไม่งั้น fallback ไปดูว่า
     * ค่า attribute `pbrand` ของสินค้านี้ ชี้ไปที่ AttributeOption ที่มี mapping
     * ของ platform นี้หรือเปล่า
     *
     * Lazada เท่านั้น: มีอีกเส้นทางหนึ่งที่ทำให้ brand resolve ได้โดยไม่ต้องพึ่งหน้า
     * Master Brand เลย — แอดมิน map PIM attribute ตรงเข้ากับ Lazada attribute
     * ชื่อ `brand` ผ่านหน้า Attribute Mapping ทั่วไปแทนได้ (ดู
     * LazadaProductSyncService::buildPayload()'s $brandName ที่ยอมรับทั้งสอง
     * เส้นทางแล้ว)
     */
    public function brandMapped(Product $product, string $platform): bool
    {
        $column = "{$platform}_brand_id";
        if ($product->{$column}) {
            return true;
        }

        $pbrandAttributeId = Attribute::idForCode('pbrand');
        if ($pbrandAttributeId) {
            $brandCode = ProductValue::where('product_id', $product->id)
                ->where('attribute_id', $pbrandAttributeId)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->value('value');

            if ($brandCode && AttributeOption::where('attribute_id', $pbrandAttributeId)->where('code', $brandCode)->whereNotNull($column)->exists()) {
                return true;
            }
        }

        if ($platform === 'lazada') {
            $mappingAttributeIds = LazadaAttributeMapping::where('target_field', 'lazada_attribute')
                ->where('lazada_attribute_name', 'brand')
                ->pluck('attribute_id');

            if ($mappingAttributeIds->isNotEmpty()
                && ProductValue::where('product_id', $product->id)
                    ->whereIn('attribute_id', $mappingAttributeIds)
                    ->whereNotNull('value')
                    ->where('value', '!=', '')
                    ->exists()
            ) {
                return true;
            }
        }

        return false;
    }
}
