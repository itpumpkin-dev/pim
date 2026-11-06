<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One sellable unit on a marketplace shop (see the create_marketplace_listings
 * migration's docblock). Rows are written in bulk by
 * MarketplaceListingSyncService — deliberately not Auditable (a sync touches
 * thousands of rows per shop).
 */
class MarketplaceListing extends Model
{
    public const MATCH_AUTO_SKU = 'auto_sku';

    public const MATCH_MANUAL = 'manual';

    public const MATCH_PUSHED = 'pushed';

    protected $fillable = [
        'sales_platform_shop_id',
        'platform',
        'item_id',
        'variant_id',
        'seller_sku',
        'name',
        'status',
        'is_active',
        'price',
        'quantity',
        'image_url',
        'url',
        'product_id',
        'match_method',
        'matched_at',
        'matched_by',
        'pack_quantity',
        'last_synced_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'price' => 'decimal:2',
        'quantity' => 'integer',
        'pack_quantity' => 'integer',
        'matched_at' => 'datetime',
        'last_synced_at' => 'datetime',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(SalesPlatformShop::class, 'sales_platform_shop_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function matchedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'matched_by');
    }
}
