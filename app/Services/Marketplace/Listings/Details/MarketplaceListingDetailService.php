<?php

namespace App\Services\Marketplace\Listings\Details;

use App\Models\MarketplaceListingDetail;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Cache-or-fetch of marketplace_listing_details (one row per shop + item).
 * READ-ONLY marketplace calls only (the per-platform
 * MarketplaceListingDetailFetcher).
 *
 *  - fetch(): the stored row while it is younger than
 *    config('services.marketplace_listing_details.ttl_hours') (default 24),
 *    unless $force; otherwise fetches and upserts it.
 *  - A failed fetch never throws and never wipes data: the previous good
 *    columns stay, only fetch_error (+ fetch_duration_ms) is written (a row
 *    with fetched_at NULL = never fetched successfully) and it's logged.
 *  - Per-item cache lock: two clicks / a click during the bulk command don't
 *    fetch the same item twice — the second waits and gets the first's row.
 */
class MarketplaceListingDetailService
{
    private const LOCK_SECONDS = 90;

    private const MAX_ERROR_LENGTH = 2000;

    /** how long a request waits for another one fetching the same item */
    public int $lockWaitSeconds = 45;

    public function __construct(private readonly MarketplaceListingDetailFetcherResolver $resolver) {}

    public function ttlHours(): int
    {
        return max(0, (int) config('services.marketplace_listing_details.ttl_hours', 24));
    }

    public function isFresh(?MarketplaceListingDetail $detail): bool
    {
        return $detail?->fetched_at !== null && $detail->fetched_at->gt(now()->subHours($this->ttlHours()));
    }

    public function find(SalesPlatformShop $shop, string $itemId): ?MarketplaceListingDetail
    {
        return MarketplaceListingDetail::where('sales_platform_shop_id', $shop->id)->where('item_id', $itemId)->first();
    }

    public function fetch(SalesPlatformShop $shop, string $itemId, bool $force = false): MarketplaceListingDetail
    {
        $existing = $this->find($shop, $itemId);
        if (! $force && $this->isFresh($existing)) {
            return $existing;
        }

        $requestedAt = now();
        $lock = Cache::lock("marketplace_listing_detail:{$shop->id}:{$itemId}", self::LOCK_SECONDS);

        try {
            return $lock->block($this->lockWaitSeconds, function () use ($shop, $itemId, $force, $requestedAt) {
                $current = $this->find($shop, $itemId);
                // someone else fetched it while we waited for the lock
                if ($current !== null && $current->updated_at !== null && $current->updated_at->gte($requestedAt)) {
                    return $current;
                }
                if (! $force && $this->isFresh($current)) {
                    return $current;
                }

                return $this->fetchNow($shop, $itemId, $current);
            });
        } catch (LockTimeoutException) {
            // still being fetched by another request: whatever is stored, else
            // an unsaved placeholder carrying the message (nothing persisted)
            return $this->find($shop, $itemId) ?? new MarketplaceListingDetail([
                'sales_platform_shop_id' => $shop->id,
                'item_id' => $itemId,
                'platform' => (string) MarketplaceListingFetcherResolver::platformKey($shop->loadMissing('platform')),
                'fetch_error' => 'กำลังดึงข้อมูลรายการนี้อยู่ (อีกคำขอหนึ่ง) — ลองใหม่อีกครั้งในอีกสักครู่',
            ]);
        }
    }

    /**
     * Bulk counterpart of fetch() — items whose detail is still fresh are
     * skipped without an API call (unless $force); $sleepMs pauses between
     * actual API fetches (rate limit). $onItem(itemId, ?detail, outcome)
     * with outcome 'fetched'|'cached'|'failed' — for progress output.
     *
     * @param  iterable<int, string>  $itemIds
     * @return array{fetched: int, cached: int, failed: int}
     */
    public function fetchMany(SalesPlatformShop $shop, iterable $itemIds, bool $force = false, int $sleepMs = 0, ?callable $onItem = null): array
    {
        $stats = ['fetched' => 0, 'cached' => 0, 'failed' => 0];
        $first = true;

        foreach ($itemIds as $itemId) {
            $itemId = (string) $itemId;
            try {
                if (! $force && $this->isFresh($this->find($shop, $itemId))) {
                    $stats['cached']++;
                    $onItem && $onItem($itemId, null, 'cached');

                    continue;
                }
                if (! $first && $sleepMs > 0) {
                    usleep($sleepMs * 1000);
                }
                $first = false;

                $detail = $this->fetch($shop, $itemId, $force);
                $outcome = $detail->fetch_error === null ? 'fetched' : 'failed';
            } catch (\Throwable $e) {
                // fetch() itself never throws on API errors — this is a bug / DB problem
                report($e);
                $detail = null;
                $outcome = 'failed';
            }
            $stats[$outcome]++;
            $onItem && $onItem($itemId, $detail, $outcome);
        }

        return $stats;
    }

    private function fetchNow(SalesPlatformShop $shop, string $itemId, ?MarketplaceListingDetail $current): MarketplaceListingDetail
    {
        $shop->loadMissing('platform');
        $platform = MarketplaceListingFetcherResolver::platformKey($shop);
        if ($platform === null) {
            throw new InvalidArgumentException("Shop '{$shop->name}' is on an unsupported platform.");
        }

        $started = microtime(true);
        try {
            $data = $this->resolver->forPlatform($platform)->fetch($shop, $itemId);
        } catch (\Throwable $e) {
            $ms = (int) round((microtime(true) - $started) * 1000);
            Log::warning('Marketplace listing detail fetch failed', [
                'shop_id' => $shop->id,
                'platform' => $platform,
                'item_id' => $itemId,
                'error' => mb_substr($e->getMessage(), 0, 500),
            ]);

            return $this->recordError($shop, $itemId, $platform, $e->getMessage(), $ms, $current);
        }

        $ms = (int) round((microtime(true) - $started) * 1000);

        return MarketplaceListingDetail::updateOrCreate(
            ['sales_platform_shop_id' => $shop->id, 'item_id' => $itemId],
            [
                'platform' => $platform,
                'name' => $data['name'],
                'description' => $data['description'],
                'description_text' => $data['description_text'],
                'brand_id' => $this->limit($data['brand_id']),
                'brand_name' => $this->limit($data['brand_name']),
                'category_id' => $this->limit($data['category_id']),
                'category_name' => $this->limit($data['category_name']),
                'images' => $data['images'],
                'video_url' => $data['video_url'],
                'attributes' => $data['attributes'],
                'package' => $data['package'],
                'variants' => $data['variants'],
                'status' => $this->limit($data['status']),
                'listing_url' => $data['listing_url'],
                'raw' => $data['raw'],
                'fetched_at' => now(),
                'fetch_error' => null,
                'fetch_duration_ms' => $ms,
            ],
        );
    }

    /** keeps every previously fetched column — only the error/timing is written */
    private function recordError(SalesPlatformShop $shop, string $itemId, ?string $platform, string $error, ?int $ms, ?MarketplaceListingDetail $current = null): MarketplaceListingDetail
    {
        $detail = $current ?? $this->find($shop, $itemId) ?? new MarketplaceListingDetail([
            'sales_platform_shop_id' => $shop->id,
            'item_id' => $itemId,
            'platform' => $platform ?? (string) MarketplaceListingFetcherResolver::platformKey($shop->loadMissing('platform')),
        ]);
        $detail->fill([
            'fetch_error' => mb_substr($error, 0, self::MAX_ERROR_LENGTH),
            'fetch_duration_ms' => $ms,
        ])->save();

        return $detail;
    }

    private function limit(?string $value): ?string
    {
        return $value === null ? null : mb_substr($value, 0, 255);
    }
}
