<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Cache;

class SalesPlatformShop extends Model
{
    use Auditable;

    protected $fillable = [
        'sales_platform_id',
        'channel_id',
        'code',
        'name',
        'lazada_seller_account_id',
        'shopee_seller_account_id',
        'tiktok_seller_account_id',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function platform(): BelongsTo
    {
        return $this->belongsTo(SalesPlatform::class, 'sales_platform_id');
    }

    /**
     * The Channel used to scope this shop's product values (price,
     * description, ...) — see syncLazadaShops(), which keeps this in sync.
     */
    public function channel(): BelongsTo
    {
        return $this->belongsTo(Channel::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    /**
     * Every shop with a linked Channel (the ones a product can actually be
     * pushed to — see ProductController::edit()'s channelGroups, which
     * queries this same shape), grouped by platform name — used by the
     * product list's bulk "Share" dialog to build its channel picker
     * without re-running this join on every grid search/filter keystroke.
     * Short TTL rather than the app's usual versioned-cache convention:
     * shops change rarely and there's no single CRUD entry point worth
     * wiring invalidation through, same trade-off as
     * BrandController::brandProductCounts().
     *
     * @return array<int, array{platform: string, shops: array<int, array{id: int, name: string}>}>
     */
    public static function cachedGroupedByPlatform(): array
    {
        return Cache::remember(
            'sales_platform_shops.grouped_by_platform',
            now()->addMinutes(10),
            fn () => static::with('platform:id,code,name')
                ->whereNotNull('channel_id')
                ->get(['id', 'name', 'sales_platform_id'])
                ->groupBy(fn (self $shop) => $shop->platform->name ?? 'Other')
                ->map(fn ($shops, $platform) => [
                    'platform' => $platform,
                    'shops' => $shops->map(fn (self $shop) => ['id' => $shop->id, 'name' => $shop->name])->values()->all(),
                ])
                ->values()
                ->all()
        );
    }

    /**
     * lazada_seller_account_id points at a row in n8n's separate database
     * (see LazadaSellerAccount), so it can't be a real Eloquent relation —
     * resolved with a lookup instead.
     */
    public function lazadaAccount(): ?LazadaSellerAccount
    {
        if (! $this->lazada_seller_account_id) {
            return null;
        }

        return LazadaSellerAccount::find($this->lazada_seller_account_id);
    }

    /**
     * shopee_seller_account_id points at a row in n8n's separate database
     * (see ShopeeSellerAccount), same cross-database situation as
     * lazadaAccount() above — resolved with a lookup instead of a relation.
     */
    public function shopeeAccount(): ?ShopeeSellerAccount
    {
        if (! $this->shopee_seller_account_id) {
            return null;
        }

        return ShopeeSellerAccount::find($this->shopee_seller_account_id);
    }

    /**
     * tiktok_seller_account_id points at a row in n8n's separate database
     * (see TikTokSellerAccount), same cross-database situation as
     * lazadaAccount()/shopeeAccount() above — resolved with a lookup instead
     * of a relation.
     */
    public function tiktokAccount(): ?TikTokSellerAccount
    {
        if (! $this->tiktok_seller_account_id) {
            return null;
        }

        return TikTokSellerAccount::find($this->tiktok_seller_account_id);
    }
}
