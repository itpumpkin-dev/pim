<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * One sellable unit on a marketplace shop (see the create_marketplace_listings
 * migration's docblock). Rows are written in bulk by
 * MarketplaceListingSyncService — deliberately not Auditable (a sync touches
 * thousands of rows per shop); the matching actions write their own
 * AuditLog::record() entries instead.
 *
 * A listing is linked to PIM in exactly one of two shapes:
 *  - single link: product_id set (+ optional pack_quantity N = the listing
 *    sells N× that product, e.g. `15123_5`), no component rows;
 *  - bundle: product_id NULL, one MarketplaceListingComponent row per
 *    product (with its quantity), match_method 'bundle' (linked by hand) or
 *    'suggested' (an accepted bundle suggestion).
 * "Linked" = product_id set OR has component rows (scopeLinked()).
 *
 * match_method:
 *  - auto_sku  exact products.sku = btrim(seller_sku), owned by the sync's
 *              auto-matcher (re-evaluated every sync);
 *  - manual    linked by a person ("ผูกเอง");
 *  - suggested a ListingMatchSuggester suggestion, or a stored score-based
 *              ListingScoreSuggester one (marketplace_listing_suggestions),
 *              confirmed by a person;
 *  - bundle    a bundle linked by hand (components);
 *  - pushed    created by our own push.
 * The auto-matcher only ever touches rows whose match_method is NULL or
 * 'auto_sku' and that are not ignored (ignored_at NULL).
 *
 * Unlinking resets match_method to NULL, so the next sync may auto-match the
 * row again by exact SKU — to keep a listing unlinked, ignore it instead.
 */
class MarketplaceListing extends Model
{
    public const MATCH_AUTO_SKU = 'auto_sku';

    public const MATCH_MANUAL = 'manual';

    public const MATCH_PUSHED = 'pushed';

    public const MATCH_SUGGESTED = 'suggested';

    public const MATCH_BUNDLE = 'bundle';

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
        'data_changed_at',
        'ignored_at',
        'ignored_by',
        'ignore_reason',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'price' => 'decimal:2',
        'quantity' => 'integer',
        'pack_quantity' => 'integer',
        'matched_at' => 'datetime',
        'last_synced_at' => 'datetime',
        'data_changed_at' => 'datetime',
        'ignored_at' => 'datetime',
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

    public function ignoredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ignored_by');
    }

    public function components(): HasMany
    {
        return $this->hasMany(MarketplaceListingComponent::class);
    }

    /**
     * The item's cached full detail (marketplace_listing_details). NOT a real
     * FK: matched on (sales_platform_shop_id, item_id) — every variant row of
     * the item shares one detail row, and listing rows are re-created by each
     * sync. Lazy loading only ($listing->detail): the shop condition reads
     * this model's own sales_platform_shop_id, which an eager load (with())
     * doesn't have. May be missing — fetch it with
     * MarketplaceListingDetailService::fetch().
     */
    public function detail(): HasOne
    {
        return $this->hasOne(MarketplaceListingDetail::class, 'item_id', 'item_id')
            ->where('marketplace_listing_details.sales_platform_shop_id', $this->sales_platform_shop_id);
    }

    public function isLinked(): bool
    {
        return $this->product_id !== null || $this->components()->exists();
    }

    /** Linked to PIM — a single product or a bundle (has component rows). */
    public function scopeLinked(Builder $query): Builder
    {
        return $query->where(fn ($q) => $q->whereNotNull('marketplace_listings.product_id')
            ->orWhereExists(fn ($e) => $e->selectRaw('1')->from('marketplace_listing_components')
                ->whereColumn('marketplace_listing_components.marketplace_listing_id', 'marketplace_listings.id')));
    }

    /** Not linked and not ignored — the matching work queue. */
    public function scopeUnlinked(Builder $query): Builder
    {
        return $query->whereNull('marketplace_listings.product_id')
            ->whereNotExists(fn ($e) => $e->selectRaw('1')->from('marketplace_listing_components')
                ->whereColumn('marketplace_listing_components.marketplace_listing_id', 'marketplace_listings.id'))
            ->whereNull('marketplace_listings.ignored_at');
    }
}
