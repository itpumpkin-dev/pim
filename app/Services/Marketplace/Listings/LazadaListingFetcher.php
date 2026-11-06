<?php

namespace App\Services\Marketplace\Listings;

use App\Models\SalesPlatformShop;
use App\Services\Lazada\LazadaClient;
use RuntimeException;

/**
 * LazadaClient::getAllProducts() (`/products/get`, filter=all) paged by
 * offset/limit against `data.total_products` — the same loop and parsing as
 * LazadaProductSyncService::syncMasterProductList(). One row per skus[]
 * entry (variant_id = SkuId).
 */
class LazadaListingFetcher extends AbstractListingFetcher
{
    public function fetch(SalesPlatformShop $shop): iterable
    {
        $account = $shop->lazadaAccount();
        if (! $account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked Lazada account.");
        }

        $client = new LazadaClient($account);
        $this->incompleteItemIds = [];
        $offset = 0;
        $limit = 50;

        do {
            $response = $client->getAllProducts($offset, $limit);
            $data = is_array($response['data'] ?? null) ? $response['data'] : [];
            $products = is_array($data['products'] ?? null) ? $data['products'] : [];
            $total = (int) ($data['total_products'] ?? 0);

            foreach ($products as $product) {
                try {
                    $itemId = is_array($product) ? ($product['item_id'] ?? null) : null;
                    if (! $itemId) {
                        $this->skipMalformed('lazada', $product, 'missing item_id');

                        continue;
                    }

                    $name = $product['attributes']['name'] ?? null;
                    $imageUrl = $product['images'][0] ?? null;
                    $itemStatus = $product['status'] ?? null;

                    foreach (is_array($product['skus'] ?? null) ? $product['skus'] : [] as $sku) {
                        if (! is_array($sku)) {
                            continue;
                        }
                        $status = $sku['Status'] ?? $itemStatus;
                        $price = $sku['special_price'] ?? null;
                        if (! is_numeric($price) || (float) $price <= 0) {
                            $price = $sku['price'] ?? null;
                        }

                        yield $this->row(
                            $itemId,
                            $sku['SkuId'] ?? ($sku['ShopSku'] ?? null),
                            $sku['SellerSku'] ?? null,
                            $name,
                            $status,
                            strtolower((string) $status) === 'active',
                            $price,
                            $sku['quantity'] ?? null,
                            ($sku['Images'][0] ?? null) ?: $imageUrl,
                            $sku['Url'] ?? null,
                        );
                    }
                } catch (\Throwable $e) {
                    $this->skipMalformed('lazada', $product, $e);
                }
            }

            $offset += $limit;
            if ($offset < $total) {
                usleep($this->pageDelayMicros);
            }
        } while ($offset < $total && $products !== []);
    }
}
