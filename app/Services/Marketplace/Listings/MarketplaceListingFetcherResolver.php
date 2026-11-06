<?php

namespace App\Services\Marketplace\Listings;

use App\Models\SalesPlatformShop;
use InvalidArgumentException;

/**
 * Platform name (sales_platforms.name: Lazada|Shopee|TikTok|WooCommerce) →
 * listing fetcher. Fetchers are resolved through the container (fresh
 * instance per call) so tests can bind a fake.
 */
class MarketplaceListingFetcherResolver
{
    public const FETCHERS = [
        'lazada' => LazadaListingFetcher::class,
        'shopee' => ShopeeListingFetcher::class,
        'tiktok' => TikTokListingFetcher::class,
        'woocommerce' => WooCommerceListingFetcher::class,
    ];

    /**
     * Normalised platform key ('lazada'|'shopee'|'tiktok'|'woocommerce') or
     * null when the shop's platform has no fetcher.
     */
    public static function platformKey(SalesPlatformShop $shop): ?string
    {
        $name = strtolower(str_replace([' ', '-', '_'], '', (string) $shop->platform?->name));

        return array_key_exists($name, self::FETCHERS) ? $name : null;
    }

    public function forPlatform(string $platform): MarketplaceListingFetcher
    {
        $class = self::FETCHERS[$platform] ?? null;
        if ($class === null) {
            throw new InvalidArgumentException("No marketplace listing fetcher for platform '{$platform}'.");
        }

        return app($class);
    }

    public function forShop(SalesPlatformShop $shop): MarketplaceListingFetcher
    {
        $platform = self::platformKey($shop);
        if ($platform === null) {
            throw new InvalidArgumentException("Shop '{$shop->name}' is on an unsupported platform ('{$shop->platform?->name}').");
        }

        return $this->forPlatform($platform);
    }
}
