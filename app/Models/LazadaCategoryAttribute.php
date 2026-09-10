<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * "field ชื่อ X เป็น field ของหมวดหมู่ Y ไหม บังคับหรือเปล่า" — แยกออกมาจาก
 * `LazadaAttribute` (ซึ่งเก็บแค่ label/input_type/attribute_type/options ที่
 * เสถียรพอจะ key ด้วยชื่อ field เฉยๆ ได้จริง โดยไม่ผูกกับหมวดหมู่ใดเป็นพิเศษ)
 * เพราะ field เดียวกัน (เช่น "brand", "package_weight") ปรากฏได้ในหลาย
 * หมวดหมู่พร้อมกัน แต่ mandatory หรือเปล่าต่างกันไปตามหมวดหมู่ — ถ้าเก็บรวมไว้
 * แถวเดียว (แบบที่ lazada_attributes.category_id/.mandatory เคยทำ) sync
 * หมวดหมู่ไหนล่าสุดก็จะทับข้อมูลของหมวดหมู่อื่นที่มี field ชื่อเดียวกันทันที — ตารางนี้
 * แก้ปัญหานั้นด้วย primary key แบบ (category_id, lazada_attribute_name)
 *
 * เขียนโดย LazadaAttributeMappingController::syncLazadaAttributes()/
 * syncLazadaAttributesForCategory() อ่านโดย lazadaAttributesForCategory()
 * (หน้าจับคู่ attribute), productDetail() (sidebar เร็วๆ ของหน้ารายการสินค้า),
 * และ ProductController::lazadaMandatoryAttributeIds() (chip "Lazada
 * required" บนหน้า Edit Product)
 */
class LazadaCategoryAttribute extends Model
{
    protected $table = 'lazada_category_attributes';

    // primary key แบบ composite (category_id, lazada_attribute_name) —
    // Eloquent ไม่รองรับ composite PK จริงจัง เขียนข้อมูลผ่าน static::upsert()
    // เสมอ (ตัวเดียวกับที่ LazadaAttribute ใช้อยู่แล้ว) ไม่ใช้ save()/find() ตรงๆ
    public $incrementing = false;

    protected $primaryKey = null;

    protected $fillable = [
        'category_id',
        'lazada_attribute_name',
        'mandatory',
    ];

    protected function casts(): array
    {
        return [
            'category_id' => 'integer',
            'mandatory' => 'boolean',
        ];
    }

    public function lazadaAttribute(): BelongsTo
    {
        return $this->belongsTo(LazadaAttribute::class, 'lazada_attribute_name', 'name');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(LazadaCategory::class, 'category_id');
    }
}
