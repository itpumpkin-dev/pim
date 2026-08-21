<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of Shopee's attribute schema (attribute_id, name, input_type),
 * deduped globally across every category synced — see
 * ShopeeAttributeMappingController::syncShopeeAttributes(). Mirrors
 * WooCommerceAttribute's shape (external, non-incrementing PK).
 */
class ShopeeAttribute extends Model
{
    protected $table = 'shopee_attributes';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
        'input_type',
    ];

    protected $casts = [
        'input_type' => 'integer',
    ];
}
