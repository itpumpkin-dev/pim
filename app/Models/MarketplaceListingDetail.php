<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Full product detail of one marketplace listing item on one shop (see the
 * create_marketplace_listing_details migration's docblock for the column
 * shapes). Written only by MarketplaceListingDetailService — a cache of
 * read-only API calls, so deliberately not Auditable.
 *
 * The variant rows of the item in marketplace_listings share this row:
 * MarketplaceListing::detail() matches on (sales_platform_shop_id, item_id).
 */
class MarketplaceListingDetail extends Model
{
    protected $fillable = [
        'sales_platform_shop_id',
        'platform',
        'item_id',
        'name',
        'description',
        'description_text',
        'brand_id',
        'brand_name',
        'category_id',
        'category_name',
        'images',
        'video_url',
        'attributes',
        'package',
        'variants',
        'status',
        'listing_url',
        'raw',
        'fetched_at',
        'fetch_error',
        'fetch_duration_ms',
    ];

    protected $casts = [
        'images' => 'array',
        'attributes' => 'array',
        'package' => 'array',
        'variants' => 'array',
        'raw' => 'array',
        'fetched_at' => 'datetime',
        'fetch_duration_ms' => 'integer',
    ];

    public function shop(): BelongsTo
    {
        return $this->belongsTo(SalesPlatformShop::class, 'sales_platform_shop_id');
    }

    /** Has good data (a fetch succeeded at least once) — fetch_error may still be set by a later failed refresh. */
    public function hasData(): bool
    {
        return $this->fetched_at !== null;
    }
}
