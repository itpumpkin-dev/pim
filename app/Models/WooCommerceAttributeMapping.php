<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row per PIM attribute chosen to feed into a WooCommerce push
 * field — `target_field` is either a content field (`description`/
 * `short_description`, composed from every mapped attribute — see
 * WooCommerceProductSyncService::buildContentFields()), a structured
 * field (`name`/`price`/`image`/`qty`/`weight`/`length`/`width`/`height`,
 * first mapped attribute with a value wins — see resolveMappedField()),
 * or `wc_attribute` (feeds one specific WooCommerce Product Attribute,
 * identified by `woocommerce_attribute_id` — see
 * buildWooCommerceAttributes()). Managed from the "PIM Attribute →
 * WooCommerce Content" mapping page (WooCommerceAttributeMappingController).
 */
class WooCommerceAttributeMapping extends Model
{
    use Auditable;

    protected $table = 'woocommerce_attribute_mappings';

    protected $fillable = [
        'attribute_id',
        'target_field',
        'woocommerce_attribute_id',
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

    /** Only set when target_field === 'wc_attribute' — see WooCommerceProductSyncService::buildWooCommerceAttributes(). */
    public function wooCommerceAttribute(): BelongsTo
    {
        return $this->belongsTo(WooCommerceAttribute::class);
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
