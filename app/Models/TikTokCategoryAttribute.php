<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * "field id X เป็น field ของหมวดหมู่ Y ไหม บังคับหรือเปล่า" — แยกออกมาจาก
 * `TikTokAttribute` (ซึ่งเก็บแค่ name/is_customizable/is_multiple_selection/
 * options ที่เสถียรพอจะ key ด้วย `id` เฉยๆ ได้จริง โดยไม่ผูกกับหมวดหมู่ใดเป็นพิเศษ)
 * เพราะ attribute id เดียวกัน (ถ้าเกิดซ้ำข้ามหมวดหมู่จริง — ดูหมายเหตุด้านล่าง)
 * mandatory หรือเปล่าต่างกันไปตามหมวดหมู่ — ถ้าเก็บรวมไว้แถวเดียว (แบบที่
 * tiktok_attributes.category_id/.mandatory เคยทำ) sync หมวดหมู่ไหนล่าสุดก็จะทับ
 * ข้อมูลของหมวดหมู่อื่นที่มี id ตรงกันทันที — ตารางนี้แก้ปัญหานั้นด้วย primary key
 * แบบ (category_id, tiktok_attribute_id)
 *
 * หมายเหตุเรื่อง `tiktok_attribute_id`: TikTok เองมีการบันทึกไว้ (ดู
 * `2026_08_21_000009_create_tiktok_attribute_mapping_tables`'s docblock กับ
 * `TikTokProductSyncService`'s docblock) ว่า "TikTok attribute id อาจผูกกับ
 * หมวดหมู่เฉพาะ ไม่ใช่ global แบบ Shopee" — ยังไม่เคยยืนยันชัดจริง แต่ตารางนี้
 * ไม่ต้องพึ่งคำตอบนั้นเลย: primary key คือ "คู่" (category_id, tiktok_attribute_id)
 * ไม่ใช่ tiktok_attribute_id เดี่ยวๆ ต่อให้ id เดียวกันมีความหมายคนละอย่างกันจริง
 * ในสองหมวดหมู่ที่ต่างกัน ตารางนี้ก็ยังเก็บ mandatory ของแต่ละคู่ถูกต้องแยกจากกัน
 * อยู่ดี — จุดที่ยังพึ่งสมมติฐาน "id เสถียรพอ dedupe ข้ามหมวดหมู่ได้" จริงๆ คือ
 * `tiktok_attributes` เอง (name/is_customizable/is_multiple_selection/options)
 * ไม่ใช่ตารางนี้
 *
 * เขียนโดย TikTokAttributeMappingController::syncTikTokAttributes()/
 * syncTikTokAttributesForCategory() อ่านโดย tiktokAttributesForCategory()
 * (หน้าจับคู่ attribute), productDetail() (sidebar เร็วๆ ของหน้ารายการสินค้า),
 * และ ProductController::tiktokMandatoryAttributeIds() (chip "TikTok
 * required" บนหน้า Edit Product)
 */
class TikTokCategoryAttribute extends Model
{
    protected $table = 'tiktok_category_attributes';

    // primary key แบบ composite (category_id, tiktok_attribute_id) —
    // Eloquent ไม่รองรับ composite PK จริงจัง เขียนข้อมูลผ่าน static::upsert()
    // เสมอ (ตัวเดียวกับที่ TikTokAttribute ใช้อยู่แล้ว) ไม่ใช้ save()/find() ตรงๆ
    public $incrementing = false;

    protected $primaryKey = null;

    protected $fillable = [
        'category_id',
        'tiktok_attribute_id',
        'mandatory',
    ];

    protected function casts(): array
    {
        return [
            'category_id' => 'integer',
            'mandatory' => 'boolean',
        ];
    }

    public function tiktokAttribute(): BelongsTo
    {
        return $this->belongsTo(TikTokAttribute::class, 'tiktok_attribute_id', 'id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(TikTokCategory::class, 'category_id');
    }
}
