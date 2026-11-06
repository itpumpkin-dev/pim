<?php

namespace App\Services\Marketplace\Listings;

use App\Models\SalesPlatformShop;
use App\Services\TikTok\TikTokClient;
use RuntimeException;

/**
 * TikTokClient::searchProducts() (POST /product/202502/products/search) paged
 * by page_token (`data.next_page_token`, empty on the last page). Body filter
 * `{"status":"ALL"}` — the documented "every status" value; also sidesteps
 * TikTokClient::request() json-encoding an empty filter array as `[]`
 * instead of `{}`. One row per skus[] entry (variant_id = sku id).
 */
class TikTokListingFetcher extends AbstractListingFetcher
{
    public function fetch(SalesPlatformShop $shop): iterable
    {
        $account = $shop->tiktokAccount();
        if (! $account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked TikTok account.");
        }

        $client = new TikTokClient($account);
        $this->incompleteItemIds = [];
        $pageToken = null;
        $seenTokens = [];

        do {
            $response = $client->searchProducts(['status' => 'ALL'], 100, $pageToken);
            $data = is_array($response['data'] ?? null) ? $response['data'] : [];
            $products = is_array($data['products'] ?? null) ? $data['products'] : [];

            foreach ($products as $product) {
                try {
                    $itemId = is_array($product) ? ($product['id'] ?? null) : null;
                    if (! $itemId) {
                        $this->skipMalformed('tiktok', $product, 'missing id');

                        continue;
                    }

                    $status = $product['status'] ?? null;
                    if ($status === 'DELETED') {
                        continue;
                    }

                    $skus = is_array($product['skus'] ?? null) ? $product['skus'] : [];
                    foreach ($skus as $sku) {
                        if (! is_array($sku) || empty($sku['id'])) {
                            $this->skipMalformed('tiktok', $sku, "sku without id (product {$itemId})");

                            continue;
                        }

                        $priceInfo = is_array($sku['price'] ?? null) ? $sku['price'] : [];
                        $price = $priceInfo['tax_exclusive_price'] ?? ($priceInfo['sale_price'] ?? null);

                        $quantity = null;
                        foreach (is_array($sku['inventory'] ?? null) ? $sku['inventory'] : [] as $inventory) {
                            if (is_array($inventory) && is_numeric($inventory['quantity'] ?? null)) {
                                $quantity = ($quantity ?? 0) + (int) $inventory['quantity'];
                            }
                        }

                        yield $this->row(
                            $itemId,
                            $sku['id'],
                            $sku['seller_sku'] ?? null,
                            $product['title'] ?? null,
                            $status,
                            $status === 'ACTIVATE',
                            $price,
                            $quantity,
                            $product['main_images'][0]['urls'][0] ?? null,
                            null,
                        );
                    }
                } catch (\Throwable $e) {
                    $this->skipMalformed('tiktok', $product, $e);
                }
            }

            $next = $data['next_page_token'] ?? null;
            $pageToken = is_string($next) && $next !== '' && ! isset($seenTokens[$next]) ? $next : null;
            if ($pageToken !== null) {
                $seenTokens[$pageToken] = true;
                usleep($this->pageDelayMicros);
            }
        } while ($pageToken !== null && $products !== []);
    }
}
