<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
}
