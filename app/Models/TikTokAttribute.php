<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Local cache of TikTok's category attribute schema (id, name,
 * is_customizable, is_multiple_selection, options), deduped globally by
 * `id` across every category synced — see TikTokAttributeMappingController::
 * syncTikTokAttributes(). `id` is a string (TikTok's own attribute id) —
 * see the creating migration's docblock for the cross-category-uniqueness
 * caveat (TikTok attribute ids are documented in this codebase's own prior
 * investigation as possibly category-specific rather than global, unlike
 * Shopee's — never confirmed either way; this dedup-by-`id` choice mirrors
 * ShopeeAttribute's anyway and hasn't caused an observed problem).
 *
 * `category_id`/`mandatory` DEPRECATED — no longer read or written by this
 * app. They used to layer "is this field mandatory, and which category was
 * it last seen under" directly onto this same globally-deduped row (added
 * by 2026_08_25_043816_add_category_and_mandatory_to_tiktok_attributes_table),
 * which was a confirmed real bug: TikTokAttributeMappingController::
 * syncTikTokAttributesForCategory() upserted with `uniqueBy(['id'])` alone,
 * so if the same attribute `id` were ever seen under more than one
 * category, re-syncing any other category would silently overwrite this
 * category's mandatory answer — the same class of bug already found and
 * fixed for Lazada/Shopee's equivalent columns (see LazadaAttribute's
 * docblock). Superseded by `TikTokCategoryAttribute`
 * (`tiktok_category_attributes`, PK `(category_id, tiktok_attribute_id)`)
 * — see that model's docblock, including the nuance about `id`'s
 * cross-category stability not actually mattering for that table's
 * correctness. The two columns still physically exist on this table (left
 * alone rather than dropped, to avoid a riskier migration for no benefit)
 * but hold stale/partial historical data only; nothing in this codebase
 * should read them going forward.
 *
 * `options` (added by 2026_09_09_000001_add_options_to_tiktok_attributes_table)
 * — predefined choice list for `is_customizable=false` attributes, populated
 * from get_attributes' `values[]`. Shape confirmed live before this feature
 * existed (see TikTokClient::getAttributes()'s docblock, 2026-08-17):
 * `[{id, name}]` — `id` is the value TikTok expects back on push, `name` is
 * the display label. Unlike Lazada/Shopee there is no `input_type` column —
 * `is_customizable`/`is_multiple_selection` already fully classify an
 * attribute (customizable = free text; not customizable +
 * is_multiple_selection = multi-select from `options`; not customizable,
 * not multiple = single-select from `options`).
 */
class TikTokAttribute extends Model
{
    protected $table = 'tiktok_attributes';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'is_customizable',
        'is_multiple_selection',
        'options',
    ];

    protected $casts = [
        'is_customizable' => 'boolean',
        'is_multiple_selection' => 'boolean',
        'options' => 'array',
    ];

    private const LIST_VERSION_KEY = 'tiktok_attributes:list:version';

    /**
     * Same versioned-cache shape as WooCommerceAttribute::cachedList() — see
     * that docblock. Call bumpListVersion() after any write here (see
     * TikTokAttributeMappingController::syncTikTokAttributes()).
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'tiktok_attributes.list:v'.static::listVersion(),
            fn () => static::orderBy('name')->get(['id', 'name', 'is_customizable'])
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
