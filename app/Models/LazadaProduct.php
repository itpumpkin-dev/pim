<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * "Master Product List" ต่อร้าน — 1 แถวคือ 1 SellerSku ที่จริงๆ อยู่บน Lazada
 * ตอน sync ล่าสุด (ไม่ว่าจะ match กับ PIM Product ตัวไหนได้หรือไม่) — ดู
 * creating migration's docblock สำหรับเหตุผลที่ต้องมีตารางนี้แยกจาก
 * product_platform_shops (pivot ที่ผูกกับ PIM Product เท่านั้น)
 *
 * เขียนโดย LazadaProductSyncService::syncMasterProductList() เท่านั้น — อ่าน
 * โดย LazadaMasterProductsController::index() สำหรับหน้า "Master Product List"
 * ที่การ์ดใหม่ใน platform-hub.tsx (เฉพาะ Lazada ตอนนี้) เปิดไปหา
 */
class LazadaProduct extends Model
{
    protected $fillable = [
        'sales_platform_shop_id',
        'item_id',
        'sku_id',
        'seller_sku',
        'shop_sku',
        'name',
        'status',
        'quantity',
        'price',
        'image_url',
        'lazada_url',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'price' => 'decimal:2',
            'last_synced_at' => 'datetime',
        ];
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(SalesPlatformShop::class, 'sales_platform_shop_id');
    }
}
