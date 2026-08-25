<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Local cache of TikTok's category attribute schema (id, name,
 * is_customizable, is_multiple_selection), deduped globally by `id` across
 * every category synced — see TikTokAttributeMappingController::
 * syncTikTokAttributes(). `id` is a string (TikTok's own attribute id) —
 * see the creating migration's docblock for the cross-category-uniqueness
 * caveat.
 *
 * `category_id`/`mandatory` are per-category context layered on top of that
 * global row — see the migration that added them
 * (2026_08_25_043816_add_category_and_mandatory_to_tiktok_attributes_table)
 * and TikTokAttributeMappingController::syncTikTokAttributesForCategory().
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
        'category_id',
        'mandatory',
    ];

    protected $casts = [
        'is_customizable' => 'boolean',
        'is_multiple_selection' => 'boolean',
        'category_id' => 'integer',
        'mandatory' => 'boolean',
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
