<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Local cache of Shopee's attribute schema (attribute_id, name, input_type),
 * deduped globally across every category synced — see
 * ShopeeAttributeMappingController::syncShopeeAttributes(). Mirrors
 * WooCommerceAttribute's shape (external, non-incrementing PK).
 *
 * `category_id`/`mandatory` are per-category context layered on top of that
 * global row — see the migration that added them
 * (2026_08_24_104607_add_category_and_mandatory_to_shopee_attributes_table)
 * and ShopeeAttributeMappingController::syncShopeeAttributesForCategory().
 *
 * `options` (added by 2026_09_08_000007_add_options_to_shopee_attributes_table)
 * mirrors LazadaAttribute::$options — predefined choice list for
 * dropdown/combo-box input_type (1/2/4/5), populated from get_attribute_tree's
 * `attribute_value_list`. Shape confirmed live from a real sandbox sync
 * (2026-09-08): `[{value_id, name, multi_lang}]` — see
 * ShopeeAttributeMappingController::encodeShopeeOptions()'s docblock. Note
 * MULTI_COMBO_BOX (5) attributes seen live carried no attribute_value_list
 * at all — null `options` there is expected, not a sync failure.
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
        'category_id',
        'mandatory',
        'options',
    ];

    protected $casts = [
        'input_type' => 'integer',
        'category_id' => 'integer',
        'mandatory' => 'boolean',
        'options' => 'array',
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
