<?php

namespace App\Services\Marketplace\Listings\Details;

use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use InvalidArgumentException;

/**
 * Platform key ('lazada'|'shopee'|'tiktok'|'woocommerce' — the same keys as
 * MarketplaceListingFetcherResolver) → listing detail fetcher, resolved
 * through the container so tests can bind a fake.
 */
class MarketplaceListingDetailFetcherResolver
{
    public const FETCHERS = [
        'lazada' => LazadaListingDetailFetcher::class,
        'shopee' => ShopeeListingDetailFetcher::class,
        'tiktok' => TikTokListingDetailFetcher::class,
        'woocommerce' => WooCommerceListingDetailFetcher::class,
    ];

    public function forPlatform(string $platform): MarketplaceListingDetailFetcher
    {
        $class = self::FETCHERS[$platform] ?? null;
        if ($class === null) {
            throw new InvalidArgumentException("No marketplace listing detail fetcher for platform '{$platform}'.");
        }

        return app($class);
    }

    public function forShop(SalesPlatformShop $shop): MarketplaceListingDetailFetcher
    {
        $platform = MarketplaceListingFetcherResolver::platformKey($shop);
        if ($platform === null) {
            throw new InvalidArgumentException("Shop '{$shop->name}' is on an unsupported platform ('{$shop->platform?->name}').");
        }

        return $this->forPlatform($platform);
    }
}
