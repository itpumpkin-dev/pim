<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;

/**
 * One row per PIM attribute mapped into a specific Lazada category
 * attribute — v1 only supports free-value attributes (input_type text/
 * numeric), so like ShopeeAttributeMapping there is no target_field: a
 * mapping either has a lazada_attribute_name or doesn't exist. First mapped
 * PIM attribute with a value wins per lazada_attribute_name (by sort_order)
 * — see LazadaProductSyncService::buildPayload(). Managed from the
 * "จับคู่เนื้อหา Lazada" mapping page (LazadaAttributeMappingController).
 */
class LazadaAttributeMapping extends Model
{
    use Auditable;

    protected $table = 'lazada_attribute_mappings';

    protected $fillable = [
        'attribute_id',
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
