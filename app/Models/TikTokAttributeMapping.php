<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;

/**
 * One row per PIM attribute mapped into a TikTok push field — same
 * `target_field` shape as WooCommerceAttributeMapping/ShopeeAttributeMapping:
 * either one of TikTok's structured payload fields (`name`/`price`/`qty`/
 * `weight`/`length`/`width`/`height`/`description`/`video`, first mapped
 * attribute with a value wins — see TikTokProductSyncService::
 * resolveMappedField()) or `tiktok_attribute` (feeds one specific product
 * attribute, identified by `tiktok_attribute_id` — see
 * resolveProductAttributes()). v1 only supports attributes TikTok marks
 * `is_customizable` (free value allowed) for the `tiktok_attribute` case.
 * `video` is further restricted server-side to PIM attributes of type
 * `video` (see TikTokAttributeMappingController) — same external-URL
 * restriction Lazada's own video field has. Managed from the
 * "จับคู่เนื้อหา TikTok" mapping page (TikTokAttributeMappingController).
 */
class TikTokAttributeMapping extends Model
{
    use Auditable;

    protected $table = 'tiktok_attribute_mappings';

    protected $fillable = [
        'attribute_id',
        'target_field',
        'tiktok_attribute_id',
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

    public function tiktokAttribute(): BelongsTo
    {
        return $this->belongsTo(TikTokAttribute::class, 'tiktok_attribute_id', 'id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    private const LIST_VERSION_KEY = 'tiktok_attribute_mappings:list:version';

    /**
     * Same versioned-cache shape as WooCommerceAttributeMapping::cachedList()
     * — see that docblock. Call bumpListVersion() after any write here (see
     * TikTokAttributeMappingController::update()).
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'tiktok_attribute_mappings.list:v'.static::listVersion(),
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
