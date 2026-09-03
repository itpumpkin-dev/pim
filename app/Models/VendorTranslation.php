<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * แถวคำแปลของ Vendor ต่อ locale หนึ่งตัว — คู่กันกับ
 * BusinessTypeTranslation/CurrencyTranslation/ProductTypeTranslation (ดู
 * Vendor::translations()) ยุบมาจากคอลัมน์ `name_en` เดิม (ดู migration
 * create_vendor_translations_table/drop_vendor_name_en_column)
 */
class VendorTranslation extends Model
{
    protected $fillable = [
        'vendor_id',
        'locale_id',
        'label',
    ];

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
