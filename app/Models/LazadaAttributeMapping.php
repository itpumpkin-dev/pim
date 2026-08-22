<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;

/**
 * One row per PIM attribute mapped into a Lazada push field — same
 * `target_field` shape as WooCommerceAttributeMapping/ShopeeAttributeMapping:
 * either one of Lazada's structured payload fields (`name`/`price`/`qty`/
 * `weight`/`length`/`width`/`height`/`video`, first mapped attribute with a
 * value wins — see LazadaProductSyncService::resolveMappedField()) or
 * `lazada_attribute` (feeds one specific category attribute, identified by
 * `lazada_attribute_name` — see resolveMappedAttributes()). v1 only
 * supports free-value attributes (input_type text/numeric) for the
 * `lazada_attribute` case. `video` is further restricted server-side to PIM
 * attributes of type `video` (see LazadaAttributeMappingController) — Lazada
 * rejects external video URLs. Managed from the "จับคู่เนื้อหา Lazada"
 * mapping page (LazadaAttributeMappingController).
 */
class LazadaAttributeMapping extends Model
{
    use Auditable;

    protected $table = 'lazada_attribute_mappings';

    protected $fillable = [
        'attribute_id',
        'target_field',
        'lazada_attribute_name',
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

    public function lazadaAttribute(): BelongsTo
    {
        return $this->belongsTo(LazadaAttribute::class, 'lazada_attribute_name', 'name');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    private const LIST_VERSION_KEY = 'lazada_attribute_mappings:list:version';

    /**
     * Same versioned-cache shape as WooCommerceAttributeMapping::cachedList()
     * — see that docblock. Call bumpListVersion() after any write here (see
     * LazadaAttributeMappingController::update()).
     */
    public static function cachedList(): \Illuminate\Support\Collection
    {
        return Cache::rememberForever(
            'lazada_attribute_mappings.list:v'.static::listVersion(),
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
