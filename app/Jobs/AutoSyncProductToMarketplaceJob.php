<?php

namespace App\Jobs;

use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\MarketplaceSyncDispatcher;
use App\Services\Marketplace\MarketplaceSyncGate;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Fires ~2 minutes after QueueAutoMarketplaceSync schedules it (see that
 * listener for the debounce mechanics) — reads the *latest* intended action
 * from cache rather than carrying it as a constructor argument, so a second
 * edit during the debounce window (e.g. price changed, then enabled toggled
 * off) is what actually runs, not whatever was true the moment this job was
 * queued.
 *
 * Re-validates everything a manual push would (still published, category/
 * brand mapped) because up to 2 minutes have passed and any of that could
 * have changed. Unlike the manual "Push" button, there's no request to
 * return a 422 to — an unmapped category/brand just skips this round
 * silently; the user still sees the real error the next time they push by
 * hand, same as ProductController::queueMarketplaceSync() would report it.
 *
 * No `tries`/`timeout` override needed beyond what
 * SyncProductToMarketplaceJob (which this ultimately queues) already sets —
 * this job itself only does cheap local lookups, the actual marketplace HTTP
 * call happens in that job, not this one.
 */
class AutoSyncProductToMarketplaceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $productId, public int $shopId) {}

    public function handle(MarketplaceSyncGate $gate, MarketplaceSyncDispatcher $dispatcher): void
    {
        $actionKey = "marketplace_autosync:action:{$this->productId}:{$this->shopId}";
        $action = Cache::pull($actionKey);
        if (! $action) {
            // Nothing pending — shouldn't normally happen (the listener sets
            // this key with a generous TTL — see QueueAutoMarketplaceSync::
            // ACTION_KEY_TTL_MINUTES — before scheduling this job), but a
            // defensive no-op beats a fatal error over a stale/cleared cache
            // entry. Logged (not just silently returning) so a queue lagging
            // long enough to actually hit this is visible somewhere instead
            // of just quietly dropping the sync.
            Log::warning('AutoSyncProductToMarketplaceJob: no pending action found, skipping', [
                'product_id' => $this->productId,
                'shop_id' => $this->shopId,
            ]);

            return;
        }

        $product = Product::find($this->productId);
        $shop = SalesPlatformShop::with('platform:id,code')->find($this->shopId);
        if (! $product || ! $shop || ! $shop->platform) {
            return;
        }

        $platform = $shop->platform->code;

        $stillPublished = $product->platformShops()->where('sales_platform_shops.id', $shop->id)->exists();
        if (! $stillPublished) {
            return;
        }

        if ($action === 'push' && (! $gate->categoryMapped($product, $platform) || ! $gate->brandMapped($product, $platform))) {
            return;
        }

        $dispatcher->queue($product, $shop, $platform, $action);
    }
}
