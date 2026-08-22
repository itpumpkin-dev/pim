<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;

/**
 * One row per PIM attribute mapped into a specific Shopee attribute_list
 * entry — v1 only supports free-text Shopee attributes (input_type
 * FREE_TEXT_FILED = 3), so unlike WooCommerceAttributeMapping there is no
 * target_field: a mapping either has a shopee_attribute_id or doesn't exist.
 * First mapped PIM attribute with a value wins per shopee_attribute_id (by
 * sort_order) — see ShopeeProductSyncService::resolveAttributes(). Managed
 * from the "จับคู่เนื้อหา Shopee" mapping page
 * (ShopeeAttributeMappingController).
 */
class ShopeeAttributeMapping extends Model
{
    use Auditable;

    protected $table = 'shopee_attribute_mappings';

    protected $fillable = [
        'attribute_id',
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
