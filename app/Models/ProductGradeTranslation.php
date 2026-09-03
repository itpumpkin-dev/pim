<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถวคำแปลของ ProductGrade ต่อ locale หนึ่งตัว — คู่กันกับ
 * BusinessTypeTranslation/ProductTypeTranslation (ดู ProductGrade::translations()).
 */
class ProductGradeTranslation extends Model
{
    protected $fillable = [
        'product_grade_id',
        'locale_id',
        'label',
    ];

    public function productGrade(): BelongsTo
    {
        return $this->belongsTo(ProductGrade::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
