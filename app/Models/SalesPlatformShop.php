<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
