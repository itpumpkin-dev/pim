<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถวคำแปลของ BaseUnit ต่อ locale หนึ่งตัว — คู่กันกับ CategoryTranslation
 * (ดู Category::translations()).
 */
class BaseUnitTranslation extends Model
{
    protected $fillable = [
        'base_unit_id',
        'locale_id',
        'label',
    ];

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(BaseUnit::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
