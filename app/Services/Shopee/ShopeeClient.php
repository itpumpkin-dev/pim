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
    /**
     * @param  int  $offset  NOT a page index/multiple of $pageSize — confirmed
     *  live that this is an opaque cursor. Pass 0 for the first page, then on
     *  every subsequent call pass whatever the previous response returned as
     *  `response.next_offset` verbatim (observed to be the next brand_id in
     *  Shopee's own ordering, not anything derived from page size). Passing a
     *  hand-computed offset instead makes later pages silently replay an
     *  earlier page forever while `has_next_page` keeps reporting true — see
     *  SyncShopeeBrandsJob's pagination loop for the fallout this caused
     *  before the cursor was wired through correctly.
     * @param  int  $pageSize  Capped by Shopee at 100 (confirmed live:
     *  101+ is rejected with "invalid GetMpskuBrandsRequest.PageSize").
     */
    public function getBrandList(int $categoryId, int $offset = 0, int $pageSize = 100): array
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
     * v2.media.init_video_upload / upload_video_part / complete_video_upload /
     * get_video_upload_result — confirmed against Shopee's real current docs
     * (open.shopee.com, "Media" section) 2026-08-22, replacing this method's
     * previous guess against the older/deprecated `media_space` endpoint
     * family (wrong path prefix, wrong param names, and a hardcoded 4MB
     * chunk size instead of the server-declared `part_size`).
     *
     * Flow: init (declare business/scene/file_name/file_size/duration, get
     * back a video_upload_id + the exact part_size to chunk by) →
     * upload_video_part (repeat per chunk, each with its own MD5) → complete
     * (video_upload_id only) → poll get_video_upload_result until Shopee's
     * own transcoding finishes. v2.product.add_item's own docs (confirmed
     * 2026-08-22) show its `video_upload_id` field wants exactly that same
     * ID back — there is no separate "video_id" to extract, that was this
     * method's previous, wrong guess. Orchestrated here as one call so
     * ShopeeProductSyncService can treat it exactly like uploadImage() —
     * read a URL in, get back the id add_item's video_upload_id needs.
     *
     * STILL NOT confirmed live — the docs are real, but this method itself
     * has never been called against Shopee. The product video attribute this
     * feeds (PIM's `attribute_6`) has never had a real value pushed through
     * this path yet — treat the very first live call as a test, not a
     * known-working feature.
     */
    public function uploadVideo(string $videoUrl): string
    {
        $localPath = $this->resolveLocalPublicStoragePath($videoUrl);
        $videoBytes = $localPath !== null
            ? Storage::disk('public')->get($localPath)
            : Http::timeout(30)->retry(2, 200)->get($videoUrl)->body();

        if (! $videoBytes) {
            throw new RuntimeException("Could not read video to upload to Shopee: {$videoUrl}");
        }

        $fileName = basename((string) parse_url($videoUrl, PHP_URL_PATH)) ?: 'video.mp4';
        $duration = $this->videoDurationSeconds($videoBytes);

        [$videoUploadId, $partSize] = $this->initVideoUpload($fileName, strlen($videoBytes), $duration);
        $this->uploadVideoParts($videoUploadId, $videoBytes, $partSize);
        $this->completeVideoUpload($videoUploadId);

        return $this->pollVideoUploadResult($videoUploadId);
    }

    /**
     * getID3 needs a real file path (same library ProductController::
     * validateVideoConstraints() already uses for the PIM's own ≤60s
     * server-side check on upload) — that check happens at save time and
     * doesn't persist the duration anywhere, so it's re-derived here from
     * the downloaded bytes via a throwaway temp file.
     */
    private function videoDurationSeconds(string $videoBytes): int
    {
        $tmpPath = tempnam(sys_get_temp_dir(), 'shopee_video_');
        file_put_contents($tmpPath, $videoBytes);

        try {
            $info = (new \getID3)->analyze($tmpPath);

            return max(1, (int) round($info['playtime_seconds'] ?? 1));
        } finally {
            @unlink($tmpPath);
        }
    }

    /**
     * v2.media.init_video_upload — business=3 (Video) / scene=1 (Shopee
     * Video) is the only combination this app needs (the product video
     * attribute). That combination's own documented limits: file_size max
     * 1GB, duration 1-180s — both comfortably above the PIM's own upload-time
     * cap (100MB / 60s, see ProductController::validateVideoConstraints()),
     * so neither is separately enforced here.
     *
     * @return array{0: string, 1: int} [video_upload_id, part_size]
     */
    private function initVideoUpload(string $fileName, int $fileSize, int $duration): array
    {
        $apiPath = '/api/v2/media/init_video_upload';

        $response = $this->request($apiPath, [
            'business' => 3,
            'scene' => 1,
            'file_name' => $fileName,
            'file_size' => $fileSize,
            'duration' => $duration,
        ], method: 'POST', jsonBody: true);

        $videoUploadId = $response['response']['video_upload_id'] ?? null;
        $partSize = $response['response']['part_size'] ?? null;
        if (! $videoUploadId || ! $partSize) {
            throw new RuntimeException('Shopee init_video_upload succeeded but returned no video_upload_id/part_size: '.json_encode($response, JSON_UNESCAPED_UNICODE));
        }

        return [$videoUploadId, (int) $partSize];
    }

    /**
     * v2.media.upload_video_part — must be split into exactly $partSize-byte
     * chunks (the last chunk is whatever remains) per init_video_upload's own
     * returned part_size, not a fixed guessed constant.
     */
    private function uploadVideoParts(string $videoUploadId, string $videoBytes, int $partSize): void
    {
        $chunks = str_split($videoBytes, $partSize);
        $apiPath = '/api/v2/media/upload_video_part';

        foreach ($chunks as $partSeq => $chunk) {
            $response = Http::timeout(60)->attach('part_content', $chunk, "part_{$partSeq}")
                ->withQueryParameters([
                    ...$this->signedParams($apiPath),
                    'video_upload_id' => $videoUploadId,
                    'part_seq' => $partSeq,
                    'part_md5' => md5($chunk),
                ])
                ->post($this->baseUrl.$apiPath);

            $this->handleResponse($response, $apiPath);
        }
    }

    /** v2.media.complete_video_upload — video_upload_id only, per the documented params (no part_seq_list — that was this method's previous, wrong media_space-era guess). */
    private function completeVideoUpload(string $videoUploadId): void
    {
        $this->request('/api/v2/media/complete_video_upload', [
            'video_upload_id' => $videoUploadId,
        ], method: 'POST', jsonBody: true);
    }

    /**
     * v2.media.get_video_upload_result — transcoding isn't instant, so this
     * polls until Shopee reports SUCCEEDED/FAILED rather than assuming
     * completeVideoUpload() alone means the video is ready to use. Paced
     * the same defensive way as LazadaProductSyncService::syncLiveStatus()'s
     * usleep() between calls, for the same reason (avoid tripping a
     * per-account rate limit with tight back-to-back polling).
     *
     * Once SUCCEEDED, this just hands back the same $videoUploadId it was
     * given — v2.product.add_item's `video_upload_id` field (confirmed live
     * in its own docs, 2026-08-22) wants that exact ID, not a distinct
     * "video_id" pulled out of this response.
     */
    private function pollVideoUploadResult(string $videoUploadId): string
    {
        $apiPath = '/api/v2/media/get_video_upload_result';
        $maxAttempts = 20;

        for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
            $response = $this->request($apiPath, ['video_upload_id' => $videoUploadId]);
            $status = $response['response']['status'] ?? null;

            if ($status === 'SUCCEEDED') {
                return $videoUploadId;
            }

            if ($status === 'FAILED') {
                throw new RuntimeException('Shopee video transcoding failed: '.json_encode($response, JSON_UNESCAPED_UNICODE));
            }

            usleep(3_000_000);
        }

        throw new RuntimeException("Shopee video transcoding didn't finish after {$maxAttempts} checks (video_upload_id: {$videoUploadId}) — try again later.");
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
     * v2.product.delete_item — permanently deletes a listing, unlike
     * unlistItem() above which only hides it (the listing and its item_id
     * both stop existing on Shopee's side; unlisting can be reversed by
     * relisting, this can't). Called from ShopeeProductSyncService::delete()
     * → ProductController::deleteFromShopee() — Shopee's the only platform
     * this is wired up for so far.
     *
     * FIRES A REAL, LIVE WRITE — permanently deletes an actual listing.
     * Cannot be undone from Shopee's side. Same "explicit go-ahead only"
     * rule as addItem()/unlistItem().
     */
    public function deleteItem(int $itemId): array
    {
        return $this->request('/api/v2/product/delete_item', [
            'item_id' => $itemId,
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

            // Shopee's actual error payload carries the human-readable detail
            // in `msg` (confirmed by this exact bug — a real "no permission"
            // response only ever had `msg` set, so this used to always fall
            // through to the "unknown error" fallback and hide it from
            // whatever surfaced this exception's message to a user).
            throw new RuntimeException(
                "Shopee API error [{$data['error']}]: ".($data['msg'] ?? $data['message'] ?? 'unknown error')
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
