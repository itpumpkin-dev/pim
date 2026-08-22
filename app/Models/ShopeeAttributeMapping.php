<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;

/**
 * One row per PIM attribute mapped into a Shopee push field — same
 * `target_field` shape as WooCommerceAttributeMapping: either one of
 * Shopee's structured payload fields (`name`/`price`/`qty`/`weight`/
 * `length`/`width`/`height`/`description`/`video`, first mapped attribute
 * with a value wins — see ShopeeProductSyncService::resolveMappedField())
 * or `shopee_attribute` (feeds one specific `attribute_list` entry,
 * identified by `shopee_attribute_id` — see resolveAttributes()). v1 only
 * supports free-text Shopee attributes (input_type FREE_TEXT_FILED = 3) for
 * the `shopee_attribute` case. `video` is further restricted server-side to
 * PIM attributes of type `video` (see ShopeeAttributeMappingController) —
 * same external-URL restriction Lazada/TikTok's video fields have. Managed
 * from the "จับคู่เนื้อหา Shopee" mapping page (ShopeeAttributeMappingController).
 */
class ShopeeAttributeMapping extends Model
{
    use Auditable;

    protected $table = 'shopee_attribute_mappings';

    protected $fillable = [
        'attribute_id',
        'target_field',
        'shopee_attribute_id',
        'sort_order',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'sort_order' => 'integer',
    ];

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(Attribute::class);
    }

    public function shopeeAttribute(): BelongsTo
    {
        return $this->belongsTo(ShopeeAttribute::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    private const LIST_VERSION_KEY = 'shopee_attribute_mappings:list:version';

    /**
     * Same versioned-cache shape as WooCommerceAttributeMapping::cachedList()
     * — see that docblock. Call bumpListVersion() after any write here (see
     * ShopeeAttributeMappingController::update()).
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'shopee_attribute_mappings.list:v'.static::listVersion(),
            fn () => static::all()
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
