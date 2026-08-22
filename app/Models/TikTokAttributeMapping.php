<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per PIM attribute mapped into a specific TikTok product
 * attribute — v1 only supports attributes TikTok marks `is_customizable`
 * (free value allowed), so like ShopeeAttributeMapping/LazadaAttributeMapping
 * there is no target_field: a mapping either has a tiktok_attribute_id or
 * doesn't exist. First mapped PIM attribute with a value wins per
 * tiktok_attribute_id (by sort_order) — see TikTokProductSyncService::
 * resolveProductAttributes(). Managed from the "จับคู่เนื้อหา TikTok"
 * mapping page (TikTokAttributeMappingController).
 */
class TikTokAttributeMapping extends Model
{
    use Auditable;

    protected $table = 'tiktok_attribute_mappings';

    protected $fillable = [
        'attribute_id',
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
}
