<?php

namespace App\Services\Marketplace\Listings;

use App\Models\SalesPlatformShop;
use App\Services\WooCommerce\WooCommerceClient;
use Illuminate\Support\Facades\Log;

/**
 * WooCommerce is site-wide (config('services.woocommerce'), no per-shop
 * account). WooCommerceClient::listProducts() (GET /products, status=any)
 * paged until a short page; simple products → one row (variant_id ''),
 * variable products → one row per variation (GET /products/{id}/variations),
 * the variable parent itself is skipped.
 */
class WooCommerceListingFetcher extends AbstractListingFetcher
{
    private const PER_PAGE = 50;

    private const PAGE_ATTEMPTS = 3;

    public function fetch(SalesPlatformShop $shop): iterable
    {
        $client = new WooCommerceClient;
        $this->incompleteItemIds = [];
        $page = 1;

        do {
            $products = $this->withRetry(fn () => $client->listProducts($page, self::PER_PAGE));
            $products = array_is_list($products) ? $products : [];

            foreach ($products as $product) {
                try {
                    $itemId = is_array($product) ? ($product['id'] ?? null) : null;
                    if (! $itemId) {
                        $this->skipMalformed('woocommerce', $product, 'missing id');

                        continue;
                    }

                    $status = $product['status'] ?? null;
                    $name = $product['name'] ?? null;
                    $imageUrl = $product['images'][0]['src'] ?? null;

                    if (($product['type'] ?? null) === 'variable') {
                        $variations = $this->fetchVariations($client, (int) $itemId);
                        if ($variations === null) {
                            $this->incompleteItemIds[] = (string) $itemId;

                            continue;
                        }

                        foreach ($variations as $variation) {
                            if (! is_array($variation) || empty($variation['id'])) {
                                $this->skipMalformed('woocommerce', $variation, "variation without id (product {$itemId})");

                                continue;
                            }

                            $variationStatus = $variation['status'] ?? $status;
                            $label = collect(is_array($variation['attributes'] ?? null) ? $variation['attributes'] : [])
                                ->map(fn ($attr) => is_array($attr) ? ($attr['option'] ?? null) : null)
                                ->filter()
                                ->implode(' / ');

                            yield $this->row(
                                $itemId,
                                $variation['id'],
                                $variation['sku'] ?? null,
                                $label !== '' ? "{$name} — {$label}" : $name,
                                $variationStatus,
                                $status === 'publish' && $variationStatus === 'publish',
                                $this->priceOf($variation),
                                $variation['stock_quantity'] ?? null,
                                $variation['image']['src'] ?? $imageUrl,
                                $variation['permalink'] ?? ($product['permalink'] ?? null),
                            );
                        }

                        continue;
                    }

                    yield $this->row(
                        $itemId,
                        '',
                        $product['sku'] ?? null,
                        $name,
                        $status,
                        $status === 'publish',
                        $this->priceOf($product),
                        $product['stock_quantity'] ?? null,
                        $imageUrl,
                        $product['permalink'] ?? null,
                    );
                } catch (\Throwable $e) {
                    $this->skipMalformed('woocommerce', $product, $e);
                }
            }

            $page++;
            $hasMore = count($products) >= self::PER_PAGE;
            if ($hasMore) {
                usleep($this->pageDelayMicros);
            }
        } while ($hasMore);
    }

    /**
     * @return array<int, mixed>|null null when a page failed (product kept as incomplete)
     */
    private function fetchVariations(WooCommerceClient $client, int $productId): ?array
    {
        $all = [];
        $page = 1;

        try {
            do {
                $rows = $this->withRetry(fn () => $client->listVariations($productId, $page, self::PER_PAGE));
                $rows = array_is_list($rows) ? $rows : [];
                array_push($all, ...$rows);
                $page++;
            } while (count($rows) >= self::PER_PAGE);
        } catch (\Throwable $e) {
            Log::warning('WooCommerce listing fetch: variations failed', ['product_id' => $productId, 'error' => $e->getMessage()]);

            return null;
        }

        return $all;
    }

    /**
     * The store sometimes answers a page with a transient WordPress HTML 500
     * (see WooCommerceClient::listProducts()) — retry a couple of times
     * before giving up (giving up throws, so the sync aborts before its
     * delete-unseen step).
     */
    private function withRetry(callable $call): array
    {
        for ($attempt = 1; ; $attempt++) {
            try {
                return $call();
            } catch (\Throwable $e) {
                if ($attempt >= self::PAGE_ATTEMPTS) {
                    throw $e;
                }
                Log::warning('WooCommerce listing fetch: page failed, retrying', ['attempt' => $attempt, 'error' => mb_substr($e->getMessage(), 0, 200)]);
                sleep(2 * $attempt);
            }
        }
    }

    private function priceOf(array $entry): mixed
    {
        $price = $entry['price'] ?? null;
        if (is_numeric($price)) {
            return $price;
        }

        return $entry['regular_price'] ?? null;
    }
}
