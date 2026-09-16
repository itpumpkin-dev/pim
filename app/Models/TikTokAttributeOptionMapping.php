<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mirror ของ ShopeeAttributeOptionMapping เป๊ะ — ดูตัวนั้นๆ docblock สำหรับ
 * เหตุผลเต็มๆ ต่างกันแค่ชื่อคอลัมน์ (tiktok_ แทน shopee_) — อ่านตอน push จริง
 * โดย TikTokProductSyncService::resolveSingleSelectOptionValue()/
 * resolveMultiSelectOptionValues()
 */
class TikTokAttributeOptionMapping extends Model
{
    use Auditable;

    protected $table = 'tiktok_attribute_option_mappings';

    protected $fillable = [
        'tiktok_attribute_mapping_id',
        'attribute_option_id',
        'tiktok_option_value',
        'tiktok_option_label',
        'created_by',
        'updated_by',
    ];

    public function tiktokAttributeMapping(): BelongsTo
    {
        // FK ต้องระบุตรงๆ — Laravel เดา default FK จากชื่อคลาสด้วย snake_case
        // ซึ่งแยก "TikTok" เป็น "tik_tok" (คนละคำ) ต่างจากคอลัมน์จริงที่ใช้
        // "tiktok" คำเดียว (ดู migration create_tiktok_attribute_option_mappings_table)
        // — บั๊กจริงที่เจอ: ทำให้ eager-load ผ่าน optionMappings() พังด้วย
        // SQLSTATE 42703 "column tik_tok_attribute_mapping_id does not exist"
        // ทุกครั้งที่ TikTokAttributeMappingController::tiktokAttributesForCategory()
        // ถูกเรียก
        return $this->belongsTo(TikTokAttributeMapping::class, 'tiktok_attribute_mapping_id');
    }

    public function attributeOption(): BelongsTo
    {
        return $this->belongsTo(AttributeOption::class);
    }
}
