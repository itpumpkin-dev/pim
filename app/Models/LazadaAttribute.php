<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Local cache of Lazada's category attribute schema (name, label,
 * input_type, attribute_type, options), deduped globally by `name` across
 * every category synced — see LazadaAttributeMappingController::
 * syncLazadaAttributes(). Keyed by `name` rather than a numeric id — see the
 * creating migration's docblock for why. Safe to dedupe by name alone
 * because these particular columns describe the *shape* of a field
 * (its label/input type/predefined choices), which Lazada doesn't redefine
 * differently per category for the same field name.
 *
 * `category_id`/`mandatory` DEPRECATED — no longer read or written by this
 * app. They used to layer "is this field mandatory, and which category was
 * it last seen under" directly onto this same globally-deduped row, which
 * was a confirmed real bug: a field name shared by several categories (e.g.
 * "brand", "package_weight") only ever had ONE `category_id`/`mandatory`
 * pair, so re-syncing any other category silently overwrote it — a product
 * in category A would report "brand not mandatory here" right after someone
 * synced category B, even though nothing about category A's real Lazada
 * schema changed. Superseded by `LazadaCategoryAttribute`
 * (`lazada_category_attributes`, PK `(category_id, lazada_attribute_name)`)
 * — see that model's docblock. The two columns still physically exist on
 * this table (left alone rather than dropped, to avoid a riskier migration
 * for no benefit) but hold stale/partial historical data only; nothing in
 * this codebase should read them going forward.
 *
 * `options`/`label_th` columns already exist on this table in every
 * environment checked (confirmed live via `Schema::getColumnListing()`) but
 * predate every migration in this codebase's history — nothing here ever
 * wrote to them until LazadaAttributeMappingController's sync methods were
 * extended to populate `options` (Lazada's predefined choice list for
 * singleSelect/multiSelect/enumInput/multiEnumInput attributes, confirmed
 * live shape: `[{name, en_name, id}]` per choice — `id` is the value Lazada
 * expects back, `name`/`en_name` are display labels). `label_th` stays
 * untouched by this app (whatever wrote it originally still owns it).
 */
class LazadaAttribute extends Model
{
    protected $table = 'lazada_attributes';

    protected $primaryKey = 'name';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'name',
        'label',
        'input_type',
        'attribute_type',
        'options',
    ];

    protected $casts = [
        'options' => 'array',
    ];

    private const LIST_VERSION_KEY = 'lazada_attributes:list:version';

    /**
     * Same versioned-cache shape as WooCommerceAttribute::cachedList() — see
     * that docblock. Call bumpListVersion() after any write here (see
     * LazadaAttributeMappingController::syncLazadaAttributes()).
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'lazada_attributes.list:v'.static::listVersion(),
            fn () => static::orderBy('label')->get(['name', 'label', 'input_type'])
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
