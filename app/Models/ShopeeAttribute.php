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
 * `category_id`/`mandatory` DEPRECATED — no longer read or written by this
 * app. They used to layer "is this attribute_id mandatory, and which
 * category was it last seen under" directly onto this same globally-deduped
 * row (see 2026_08_24_104607_add_category_and_mandatory_to_shopee_attributes_table,
 * whose own docblock already flagged `category_id` as "informational, not a
 * real FK" — it only tracked the last category an attribute_id was synced
 * under). This was a confirmed real bug: an attribute_id shared by several
 * Shopee categories only ever had ONE `category_id`/`mandatory` pair, so
 * re-syncing any other category silently overwrote it — a product in
 * category A would report "this field isn't mandatory here" right after
 * someone synced category B, even though nothing about category A's real
 * Shopee schema changed. Superseded by `ShopeeCategoryAttribute`
 * (`shopee_category_attributes`, PK `(category_id, shopee_attribute_id)`) —
 * see that model's docblock. The two columns still physically exist on this
 * table (left alone rather than dropped, to avoid a riskier migration for no
 * benefit) but hold stale/partial historical data only; nothing in this
 * codebase should read them going forward.
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
        'options',
    ];

    protected $casts = [
        'input_type' => 'integer',
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
