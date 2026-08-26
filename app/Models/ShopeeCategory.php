<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Local cache of Shopee's category tree — see CategoryController::
 * syncShopeeCategories() for how this is populated from
 * ShopeeClient::getCategoryTree(). Mirrors LazadaCategory.
 */
class ShopeeCategory extends Model
{
    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'parent_id',
        'name',
        'name_th',
        'is_leaf',
    ];

    protected $casts = [
        'is_leaf' => 'boolean',
    ];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }
}
