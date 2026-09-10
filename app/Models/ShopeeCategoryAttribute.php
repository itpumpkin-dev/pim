<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * "attribute_id X เป็น attribute ของหมวดหมู่ Y ไหม บังคับหรือเปล่า" — แยกออกมาจาก
 * `ShopeeAttribute` (ซึ่งเก็บแค่ name/input_type/options ที่เสถียรพอจะ key ด้วย
 * `id` เฉยๆ ได้จริง โดยไม่ผูกกับหมวดหมู่ใดเป็นพิเศษ — ดู ShopeeAttribute's
 * docblock) เพราะ attribute_id เดียวกัน (เช่น "TIS No.", "power_rating")
 * ปรากฏได้ในหลายหมวดหมู่ Shopee พร้อมกัน แต่ mandatory หรือเปล่าต่างกันไปตาม
 * หมวดหมู่ — ถ้าเก็บรวมไว้แถวเดียว (แบบที่ shopee_attributes.category_id/
 * .mandatory เคยทำ) sync หมวดหมู่ไหนล่าสุดก็จะทับข้อมูลของหมวดหมู่อื่นที่มี
 * attribute_id เดียวกันทันที — ตารางนี้แก้ปัญหานั้นด้วย primary key แบบ
 * (category_id, shopee_attribute_id)
 *
 * ต่างจาก LazadaCategoryAttribute ตรงที่ Shopee ยืนยันตัวตน attribute ด้วย
 * `attribute_id` ตัวเลข ไม่ใช่ชื่อ string — คอลัมน์นี้เลยชื่อ
 * `shopee_attribute_id` (FK ไปที่ shopee_attributes.id) แทนที่จะเป็นชื่อ
 *
 * เขียนโดย ShopeeAttributeMappingController::syncShopeeAttributes()/
 * syncShopeeAttributesForCategory() อ่านโดย shopeeAttributesForCategory()
 * (หน้าจับคู่ attribute), productDetail() (sidebar เร็วๆ ของหน้ารายการสินค้า),
 * และ ProductController::shopeeMandatoryAttributeIds() (chip "Shopee
 * required" บนหน้า Edit Product) — mirror ของ LazadaCategoryAttribute เป๊ะ
 */
class ShopeeCategoryAttribute extends Model
{
    protected $table = 'shopee_category_attributes';

    // primary key แบบ composite (category_id, shopee_attribute_id) —
    // Eloquent ไม่รองรับ composite PK จริงจัง เขียนข้อมูลผ่าน static::upsert()
    // เสมอ (ตัวเดียวกับที่ ShopeeAttribute ใช้อยู่แล้ว) ไม่ใช้ save()/find() ตรงๆ
    public $incrementing = false;

    protected $primaryKey = null;

    protected $fillable = [
        'category_id',
        'shopee_attribute_id',
        'mandatory',
    ];

    protected function casts(): array
    {
        return [
            'category_id' => 'integer',
            'shopee_attribute_id' => 'integer',
            'mandatory' => 'boolean',
        ];
    }

    public function shopeeAttribute(): BelongsTo
    {
        return $this->belongsTo(ShopeeAttribute::class, 'shopee_attribute_id', 'id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ShopeeCategory::class, 'category_id');
    }
}
