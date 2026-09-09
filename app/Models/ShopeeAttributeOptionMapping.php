<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Mirror ของ LazadaAttributeOptionMapping เป๊ะ — ดูตัวนั้นๆ docblock สำหรับ
 * เหตุผลเต็มๆ ต่างกันแค่ชื่อคอลัมน์ (`shopee_option_value`/
 * `shopee_option_label` แทน `lazada_option_value`/`lazada_option_label`)
 *
 * อ่านตอน push จริงโดย
 * ShopeeProductSyncService::resolveSingleSelectOptionValue()/
 * resolveMultiSelectOptionValues() — แปลง AttributeOption code ที่สินค้า
 * เก็บไว้ ให้เป็น `value_id` ที่ Shopee ต้องการ
 */
class ShopeeAttributeOptionMapping extends Model
{
    use Auditable;

    protected $table = 'shopee_attribute_option_mappings';

    protected $fillable = [
        'shopee_attribute_mapping_id',
        'attribute_option_id',
        'shopee_option_value',
        'shopee_option_label',
        'created_by',
        'updated_by',
    ];

    public function shopeeAttributeMapping(): BelongsTo
    {
        return $this->belongsTo(ShopeeAttributeMapping::class);
    }

    public function attributeOption(): BelongsTo
    {
        return $this->belongsTo(AttributeOption::class);
    }
}
