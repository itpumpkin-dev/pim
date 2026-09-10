<?php

namespace App\Services\Marketplace;

use App\Jobs\SyncProductToMarketplaceJob;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\SalesPlatformShop;

/**
 * Creates the ProductMarketplaceSyncJob tracking row and queues the actual
 * push/deactivate/delete work — the one piece both the manual "Push" button
 * (ProductController::dispatchMarketplaceSyncJob(), which keeps calling this)
 * and the auto-sync path (AutoSyncProductToMarketplaceJob) need identically.
 * `userId` is left null for auto-sync rows, same as any other
 * system-initiated write (see AuditLog::record()'s null-userId convention).
 */
class MarketplaceSyncDispatcher
{
    public function queue(Product $product, SalesPlatformShop $shop, string $platform, string $action, ?int $userId = null): ProductMarketplaceSyncJob
    {
        $syncJob = ProductMarketplaceSyncJob::create([
            'product_id' => $product->id,
            'sales_platform_shop_id' => $shop->id,
            'platform' => $platform,
            'action' => $action,
            'status' => 'queued',
            'user_id' => $userId,
        ]);

        SyncProductToMarketplaceJob::dispatch($syncJob->id, $userId);

        return $syncJob;
    }
}
