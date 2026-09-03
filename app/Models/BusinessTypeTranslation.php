<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถวคำแปลของ BusinessType ต่อ locale หนึ่งตัว — คู่กันกับ
 * BaseUnitTranslation/BrandTranslation (ดู BusinessType::translations()).
 */
class BusinessTypeTranslation extends Model
{
    protected $fillable = [
        'business_type_id',
        'locale_id',
        'label',
    ];

    public function businessType(): BelongsTo
    {
        return $this->belongsTo(BusinessType::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
