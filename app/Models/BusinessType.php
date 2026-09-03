<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * "ประเภทธุรกิจ" (Business Types) master row.
 * Maintained on /catalog/business-types (see BusinessTypeController).
 * `name` เก็บชื่อของ locale เริ่มต้นของแอปไว้เป็น fallback ง่ายๆ — คำแปลจริง
 * ของแต่ละภาษาอยู่ใน translations() (ดู BusinessTypeTranslation)
 */
class BusinessType extends Model
{
    protected $with = ['translations'];

    protected $fillable = [
        'code',
        'name',
        'description',
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
        return $this->hasMany(BusinessTypeTranslation::class);
    }
}
