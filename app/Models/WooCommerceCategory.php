<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Local cache of WooCommerce's product categories — see CategoryController::
 * syncWoocommerceCategories() for how this is populated from
 * WooCommerceClient::getCategories(). Mirrors ShopeeCategory/LazadaCategory.
 */
class WooCommerceCategory extends Model
{
    // Laravel's snake-case table-name guess splits "WooCommerce" into
    // "woo_commerce" (each capital treated as a new word) — doesn't match
    // the actual `woocommerce_categories` table from the migration.
    protected $table = 'woocommerce_categories';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'parent_id',
        'name',
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
