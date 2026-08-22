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
