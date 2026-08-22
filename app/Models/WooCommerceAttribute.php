<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

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

    private const LIST_VERSION_KEY = 'woocommerce_attributes:list:version';

    /**
     * The picker list MarketplaceAttributeMappingController::index() needs
     * — was a fresh orderBy('name')->get() on every visit to the "จับคู่เนื้อหา
     * Marketplace" page; same versioned-cache shape as Attribute::cachedList().
     * Call bumpListVersion() after any write here (see
     * WooCommerceAttributeMappingController::syncWoocommerceAttributes()).
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'woocommerce_attributes.list:v'.static::listVersion(),
            fn () => static::orderBy('name')->get(['id', 'name', 'slug'])
        );
    }

    public static function listVersion(): int
    {
        return (int) Cache::get(self::LIST_VERSION_KEY, 1);
    }

    public static function bumpListVersion(): void
    {
        Cache::forever(self::LIST_VERSION_KEY, self::listVersion() + 1);
    }
}
