<?php

namespace App\Services\Shopee;

use App\Models\ShopeeSellerAccount;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Thin wrapper around Shopee's Open Platform REST API (v2). Every call is
 * signed with the shop's partner_key (HMAC-SHA256) — see sign(). Unlike
 * Lazada, Shopee has no "no-auth system tools" endpoint class: even
 * shop-agnostic data like the category tree still requires shop_id +
 * access_token on every request, per Shopee's "Common Request Parameters".
 *
 * getCategoryTree()/getAttributeTree() are confirmed against the real
 * v2.product.get_category / v2.product.get_attribute_tree docs pages
 * (open.shopee.com). The write-path methods below them (addItem() and
 * everything after) follow Shopee's general v2 conventions — common params
 * in the query string, business payload as a JSON body for POST calls, same
 * signing either way — but have NOT been confirmed against a live response
 * in this codebase yet, matching how LazadaClient flags its own
 * never-actually-called methods. Treat every field name/shape here as
 * "needs live verification", not settled fact, until a real call confirms it.
 */
class ShopeeClient
{
    private string $baseUrl;

    public function __construct(private readonly ShopeeSellerAccount $account)
    {
        $this->baseUrl = config('services.shopee.base_url');
    }

    /**
     * v2.product.get_category — GET /api/v2/product/get_category. Returns a
     * flat category_list (not nested like Lazada's tree), each row carrying
     * its own parent_category_id (0 = root) and has_children (the inverse
     * of Lazada's is_leaf) — see syncShopeeCategories() for how this is
     * normalized to match lazada_categories' shape.
     */
    public function getCategoryTree(string $language = 'en'): array
    {
        return $this->request('/api/v2/product/get_category', ['language' => $language]);
    }

    /**
     * v2.product.get_attribute_tree — GET /api/v2/product/get_attribute_tree.
     * The mandatory/optional attribute schema for up to a handful of leaf
     * categories at once (category_id_list, max count documented as 20).
     * Read-only — same "safe to call any time" role as
     * LazadaClient::getCategoryAttributes().
     */
    public function getAttributeTree(array $categoryIds, string $language = 'en'): array
    {
        return $this->request('/api/v2/product/get_attribute_tree', [
            'category_id_list' => implode(',', $categoryIds),
            'language' => $language,
        ]);
    }

    /**
     * v2.product.get_brand_list — GET /api/v2/product/get_brand_list. Some
     * categories mandate add_item's `brand` object (confirmed live,
     * 2026-08-14: product.error_invalid_brand — "Brand information
     * required" — for a real category on this shop); this is how a valid
     * brand_id is discovered for one, including whatever this shop's
     * category-specific "no brand"/generic option is (Shopee has no single
     * universal fallback the way Lazada's fixed "No Brand" string is).
     */
    public function getBrandList(int $categoryId, int $offset = 0, int $pageSize = 50): array
    {
        return $this->request('/api/v2/product/get_brand_list', [
            'category_id' => $categoryId,
            'offset' => $offset,
            'page_size' => $pageSize,
            // Confirmed live, 2026-08-14: required — "status is required"
            // without it. 1 = normal/listable brands (confirmed to return
            // the full expected list, including the category's own
            // brand_id=0 "NoBrand" entry when one exists).
            'status' => 1,
        ]);
    }

    /**
     * v2.logistics.get_channel_list — this shop's enabled shipping channels.
     * add_item's logistic_info requires at least one, by channel logistic_id
     * — NOT confirmed against these docs in this session (the user's shared
     * screenshots covered get_category/get_attribute_tree/add_item only);
     * this follows Shopee's generally documented shape for that endpoint.
     */
    public function getChannelList(): array
    {
        return $this->request('/api/v2/logistics/get_channel_list');
    }

    /**
     * v2.media_space.upload_image — uploads one image and returns its
     * image_id, which add_item's image.image_id_list expects (Shopee, like
     * Lazada, rejects raw external image URLs — everything must go through
     * their own media space first). Same local-disk-read-over-self-HTTP-call
     * reasoning as LazadaClient::uploadImage() (see that method's docblock
     * for the deadlock this avoids). NOT confirmed live — field names
     * (`image`, response `response.image_info.image_id`) follow Shopee's
     * general documented shape for this endpoint, not a verified response.
     */
    public function uploadImage(string $imageUrl): string
    {
        $localPath = $this->resolveLocalPublicStoragePath($imageUrl);
        $imageBytes = $localPath !== null
            ? Storage::disk('public')->get($localPath)
            : Http::timeout(30)->retry(2, 200)->get($imageUrl)->body();

        if (! $imageBytes) {
            throw new RuntimeException("Could not read image to upload to Shopee: {$imageUrl}");
        }

        $filename = basename((string) parse_url($imageUrl, PHP_URL_PATH)) ?: 'image.jpg';
        $apiPath = '/api/v2/media_space/upload_image';

        // Http::attach()->post($url, $data) treats $data as further
        // multipart form fields, not a query string — confirmed live,
        // 2026-08-14: partner_id/timestamp/access_token/shop_id/sign ended
        // up in the multipart body instead of the URL, so Shopee rejected
        // every call with "There is no partner_id in query." Common params
        // must go through withQueryParameters() explicitly instead, same as
        // every other call in this client.
        //
        // No retry() here — unlike a plain GET, a partial failure after
        // Shopee already received the bytes shouldn't be blindly resent.
        $response = Http::timeout(30)->attach('image', $imageBytes, $filename)
            ->withQueryParameters($this->signedParams($apiPath))
            ->post($this->baseUrl.$apiPath);

        $data = $this->handleResponse($response, $apiPath);

        $imageId = $data['response']['image_info']['image_id'] ?? null;
        if (! $imageId) {
            throw new RuntimeException('Shopee image upload succeeded but returned no image_id: '.json_encode($data, JSON_UNESCAPED_UNICODE));
        }

        return $imageId;
    }

    /**
     * v2.product.add_item — creates a new listing. $item is the shape built
     * by ShopeeProductSyncService::buildPayload() (item_name, description,
     * category_id, price_info, seller_stock/stock, image.image_id_list,
     * weight, logistic_info, item_sku, ...) — see that class for what's
     * grounded in our own data vs. what's still a v1 simplification.
     *
     * FIRES A REAL, LIVE WRITE — creates an actual listing on the seller's
     * storefront, visible to real customers. Never call this without the
     * user's explicit, specific go-ahead on a real product — this method has
     * never actually been called; a first live call will very likely surface
     * a missing/misnamed required field before it succeeds (Shopee's
     * documented error codes include e.g. product_error_attr for a missing
     * mandatory attribute), same as Lazada's createProduct() before it.
     */
    public function addItem(array $item): array
    {
        return $this->request('/api/v2/product/add_item', $item, method: 'POST', jsonBody: true);
    }

    /**
     * v2.product.update_item — same write-path caveats as addItem() above.
     * $item must carry `item_id` (ours to track locally after a successful
     * addItem() — see ShopeeProductSyncService, which stores it in
     * product_platform_shops.platform_item_id rather than re-deriving it
     * from a search, since Shopee has no documented "find item by our own
     * SKU" endpoint equivalent to Lazada's sku_seller_list filter).
     */
    public function updateItem(array $item): array
    {
        return $this->request('/api/v2/product/update_item', $item, method: 'POST', jsonBody: true);
    }

    /**
     * v2.product.get_item_base_info — status/detail lookup for a known set
     * of item_ids (ours, from platform_item_id — see updateItem()'s
     * docblock for why we track this ourselves instead of searching for
     * it). Read-only. NOT confirmed live in this session.
     */
    public function getItemBaseInfo(array $itemIds): array
    {
        return $this->request('/api/v2/product/get_item_base_info', [
            'item_id_list' => implode(',', $itemIds),
        ]);
    }

    /**
     * v2.product.get_item_list — paginated listing of this shop's items by
     * status, used for the bulk live-status sync (mirrors
     * LazadaClient::getLiveProducts()). Read-only. NOT confirmed live.
     */
    public function getItemList(int $offset = 0, int $pageSize = 50, string $itemStatus = 'NORMAL'): array
    {
        return $this->request('/api/v2/product/get_item_list', [
            'offset' => $offset,
            'page_size' => $pageSize,
            'item_status' => $itemStatus,
        ]);
    }

    /**
     * v2.product.unlist_item — hides a listing from the storefront without
     * deleting it (Shopee's equivalent of LazadaClient::deactivateProduct()).
     *
     * FIRES A REAL, LIVE WRITE — takes down an actual listing customers can
     * currently see. Same "explicit go-ahead only" rule as addItem().
     */
    public function unlistItem(int $itemId): array
    {
        return $this->request('/api/v2/product/unlist_item', [
            'item_list' => [['item_id' => $itemId, 'unlist' => true]],
        ], method: 'POST', jsonBody: true);
    }

    /**
     * Reverses Storage::disk('public')->url($path) — identical to
     * LazadaClient's version of this helper.
     */
    private function resolveLocalPublicStoragePath(string $imageUrl): ?string
    {
        $prefix = rtrim(Storage::disk('public')->url(''), '/').'/';

        if (! str_starts_with($imageUrl, $prefix)) {
            return null;
        }

        $path = substr($imageUrl, strlen($prefix));

        return Storage::disk('public')->exists($path) ? $path : null;
    }

    /**
     * GET calls send $params as the query string (alongside the signed
     * common params). POST calls (jsonBody: true) send the common params in
     * the query string per Shopee's convention (confirmed for
     * get_category/get_attribute_tree; assumed to extend to POST calls too,
     * consistent with Shopee's general v2 docs) and $params as the JSON body.
     */
    private function request(string $apiPath, array $params = [], string $method = 'GET', bool $jsonBody = false): array
    {
        $query = $this->signedParams($apiPath);

        // timeout() bounds how long a hung/slow Shopee response can hold a
        // request thread open; retry() only fires on connection-level
        // failures (timeout, DNS, refused) since handleResponse() below
        // doesn't throw on Shopee's own error payloads — so a real Shopee
        // error is never blindly retried, only "we couldn't reach them".
        $http = Http::timeout(30)->retry(2, 200);

        $response = $method === 'POST'
            ? $http->withQueryParameters($query)->post($this->baseUrl.$apiPath, $jsonBody ? $params : [])
            : $http->get($this->baseUrl.$apiPath, [...$query, ...$params]);

        return $this->handleResponse($response, $apiPath);
    }

    /**
     * partner_id/timestamp/access_token/shop_id/sign — required on every
     * v2 call per Shopee's "Common Request Parameters" doc.
     */
    private function signedParams(string $apiPath): array
    {
        $timestamp = time();

        return [
            'partner_id' => $this->account->partner_id,
            'timestamp' => $timestamp,
            'access_token' => $this->account->access_token,
            'shop_id' => $this->account->shop_id,
            'sign' => $this->sign($apiPath, $timestamp),
        ];
    }

    private function handleResponse(Response $response, string $apiPath): array
    {
        $data = $response->json();

        if ($data === null) {
            throw new RuntimeException("Shopee API returned a non-JSON response (HTTP {$response->status()}): ".$response->body());
        }

        if (! empty($data['error'])) {
            Log::error('Shopee API error', [
                'api_path' => $apiPath,
                'response' => $data,
            ]);

            throw new RuntimeException(
                "Shopee API error [{$data['error']}]: ".($data['message'] ?? 'unknown error')
            );
        }

        return $data;
    }

    /**
     * baseString = partner_id + api_path + timestamp + access_token +
     * shop_id, HMAC-SHA256 keyed by partner_key, lowercase hex — per
     * Shopee's "Common Request Parameters" doc for the `sign` field. Same
     * for every call regardless of method/body — unlike Lazada, Shopee's
     * signature never covers the business payload itself.
     */
    private function sign(string $apiPath, int $timestamp): string
    {
        $base = $this->account->partner_id.$apiPath.$timestamp.$this->account->access_token.$this->account->shop_id;

        return hash_hmac('sha256', $base, $this->account->partner_key);
    }
}
