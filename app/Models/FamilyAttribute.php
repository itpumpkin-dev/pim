<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

class FamilyAttribute extends Pivot
{
    // มี surrogate `id` เป็น primary key จริงแล้ว (ดู migration
    // 2026_09_22_000002_allow_same_family_multi_group_family_attributes) —
    // เลิกใช้ composite (family_id, attribute_id) เป็น PK เพื่อให้ 1 attribute
    // อยู่ได้หลาย group ภายใน family เดียวกัน (คุมกันแถวซ้ำเป๊ะๆ ด้วย unique
    // constraint (family_id, attribute_id, attribute_group_id) แทน)
    public $incrementing = true;
    public $timestamps = false;

    protected $table = 'family_attributes';

    protected $fillable = [
        'family_id',
        'attribute_id',
        'attribute_group_id',
        'sort_order',
    ];

    public function family(): BelongsTo
    {
        return $this->belongsTo(AttributeFamily::class, 'family_id');
    }

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(Attribute::class);
    }

    public function attributeGroup(): BelongsTo
    {
        return $this->belongsTo(AttributeGroup::class);
    }
}
