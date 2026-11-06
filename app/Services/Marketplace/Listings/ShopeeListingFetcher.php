<?php

namespace App\Services\Marketplace\Listings;

use App\Models\SalesPlatformShop;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * 1. ShopeeClient::getItemList() per item_status (NORMAL, UNLIST, BANNED),
 *    paged via has_next_page/next_offset → item ids.
 * 2. getItemBaseInfo() in batches of ≤50 → name/sku/status/price/stock/image.
 * 3. Items with has_model → getModelList() → one row per model (variant_id =
 *    model_id); otherwise one row for the item (variant_id '').
 */
class ShopeeListingFetcher extends AbstractListingFetcher
{
    /** item_status values to list. BANNED is best-effort (see fetch()). */
    private const STATUSES = ['NORMAL', 'UNLIST', 'BANNED'];

    private const MODEL_DELAY_MICROS = 100_000;

    public function fetch(SalesPlatformShop $shop): iterable
    {
        $account = $shop->shopeeAccount();
        if (! $account) {
            throw new RuntimeException("Shop '{$shop->name}' has no linked Shopee account.");
        }

        $client = new ShopeeClient($account);
        $this->incompleteItemIds = [];
        $shopeeShopId = $account->shop_id;

        $itemIds = [];
        foreach (self::STATUSES as $status) {
            try {
                foreach ($this->listItemIds($client, $status) as $itemId) {
                    $itemIds[$itemId] = true;
                }
            } catch (\Throwable $e) {
                // NORMAL/UNLIST are essential — rethrow so the sync aborts
                // before deleting anything; BANNED is best-effort.
                if ($status !== 'BANNED') {
                    throw $e;
                }
                Log::warning('Shopee listing fetch: BANNED item list failed, skipped', ['shop_id' => $shop->id, 'error' => $e->getMessage()]);
            }
        }

        foreach (array_chunk(array_keys($itemIds), 50) as $batch) {
            $response = $client->getItemBaseInfo($batch);
            $items = $response['response']['item_list'] ?? [];
            $items = is_array($items) ? $items : [];

            foreach ($items as $item) {
                try {
                    $itemId = is_array($item) ? ($item['item_id'] ?? null) : null;
                    if (! $itemId) {
                        $this->skipMalformed('shopee', $item, 'missing item_id');

                        continue;
                    }

                    $status = $item['item_status'] ?? null;
                    $isActive = $status === 'NORMAL';
                    $name = $item['item_name'] ?? null;
                    $imageUrl = $item['image']['image_url_list'][0] ?? null;
                    $url = $shopeeShopId ? "https://shopee.co.th/product/{$shopeeShopId}/{$itemId}" : null;

                    if (! empty($item['has_model'])) {
                        $models = $this->fetchModels($client, (int) $itemId);
                        if ($models === null) {
                            $this->incompleteItemIds[] = (string) $itemId;

                            continue;
                        }

                        foreach ($models as $model) {
                            if (! is_array($model) || empty($model['model_id'])) {
                                $this->skipMalformed('shopee', $model, "model without model_id (item {$itemId})");

                                continue;
                            }

                            yield $this->row(
                                $itemId,
                                $model['model_id'],
                                $model['model_sku'] ?? null,
                                $name,
                                $status,
                                $isActive,
                                $this->priceOf($model),
                                $this->stockOf($model),
                                $imageUrl,
                                $url,
                            );
                        }

                        usleep(self::MODEL_DELAY_MICROS);

                        continue;
                    }

                    yield $this->row(
                        $itemId,
                        '',
                        $item['item_sku'] ?? null,
                        $name,
                        $status,
                        $isActive,
                        $this->priceOf($item),
                        $this->stockOf($item),
                        $imageUrl,
                        $url,
                    );
                } catch (\Throwable $e) {
                    $this->skipMalformed('shopee', $item, $e);
                }
            }

            usleep($this->pageDelayMicros);
        }
    }

    /**
     * @return array<int, string>
     */
    private function listItemIds(ShopeeClient $client, string $status): array
    {
        $ids = [];
        $offset = 0;
        $pageSize = 100;

        do {
            $response = $client->getItemList($offset, $pageSize, $status);
            $body = is_array($response['response'] ?? null) ? $response['response'] : [];

            foreach (is_array($body['item'] ?? null) ? $body['item'] : [] as $item) {
                if (is_array($item) && ! empty($item['item_id'])) {
                    $ids[] = (string) $item['item_id'];
                }
            }

            $hasMore = (bool) ($body['has_next_page'] ?? false);
            $nextOffset = (int) ($body['next_offset'] ?? ($offset + $pageSize));
            // Guard against a cursor that doesn't advance (infinite loop).
            if ($hasMore && $nextOffset <= $offset) {
                break;
            }
            $offset = $nextOffset;

            if ($hasMore) {
                usleep($this->pageDelayMicros);
            }
        } while ($hasMore);

        return $ids;
    }

    /**
     * @return array<int, mixed>|null null when the call failed (item kept as incomplete)
     */
    private function fetchModels(ShopeeClient $client, int $itemId): ?array
    {
        try {
            $response = $client->getModelList($itemId);
        } catch (\Throwable $e) {
            Log::warning('Shopee listing fetch: get_model_list failed', ['item_id' => $itemId, 'error' => $e->getMessage()]);

            return null;
        }

        $models = $response['response']['model'] ?? [];

        return is_array($models) ? $models : [];
    }

    private function priceOf(array $entry): mixed
    {
        $info = $entry['price_info'][0] ?? null;
        if (! is_array($info)) {
            return null;
        }

        return $info['current_price'] ?? ($info['original_price'] ?? null);
    }

    private function stockOf(array $entry): mixed
    {
        $summary = $entry['stock_info_v2']['summary_info'] ?? null;
        if (is_array($summary) && isset($summary['total_available_stock'])) {
            return $summary['total_available_stock'];
        }

        // Older shape — stock_info[] with current_stock / normal_stock.
        $legacy = $entry['stock_info'][0] ?? null;

        return is_array($legacy) ? ($legacy['current_stock'] ?? ($legacy['normal_stock'] ?? null)) : null;
    }
}
