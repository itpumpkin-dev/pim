<?php

namespace App\Services\Marketplace\Listings;

use App\Models\MarketplaceListing;
use Illuminate\Support\Facades\Log;

/**
 * Push integration for Product Matching: before a Shopee/TikTok push creates
 * a NEW listing (no cached product_platform_shops.platform_item_id), ask
 * whether this product is already linked to an existing listing on that
 * shop — if so the push should update that item instead of creating a
 * duplicate. Read-only (DB only, no API calls).
 *
 * Deliberately conservative — returns null (keep the old "create" behaviour)
 * unless there is exactly one unambiguous candidate:
 *  - match_method manual / suggested / auto_sku (never bundle, never pushed —
 *    a pushed row would already have a cached platform_item_id),
 *  - single unit (pack_quantity NULL or 1), not ignored,
 *  - exactly one such item in the shop (several → log a warning, don't
 *    guess),
 *  - that item has only this one listing row (a multi-variant item can't
 *    take our single-SKU payload), and when $requireNoVariant (Shopee: a
 *    has_model item rejects a model-less update_item) the row is the item
 *    itself (variant_id '').
 */
class LinkedListingResolver
{
    public const LINK_METHODS = [
        MarketplaceListing::MATCH_MANUAL,
        MarketplaceListing::MATCH_SUGGESTED,
        MarketplaceListing::MATCH_AUTO_SKU,
    ];

    public function itemIdFor(int $productId, int $shopId, bool $requireNoVariant = false): ?string
    {
        $candidates = MarketplaceListing::query()
            ->where('sales_platform_shop_id', $shopId)
            ->where('product_id', $productId)
            ->whereIn('match_method', self::LINK_METHODS)
            ->where(fn ($q) => $q->whereNull('pack_quantity')->orWhere('pack_quantity', 1))
            ->whereNull('ignored_at')
            ->get(['id', 'item_id', 'variant_id']);

        if ($candidates->isEmpty()) {
            return null;
        }

        $itemIds = $candidates->pluck('item_id')->unique()->values();
        if ($itemIds->count() > 1) {
            Log::warning('Push: product is linked to several listings in this shop — not guessing, creating a new listing as before', [
                'product_id' => $productId,
                'shop_id' => $shopId,
                'item_ids' => $itemIds->all(),
            ]);

            return null;
        }

        $itemId = (string) $itemIds->first();
        $rowsOfItem = MarketplaceListing::where('sales_platform_shop_id', $shopId)->where('item_id', $itemId)->get(['id', 'variant_id']);
        if ($rowsOfItem->count() !== 1 || ($requireNoVariant && $rowsOfItem->first()->variant_id !== '')) {
            Log::warning('Push: linked listing is a multi-variant item — not updating it with a single-SKU payload, creating a new listing as before', [
                'product_id' => $productId,
                'shop_id' => $shopId,
                'item_id' => $itemId,
            ]);

            return null;
        }

        return $itemId;
    }
}
