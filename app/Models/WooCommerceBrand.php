<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of WooCommerce's native "Product Brands" taxonomy — see
 * BrandController::syncWoocommerceBrands() for how this is populated from
 * WooCommerceClient::getBrands(). Mirrors WooCommerceCategory's shape
 * (external, non-incrementing PK) but flatter — no parent/children, since
 * the store's real brand list has no hierarchy.
 */
class WooCommerceBrand extends Model
{
    // Laravel's snake-case table-name guess splits "WooCommerce" into
    // "woo_commerce" (each capital treated as a new word) — same mismatch
    // WooCommerceCategory works around.
    protected $table = 'woocommerce_brands';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
        'slug',
    ];
}
