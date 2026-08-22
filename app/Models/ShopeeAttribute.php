<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

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

    private const LIST_VERSION_KEY = 'shopee_attributes:list:version';

    /**
     * Same versioned-cache shape as WooCommerceAttribute::cachedList() — see
     * that docblock. Call bumpListVersion() after any write here (see
     * ShopeeAttributeMappingController::syncShopeeAttributes()).
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'shopee_attributes.list:v'.static::listVersion(),
            fn () => static::orderBy('name')->get(['id', 'name', 'input_type'])
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
