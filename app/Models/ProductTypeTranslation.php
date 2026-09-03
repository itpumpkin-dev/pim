<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถวคำแปลของ ProductType ต่อ locale หนึ่งตัว — คู่กันกับ
 * BaseUnitTranslation/BrandTranslation (ดู ProductType::translations()).
 */
class ProductTypeTranslation extends Model
{
    protected $fillable = [
        'product_type_id',
        'locale_id',
        'label',
    ];

    public function productType(): BelongsTo
    {
        return $this->belongsTo(ProductType::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
