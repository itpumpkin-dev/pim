<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถวคำแปลของ Currency ต่อ locale หนึ่งตัว — คู่กันกับ
 * BaseUnitTranslation/BrandTranslation (ดู Currency::translations()).
 */
class CurrencyTranslation extends Model
{
    protected $fillable = [
        'currency_id',
        'locale_id',
        'label',
    ];

    public function currency(): BelongsTo
    {
        return $this->belongsTo(Currency::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
