<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CategoryFieldValue extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'category_id',
        'category_field_id',
        'locale_id',
        'value',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function categoryField(): BelongsTo
    {
        return $this->belongsTo(CategoryField::class);
    }

    public function locale(): BelongsTo
    {
        return $this->belongsTo(Locale::class);
    }
}
