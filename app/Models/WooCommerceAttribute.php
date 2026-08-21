<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Local cache of WooCommerce's native global Product Attributes taxonomy
 * (pa_color, pa_material, ...) — see
 * WooCommerceAttributeMappingController::syncWoocommerceAttributes() for
 * how this is populated from WooCommerceClient::getAttributes(). Mirrors
 * WooCommerceBrand's shape exactly (external, non-incrementing PK).
 */
class WooCommerceAttribute extends Model
{
    // Laravel's snake-case table-name guess splits "WooCommerce" into
    // "woo_commerce" (each capital treated as a new word) — same mismatch
    // WooCommerceBrand/WooCommerceAttributeMapping work around.
    protected $table = 'woocommerce_attributes';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'id',
        'name',
        'slug',
        'type',
    ];
}
