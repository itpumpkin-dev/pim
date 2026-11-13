<?php

namespace App\Services\Marketplace\Listings;

use App\Models\MarketplaceListing;
use App\Models\SalesPlatformShop;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

/**
 * Product Matching phase 1: mirror every listing of one shop into
 * marketplace_listings, then auto-match it to a PIM product by exact SKU.
 *
 *  1. fetch (MarketplaceListingFetcher — read-only API calls) → chunked
 *     upsert on (shop, item_id, variant_id). The upsert never writes
 *     product_id/match_* — those belong to matching.
 *  2. delete rows of this shop not seen in this sync (stamped by
 *     last_synced_at), with the same safety idea as
 *     LazadaProductSyncService::syncMasterProductList(): a sync that yielded
 *     nothing at all never wipes the shop (far likelier a parsing/shape gap
 *     than a seller emptying their whole shop), and items the fetcher
 *     reported as incomplete keep their rows.
 *  3. auto-match, set-based in SQL: only rows whose match_method is NULL or
 *     'auto_sku' and that are not ignored are touched — 'manual'/'suggested'/
 *     'bundle'/'pushed' are never modified.
 */
class MarketplaceListingSyncService
{
    /** synced columns whose change moves data_changed_at (see flush()) */
    private const TRACKED_COLUMNS = ['seller_sku', 'name', 'status', 'is_active', 'price', 'quantity', 'image_url', 'url'];

    private const CHUNK = 500;

    public function __construct(private readonly MarketplaceListingFetcherResolver $resolver) {}

    /**
     * @return array{fetched: int, upserted: int, deleted: int, matched: int, unmatched: int}
     */
    public function syncShop(SalesPlatformShop $shop): array
    {
        $shop->loadMissing('platform');
        $platform = MarketplaceListingFetcherResolver::platformKey($shop);
        if ($platform === null) {
            throw new InvalidArgumentException("Shop '{$shop->name}' is on an unsupported platform ('{$shop->platform?->name}').");
        }

        $fetcher = $this->resolver->forPlatform($platform);
        $now = now()->startOfSecond();

        $fetched = 0;
        $upserted = 0;
        $seen = [];
        $buffer = [];

        foreach ($fetcher->fetch($shop) as $row) {
            $fetched++;
            $key = $row['item_id']."\x1F".$row['variant_id'];
            // Same (item, variant) twice in one fetch (e.g. an item listed
            // under two statuses mid-sync) — first wins; a duplicate key in
            // one INSERT … ON CONFLICT statement is a hard Postgres error.
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $buffer[] = [
                'sales_platform_shop_id' => $shop->id,
                'platform' => $platform,
                'item_id' => $row['item_id'],
                'variant_id' => $row['variant_id'],
                'seller_sku' => $row['seller_sku'],
                'name' => $row['name'],
                'status' => $row['status'],
                'is_active' => (bool) $row['is_active'],
                'price' => $row['price'],
                'quantity' => $row['quantity'],
                'image_url' => $row['image_url'],
                'url' => $row['url'],
                'last_synced_at' => $now,
                'data_changed_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($buffer) >= self::CHUNK) {
                $upserted += $this->flush($buffer);
                $buffer = [];
            }
        }
        $upserted += $this->flush($buffer);

        $deleted = 0;
        if ($seen === []) {
            Log::warning('Marketplace listing sync: fetch returned no listings — skipped delete-unseen for safety', [
                'shop_id' => $shop->id,
                'platform' => $platform,
            ]);
        } else {
            $keepItemIds = $fetcher->incompleteItemIds();
            $deleted = MarketplaceListing::where('sales_platform_shop_id', $shop->id)
                ->where(fn ($q) => $q->whereNull('last_synced_at')->orWhere('last_synced_at', '<', $now))
                ->when($keepItemIds !== [], fn ($q) => $q->whereNotIn('item_id', $keepItemIds))
                ->delete();
        }

        $this->autoMatch($shop->id, $now);

        $matched = MarketplaceListing::where('sales_platform_shop_id', $shop->id)->linked()->count();
        $unmatched = MarketplaceListing::where('sales_platform_shop_id', $shop->id)->unlinked()->count();

        return [
            'fetched' => $fetched,
            'upserted' => $upserted,
            'deleted' => $deleted,
            'matched' => $matched,
            'unmatched' => $unmatched,
        ];
    }

    /**
     * Exact-SKU auto-match for one shop, set-based. Public so a future
     * "re-match only" action (no API calls) can reuse it.
     */
    public function autoMatch(int $shopId, $now = null): void
    {
        $now ??= now();

        // 1. auto_sku rows whose SKU no longer matches their product (SKU
        //    edited on either side, or product deleted → product_id nulled
        //    by the FK) → clear back to unmatched.
        DB::update(
            'UPDATE marketplace_listings ml
                SET product_id = NULL, match_method = NULL, matched_at = NULL, matched_by = NULL, updated_at = ?
              WHERE ml.sales_platform_shop_id = ?
                AND ml.match_method = ?
                AND ml.ignored_at IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM products p
                     WHERE p.id = ml.product_id
                       AND p.sku = btrim(ml.seller_sku)
                )',
            [$now, $shopId, MarketplaceListing::MATCH_AUTO_SKU]
        );

        // 2. unmatched, non-ignored rows (never manual/suggested/bundle/
        //    pushed) → exact products.sku match.
        DB::update(
            'UPDATE marketplace_listings ml
                SET product_id = p.id, match_method = ?, matched_at = ?, matched_by = NULL, updated_at = ?
               FROM products p
              WHERE ml.sales_platform_shop_id = ?
                AND ml.match_method IS NULL
                AND ml.ignored_at IS NULL
                AND ml.seller_sku IS NOT NULL
                AND p.sku = btrim(ml.seller_sku)',
            [MarketplaceListing::MATCH_AUTO_SKU, $now, $now, $shopId]
        );

        // 3. a manual/suggested/bundle/pushed link whose product(s) were all
        //    deleted (product_id nulled by the FK, components cascaded away)
        //    is no longer linked to anything → back to unmatched, so the row
        //    re-enters the work queue (and auto-match) instead of being stuck.
        DB::update(
            'UPDATE marketplace_listings ml
                SET match_method = NULL, matched_at = NULL, matched_by = NULL, pack_quantity = NULL, updated_at = ?
              WHERE ml.sales_platform_shop_id = ?
                AND ml.match_method IS NOT NULL
                AND ml.match_method <> ?
                AND ml.product_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM marketplace_listing_components c WHERE c.marketplace_listing_id = ml.id)',
            [$now, $shopId, MarketplaceListing::MATCH_AUTO_SKU]
        );
    }

    private function flush(array $rows): int
    {
        if ($rows === []) {
            return 0;
        }

        $existing = implode(', ', array_map(fn ($c) => "marketplace_listings.{$c}", self::TRACKED_COLUMNS));
        $incoming = implode(', ', array_map(fn ($c) => "excluded.{$c}", self::TRACKED_COLUMNS));

        DB::table('marketplace_listings')->upsert(
            $rows,
            ['sales_platform_shop_id', 'item_id', 'variant_id'],
            [
                'platform', ...self::TRACKED_COLUMNS, 'last_synced_at', 'updated_at',
                // bumped only when a synced value really differs (the other timestamps move every sync);
                // inserts take the row's own value ($now)
                'data_changed_at' => DB::raw("CASE WHEN ({$existing}) IS DISTINCT FROM ({$incoming}) THEN excluded.last_synced_at ELSE marketplace_listings.data_changed_at END"),
            ]
        );

        return count($rows);
    }
}
