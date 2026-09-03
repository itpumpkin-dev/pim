<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * "BOM" (Bill of Materials) — ผูกกับสินค้า (`product`) 1 ตัวเป๊ะๆ (finished
 * good) แล้วมีรายการวัตถุดิบ (`components`) มาประกอบกัน ดูแลผ่าน
 * /catalog/bom (BomController) — สร้างโดยเลือก SKU ที่มีอยู่แล้วในระบบ
 * (ไม่ได้สร้างสินค้าใหม่) จากนั้นค่อยเพิ่มรายการวัตถุดิบทีหลังจากหน้าแก้ไข
 */
class ProductBom extends Model
{
    protected $fillable = [
        'product_id',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function components(): HasMany
    {
        return $this->hasMany(ProductBomComponent::class)->orderBy('sort_order');
    }
}
