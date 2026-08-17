<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tracks one push/deactivate call to Lazada or Shopee, run in the background
 * via SyncProductToMarketplaceJob rather than inline in the web request —
 * see ProductController::pushToLazada() and friends. The frontend polls
 * status/message/result via ProductController::marketplaceSyncJobStatus()
 * until status leaves 'queued'/'processing'.
 */
class ProductMarketplaceSyncJob extends Model
{
    protected $fillable = [
        'product_id',
        'sales_platform_shop_id',
        'platform',
        'action',
        'status',
        'message',
        'result',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'result' => 'array',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function shop(): BelongsTo
    {
        return $this->belongsTo(SalesPlatformShop::class, 'sales_platform_shop_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
