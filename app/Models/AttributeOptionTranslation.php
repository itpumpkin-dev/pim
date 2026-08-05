<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AttributeOptionTranslation extends Model
{
    protected $fillable = [
        'attribute_option_id',
        'locale_id',
        'label',
    ];

    public function option(): BelongsTo
    {
        return $this->belongsTo(AttributeOption::class, 'attribute_option_id');
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
