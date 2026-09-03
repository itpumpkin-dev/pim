<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถวคำแปลของ Brand ต่อ locale หนึ่งตัว — คู่กันกับ CategoryTranslation/
 * BaseUnitTranslation (ดู Brand::translations()).
 */
class BrandTranslation extends Model
{
    protected $fillable = [
        'brand_id',
        'locale_id',
        'label',
    ];

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
