<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Local cache of Lazada's category attribute schema (name, label,
 * input_type, attribute_type), deduped globally by `name` across every
 * category synced — see LazadaAttributeMappingController::syncLazadaAttributes().
 * Keyed by `name` rather than a numeric id — see the creating migration's
 * docblock for why.
 *
 * `category_id`/`mandatory` are per-category context layered on top of that
 * global row — see the migration that added them
 * (2026_08_25_013412_add_category_and_mandatory_to_lazada_attributes_table)
 * and LazadaAttributeMappingController::syncLazadaAttributesForCategory().
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
        'category_id',
        'mandatory',
        'options',
    ];

    protected $casts = [
        'category_id' => 'integer',
        'mandatory' => 'boolean',
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
