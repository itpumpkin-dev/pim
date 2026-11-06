<?php

namespace App\Services\Marketplace\Listings;

use Illuminate\Support\Facades\Log;

/**
 * Shared normalisation helpers for the per-platform listing fetchers.
 */
abstract class AbstractListingFetcher implements MarketplaceListingFetcher
{
    /** @var array<int, string> */
    protected array $incompleteItemIds = [];

    /** Pause between API pages (µs) — same pacing as LazadaProductSyncService. */
    protected int $pageDelayMicros = 300_000;

    public function incompleteItemIds(): array
    {
        return array_values(array_unique($this->incompleteItemIds));
    }

    /**
     * @return array{item_id: string, variant_id: string, seller_sku: ?string, name: ?string, status: ?string, is_active: bool, price: ?float, quantity: ?int, image_url: ?string, url: ?string}
     */
    protected function row(
        string|int $itemId,
        string|int|null $variantId,
        mixed $sellerSku,
        mixed $name,
        mixed $status,
        bool $isActive,
        mixed $price,
        mixed $quantity,
        mixed $imageUrl,
        mixed $url,
    ): array {
        return [
            'item_id' => (string) $itemId,
            'variant_id' => $variantId === null ? '' : (string) $variantId,
            'seller_sku' => $this->str($sellerSku, 255),
            'name' => $this->str($name),
            'status' => $this->str($status, 255),
            'is_active' => $isActive,
            'price' => is_numeric($price) ? round((float) $price, 2) : null,
            'quantity' => is_numeric($quantity) ? (int) $quantity : null,
            'image_url' => $this->str($imageUrl),
            'url' => $this->str($url),
        ];
    }

    protected function str(mixed $value, ?int $max = null): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return $max !== null ? mb_substr($value, 0, $max) : $value;
    }

    protected function skipMalformed(string $platform, mixed $item, \Throwable|string $reason): void
    {
        Log::warning("Marketplace listing fetch [{$platform}]: skipped malformed item", [
            'reason' => $reason instanceof \Throwable ? $reason->getMessage() : $reason,
            'item' => mb_substr((string) json_encode($item, JSON_UNESCAPED_UNICODE), 0, 1000),
        ]);
    }
}
