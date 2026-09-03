<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถววัตถุดิบ (RM) หนึ่งตัวของ BOM หนึ่งชุด — ชี้ไปที่สินค้าอีกตัวหนึ่ง
 * (`component`) ที่ถูกติ๊กเป็นวัตถุดิบไว้แล้ว (Product.is_raw_material = true
 * — บังคับตรวจที่ BomController ตอน sync ไม่ใช่ constraint ระดับ DB) ยังไม่มี
 * "จำนวนที่ใช้" ตามที่ตกลงกันไว้ (ดู docblock ของ migration
 * create_product_boms_table) — เป็นแค่ลิสต์ว่า BOM นี้ประกอบด้วยวัตถุดิบตัวไหนบ้าง
 */
class ProductBomComponent extends Model
{
    protected $fillable = [
        'product_bom_id',
        'component_product_id',
        'sort_order',
    ];

    public function productBom(): BelongsTo
    {
        return $this->belongsTo(ProductBom::class);
    }

    public function component(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'component_product_id');
    }
}
