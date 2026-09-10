<?php

namespace App\Listeners;

use App\Events\ProductDataChanged;
use App\Jobs\AutoSyncProductToMarketplaceJob;
use App\Models\Product;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Cache;

/**
 * Auto-sync gap-closer: Akeneo pushes a webhook the moment a product changes;
 * this project used to require a human to click "Push" every time (see
 * ProductController::queueMarketplaceSync()). Riding ProductDataChanged means
 * this fires on exactly the conditions that already mattered enough to bump
 * the storefront cache — any attribute value change, category change, or a
 * change to sku/family/type/enabled (see ProductController::update()) — so
 * "every edit" and "every push-worthy edit" are the same trigger, no new
 * dirty-tracking needed.
 *
 * Gated behind config('services.marketplace_sync.auto_enabled') so this can
 * ship dark and be flipped on/off with one env var, no redeploy — see
 * MARKETPLACE_AUTO_SYNC in .env.
 *
 * Debounced 2 minutes per (product, shop): several attribute saves in a row
 * (or a bulk edit touching many fields) would otherwise queue one real
 * marketplace write per save. Cache::add() is the debounce lock — atomic, so
 * only the first edit in a 2-minute window schedules the delayed job; every
 * edit still updates the "latest intended action" key so the eventual job
 * always acts on the freshest state instead of the state at the moment it
 * happened to be scheduled. The lock's own TTL (2 min) matches the job's
 * delay, so it just expires right as the job runs — no explicit cleanup
 * needed there (AutoSyncProductToMarketplaceJob does clear the action key
 * once it reads it, so a slow/failed run doesn't leave a stale action
 * behind for next time).
 *
 * The action key's own TTL (ACTION_KEY_TTL_MINUTES, well past the job's
 * DEBOUNCE_MINUTES delay) is a separate, much larger safety margin — found
 * via code review that the original +3-minute margin could let a congested
 * queue (worker down, backlog) outlive the cache entry, so the job's
 * Cache::pull() would come back empty and it'd silently no-op the whole
 * sync with no retry (see AutoSyncProductToMarketplaceJob, which now also
 * logs that case instead of only silently returning).
 */
class QueueAutoMarketplaceSync implements ShouldQueue
{
    private const DEBOUNCE_MINUTES = 2;

    // Generous on purpose — this is just how long we tolerate a delayed
    // queue before treating the debounced intent as abandoned, not a
    // correctness window (Cache::put() below refreshes it on every edit, and
    // the job Cache::pull()s + deletes it the moment it actually runs) — a
    // queue lagging this far behind has bigger problems than this one miss.
    private const ACTION_KEY_TTL_MINUTES = 60;

    public function handle(ProductDataChanged $event): void
    {
        if (! config('services.marketplace_sync.auto_enabled')) {
            return;
        }

        // Product::find, not the event's $enabled flag alone — need
        // platformShops() below, and the product may already be gone by the
        // time this (queued) listener runs, e.g. it was deleted right after
        // (ProductController::destroy() fires this same event with
        // enabled=false, but the row is already gone by then — there's no
        // product left to build a push/deactivate payload from, so this
        // silently no-ops for that case rather than crash).
        $product = Product::with('platformShops.platform')->find($event->productId);
        if (! $product) {
            return;
        }

        $action = $product->enabled ? 'push' : 'deactivate';

        foreach ($product->platformShops as $shop) {
            if (! $shop->platform) {
                continue;
            }

            $lockKey = "marketplace_autosync:lock:{$product->id}:{$shop->id}";
            $actionKey = "marketplace_autosync:action:{$product->id}:{$shop->id}";

            // Always refresh the intended action — a later edit in the same
            // window (e.g. enabled toggled back on) should win over an
            // earlier one, even though only the first edit's Cache::add()
            // below actually schedules the job.
            Cache::put($actionKey, $action, now()->addMinutes(self::ACTION_KEY_TTL_MINUTES));

            if (Cache::add($lockKey, true, now()->addMinutes(self::DEBOUNCE_MINUTES))) {
                AutoSyncProductToMarketplaceJob::dispatch($product->id, $shop->id)
                    ->delay(now()->addMinutes(self::DEBOUNCE_MINUTES));
            }
        }
    }
}
