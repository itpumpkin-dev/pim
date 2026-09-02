<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * "หน่วยนับพื้นฐาน" (Base Units) master row — ดูแลผ่าน /catalog/base-units
 * (BaseUnitController) ผูก master_source = 'base_units' เข้ากับ attribute
 * `pbaseunit` (ดู migration bind_base_unit_to_attribute) เพื่อ mirror ตัวเลือก
 * ของ attribute นั้น (ดู MasterAttributeOptionSync) มีชื่อที่แปลได้หลายภาษา
 * จริง (ต่างจาก business_types/vendors/product_types ที่มีแค่ name เดียว)
 * เลยมี translations() แยกออกมาแบบเดียวกับ Category
 */
class BaseUnit extends Model
{
    use Auditable;

    protected $with = ['translations'];

    protected $fillable = [
        'code',
        'name',
        'slug',
        'description',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function translations(): HasMany
    {
        return $this->hasMany(BaseUnitTranslation::class);
    }
}
