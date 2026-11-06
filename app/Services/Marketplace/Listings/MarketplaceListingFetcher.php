<?php

namespace App\Services\Marketplace\Listings;

use App\Models\SalesPlatformShop;

/**
 * Reads every listing currently on one marketplace shop — READ-ONLY API calls
 * only. Implementations page through the platform's own listing endpoint and
 * yield one normalised row per sellable unit (SKU / model / variation, or the
 * item itself when it has no variants):
 *
 *   item_id (string), variant_id (string, '' for single-SKU items),
 *   seller_sku (?string), name (?string), status (?string, raw platform
 *   status), is_active (bool), price (?float), quantity (?int),
 *   image_url (?string), url (?string)
 *
 * A malformed single item is logged and skipped, never thrown. A failed
 * API page (auth/network) DOES throw — the sync service then aborts before
 * its delete-unseen step, so a half-read shop never wipes rows.
 */
interface MarketplaceListingFetcher
{
    /**
     * @return iterable<int, array{item_id: string, variant_id: string, seller_sku: ?string, name: ?string, status: ?string, is_active: bool, price: ?float, quantity: ?int, image_url: ?string, url: ?string}>
     */
    public function fetch(SalesPlatformShop $shop): iterable;

    /**
     * Item ids the last fetch() saw but could not fully read (e.g. a per-item
     * detail call failed). The sync service keeps any existing rows of these
     * items instead of deleting them as "unseen".
     *
     * @return array<int, string>
     */
    public function incompleteItemIds(): array;
}
