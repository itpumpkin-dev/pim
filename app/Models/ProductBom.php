<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * "BOM" (Bill of Materials) — ผูกกับสินค้า (`product`) 1 ตัวเป๊ะๆ (finished
 * good) แล้วมีรายการวัตถุดิบ (`components`) มาประกอบกัน ดูแลผ่าน
 * /catalog/bom (BomController) — สร้างโดยเลือก SKU ที่มีอยู่แล้วในระบบ
 * (ไม่ได้สร้างสินค้าใหม่) จากนั้นค่อยเพิ่มรายการวัตถุดิบทีหลังจากหน้าแก้ไข
 *
 * Auditable covers create (store())/delete (destroy()) automatically —
 * BomController::update() replaces the components list wholesale via
 * delete+recreate on the child ProductBomComponent rows, which never fires
 * this model's own events, so that logs an explicit 'components_updated'
 * event itself instead (see its docblock).
 */
class ProductBom extends Model
{
    use Auditable;

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
