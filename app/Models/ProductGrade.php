<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * "เกรดสินค้า" (Product Grade) master row.
 * Maintained on /catalog/product-grades (see ProductGradeController).
 * `name` เก็บชื่อของ locale เริ่มต้นของแอปไว้เป็น fallback ง่ายๆ — คำแปลจริง
 * ของแต่ละภาษาอยู่ใน translations() (ดู ProductGradeTranslation)
 *
 * `start_date`/`end_date` คือ "ช่วงเวลา" ที่เกรดนี้ใช้งานได้ เผื่อไว้สำหรับ
 * อนาคต — ยังไม่มี logic ไหนในระบบอ่าน/บังคับใช้ค่านี้จริงจัง (ดู docblock ของ
 * migration create_product_grades_table)
 */
class ProductGrade extends Model
{
    protected $with = ['translations'];

    protected $fillable = [
        'code',
        'name',
        'description',
        'start_date',
        'end_date',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'is_active' => 'boolean',
        ];
    }

    public function translations(): HasMany
    {
        return $this->hasMany(ProductGradeTranslation::class);
    }
}
