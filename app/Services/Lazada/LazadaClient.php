<?php

namespace App\Services\Lazada;

use App\Models\LazadaSellerAccount;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Thin wrapper around Lazada's Open Platform REST API. Every call must be
 * signed with the seller's app_secret (HMAC-SHA256) regardless of whether
 * the endpoint is shop-specific — see sign().
 */
class LazadaClient
{
    private string $baseUrl;

    public function __construct(private readonly LazadaSellerAccount $account)
    {
        $this->baseUrl = config('services.lazada.base_url');
    }

    /**
     * Category tree is a platform-level "system tools" endpoint (not tied
     * to a specific shop's listings), so it's called without access_token.
     */
    public function getCategoryTree(): array
    {
        return $this->request('/category/tree/get', requiresAccessToken: false);
    }

    /**
     * The set of attributes a given leaf category requires/allows — used to
     * validate a payload's completeness before create/update, since each
     * category has different mandatory fields (e.g. Brand). Same "system
     * tools" class as getCategoryTree(), so also called without access_token.
     */
    public function getCategoryAttributes(int $categoryId): array
    {
        return $this->request('/category/attributes/get', ['primary_category_id' => $categoryId], requiresAccessToken: false);
    }

    /**
     * Confirmed against the real official docs page (open.lazada.com,
     * "GetBrandByPages", GET/POST /category/brands/query,
     * "No Authorization Required") — same no-access_token "system tools"
     * class as getCategoryTree()/getCategoryAttributes(). $startRow/$pageSize
     * (max 200, default 40 if omitted) are the *only* documented parameters
     * — confirmed no name/keyword/search filter exists (the docs list
     * nothing else, and live testing with several guessed param names had
     * zero effect on the result). With 153,482 total brands and no way to
     * filter server-side, matching a brand by name isn't practical via this
     * endpoint alone — see LazadaProductSyncService::buildPayload(), which
     * currently sends the fixed "No Brand" value instead of attempting a
     * match.
     */
    public function queryBrands(int $startRow = 0, int $pageSize = 40): array
    {
        return $this->request('/category/brands/query', ['startRow' => $startRow, 'pageSize' => $pageSize], requiresAccessToken: false);
    }

    /**
     * Lists this shop's own live listings — confirmed live, 2026-08-13,
     * against a real seller account (265 real products returned in the
     * expected shape). Response: `data.total_products` (int) and
     * `data.products[]`, each `{item_id, images[], skus: [{Status,
     * SellerSku, ShopSku, quantity, Url, ...}]}` — `SellerSku` is what
     * matches our own `products.sku`. Used by
     * LazadaProductSyncService::syncLiveStatus() to populate
     * product_platform_shops' status/platform_item_id/last_synced_at, since
     * paging through this per shop on every Products-list page load isn't
     * feasible (one shop alone had 265 live products).
     */
    public function getLiveProducts(int $offset = 0, int $limit = 50): array
    {
        return $this->request('/products/get', ['filter' => 'live', 'offset' => $offset, 'limit' => $limit, 'options' => 1], requiresAccessToken: true);
    }

    /**
     * Looks up one specific product directly by our own SellerSku — no
     * item_id needed in advance, and no dependency on LazadaProductMapping
     * (n8n's own separate, independently-timed sync of the same data).
     * Confirmed live, 2026-08-13, three ways: a real live item, a real
     * inactive one (`data.products[].skus[].Status: "inactive"` — critically,
     * `filter: 'all'` is required for this, not `filter: 'live'`, which
     * silently excludes inactive items entirely), and a SKU that doesn't
     * exist on Lazada at all (`data: []`, not an error).
     *
     * Tried `/product/item/get` first (single-item lookup) but it requires
     * item_id as a mandatory param (confirmed: `MissingParameter` error
     * without one) — defeating the point, since not depending on a cached
     * item_id is exactly what this needs. This endpoint's `sku_seller_list`
     * filter achieves the same one-call, single-item lookup without that
     * requirement.
     */
    public function findProductBySku(string $sellerSku): array
    {
        return $this->request('/products/get', [
            'filter' => 'all',
            'offset' => 0,
            'limit' => 10,
            'sku_seller_list' => json_encode([$sellerSku]),
        ], requiresAccessToken: true);
    }

    /**
     * Creates a new listing for this shop. $product is the shape built by
     * LazadaProductSyncService::buildPayload() — see that class for what's
     * grounded in our own data vs. what still needs live-API verification.
     *
     * What's been confirmed against the live API (read-only, via
     * getCategoryAttributes() against several real mapped categories) as of
     * 2026-08-13: auth + signing work end-to-end (real 200 responses, not
     * auth errors), the response envelope's `code`/`data` shape matches what
     * request() expects, and the universal SKU field names this client
     * hardcodes — SellerSku, price, quantity, package_weight/length/width/height
     * — exactly match Lazada's real schema for every category checked. One
     * real mismatch found and fixed this way: Lazada's schema calls the SKU
     * image slot "__images__", not "images" (see
     * LazadaProductSyncService::assertMandatoryFieldsPresent()).
     *
     * The `payload` shape itself was corrected the same day against a real
     * official Lazada `/product/create` PHP SDK example (Request > Product >
     * {PrimaryCategory, Images, Attributes, Skus.Sku[]}): it's a **JSON**
     * string, not XML — this client originally built XML from general Open
     * Platform knowledge, which the real example contradicts. buildProductPayload()
     * below now matches that confirmed example, including a Product-level
     * Images list (previously missing — only per-Sku Images existed).
     *
     * What's still genuinely unverified: this method's actual submission has
     * never been called — every check above was a read (GET-equivalent)
     * call, and the confirming example came from third-party SDK docs, not a
     * live response from this account. A live create/update is a real,
     * visible write to a real seller's storefront — do not call this
     * without the user's explicit, specific go-ahead on a real product,
     * ideally starting with one deliberately chosen test case.
     */
    public function createProduct(array $product): array
    {
        return $this->request('/product/create', ['payload' => $this->buildProductPayload($product)], method: 'POST');
    }

    /**
     * Same caveats as createProduct() — the write path itself is untested;
     * only the schema/field-name/payload-format assumptions it depends on
     * have been confirmed live or against a real official example (see
     * createProduct()'s docblock).
     */
    public function updateProduct(array $product): array
    {
        return $this->request('/product/update', ['payload' => $this->buildProductPayload($product)], method: 'POST');
    }

    /**
     * Hides a listing from the storefront without deleting it. $ids is
     * {item_id, sku_id, seller_sku} — Lazada's own numeric identifiers, not
     * ours, so these must come from a real Lazada lookup (see
     * LazadaProductSyncService::findProductMatch()), not be guessed/derived
     * locally.
     *
     * Confirmed against a real official /product/deactivate SDK example —
     * note this endpoint's shape genuinely differs from create/update: the
     * payload param is named "apiRequestBody" (not "payload"), and it's XML
     * (not JSON like /product/create) — Lazada's endpoints aren't uniform,
     * each one's shape needs its own confirmation rather than assuming
     * create's shape generalizes.
     *
     * FIRES A REAL, LIVE WRITE — takes down an actual listing customers can
     * currently see. Same "explicit go-ahead only" rule as createProduct().
     */
    public function deactivateProduct(array $ids): array
    {
        $xml = new \SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><Request/>');
        $productNode = $xml->addChild('Product');
        $productNode->addChild('ItemId', htmlspecialchars((string) $ids['item_id'], ENT_XML1));

        $skusNode = $productNode->addChild('Skus');
        $skusNode->addChild('SkuId', htmlspecialchars((string) $ids['sku_id'], ENT_XML1));
        $skusNode->addChild('SellerSku', htmlspecialchars((string) $ids['seller_sku'], ENT_XML1));

        return $this->request('/product/deactivate', ['apiRequestBody' => $xml->asXML()], method: 'POST');
    }

    /**
     * Uploads one image to Lazada's own CDN and returns its hosted URL.
     * Required because Lazada's create/update rejects any image URL that
     * isn't already on their domain — confirmed live, 2026-08-13:
     * `BIZ_CHECK_EXIST_OUTER_MAIN_IMAGE: Main image should not contain any
     * non-Lazada URLs` — our own storage URLs (even if publicly reachable,
     * which this deployment's LAN-only APP_URL isn't anyway) are never
     * acceptable as-is; every image must go through this endpoint first.
     *
     * $imageUrl is one of our own already-built URLs (e.g. from
     * AttributeValueFormatter). Originally this re-fetched it over HTTP,
     * which deadlocked: that HTTP call is made *from inside* the web server
     * process handling the current push request, back to that same web
     * server — under XAMPP's Apache with a limited worker/connection pool,
     * every worker was already busy serving the in-flight request, so the
     * self-directed request had nothing free to answer it and hung until
     * Laravel's HTTP client gave up (cURL error 28, 30s timeout, confirmed
     * live 2026-08-13). Reading the file straight off the 'public' disk
     * avoids the round-trip (and the deadlock) entirely — this always
     * succeeds for a URL this app itself built via
     * Storage::disk('public')->url(), which every caller in this codebase
     * uses; the HTTP fallback below only exists for a URL from somewhere
     * else, which shouldn't occur in practice here.
     *
     * Confirmed against real official /image/upload docs (open.lazada.com):
     * POST, multipart `image` field (raw bytes), JPG/PNG only, 1MB max,
     * response `data.image.url` is the hosted URL to use afterwards. NOT
     * confirmed: whether the common signed params (app_key/timestamp/
     * sign_method/access_token/sign) belong in the multipart body alongside
     * the file (as sent here, matching the official PHP SDK example's single
     * combined request) versus the query string — and whether file bytes are
     * excluded from the sign() base, which is assumed here per the
     * conventional rule for this API family (only scalar params are signed)
     * but wasn't spelled out on the docs page itself. This method itself has
     * never been called live.
     */
    public function uploadImage(string $imageUrl): string
    {
        $localPath = $this->resolveLocalPublicStoragePath($imageUrl);
        $imageBytes = $localPath !== null
            ? Storage::disk('public')->get($localPath)
            : Http::get($imageUrl)->body();

        if (!$imageBytes) {
            throw new RuntimeException("Could not read image to upload to Lazada: {$imageUrl}");
        }

        $filename = basename((string) parse_url($imageUrl, PHP_URL_PATH)) ?: 'image.jpg';

        $params = $this->signedParams('/image/upload', [], requiresAccessToken: true);

        $response = Http::attach('image', $imageBytes, $filename)
            ->post($this->baseUrl.'/image/upload', $params);

        $data = $this->handleResponse($response, '/image/upload', "[binary image: {$filename}, ".strlen($imageBytes).' bytes]');

        $url = $data['data']['image']['url'] ?? null;
        if (!$url) {
            throw new RuntimeException('Lazada image upload succeeded but returned no URL: '.json_encode($data, JSON_UNESCAPED_UNICODE));
        }

        return $url;
    }

    /**
     * Reverses Storage::disk('public')->url($path) — every image URL this
     * codebase builds (AttributeValueFormatter, etc.) goes through that same
     * call, so stripping its known prefix reliably recovers the original
     * relative path. Returns null (falls back to an HTTP fetch) for any URL
     * that doesn't match, e.g. one that isn't actually ours.
     */
    private function resolveLocalPublicStoragePath(string $imageUrl): ?string
    {
        $prefix = rtrim(Storage::disk('public')->url(''), '/').'/';

        if (!str_starts_with($imageUrl, $prefix)) {
            return null;
        }

        $path = substr($imageUrl, strlen($prefix));

        return Storage::disk('public')->exists($path) ? $path : null;
    }

    /**
     * Matches the confirmed real shape: {"Request":{"Product":{"PrimaryCategory",
     * "Images","Attributes","Skus":{"Sku":[...]}}}}. Every value is cast to
     * string since Lazada's example sends numeric fields (price, quantity,
     * package dimensions) as JSON strings, not numbers.
     *
     * $product['item_id'] (Product-level ItemId) and each sku's 'SkuId' are
     * only ever set for an update — confirmed live, 2026-08-13:
     * /product/update rejects the payload without SkuId ("skuId is a
     * mandatory field and must be filled in"). /product/create never sets
     * these — Lazada assigns them itself for a brand-new listing.
     */
    private function buildProductPayload(array $product): string
    {
        $productNode = [
            'PrimaryCategory' => (string) $product['primary_category_id'],
        ];

        if (!empty($product['item_id'])) {
            $productNode['ItemId'] = (string) $product['item_id'];
        }

        if (!empty($product['images'])) {
            $productNode['Images'] = ['Image' => array_values(array_map('strval', $product['images']))];
        }

        $productNode['Attributes'] = array_map('strval', $product['attributes']);

        $skus = [];
        foreach ($product['skus'] as $skuData) {
            $sku = [];
            foreach ($skuData as $key => $value) {
                if ($key === 'images') {
                    $sku['Images'] = ['Image' => array_values(array_map('strval', $value))];
                    continue;
                }
                $sku[$key] = (string) $value;
            }
            $skus[] = $sku;
        }
        $productNode['Skus'] = ['Sku' => $skus];

        return json_encode(['Request' => ['Product' => $productNode]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function request(string $apiPath, array $params = [], bool $requiresAccessToken = true, string $method = 'GET'): array
    {
        $params = $this->signedParams($apiPath, $params, $requiresAccessToken);

        $response = $method === 'POST'
            ? Http::asForm()->post($this->baseUrl.$apiPath, $params)
            : Http::get($this->baseUrl.$apiPath, $params);

        return $this->handleResponse($response, $apiPath, $params['payload'] ?? $params['apiRequestBody'] ?? null);
    }

    /**
     * Adds the common signed params (app_key/timestamp/sign_method/
     * [access_token]/sign) to $params — shared by request() and
     * uploadImage(), which needs the same signing but a multipart body
     * instead of a plain form/query request.
     */
    private function signedParams(string $apiPath, array $params, bool $requiresAccessToken): array
    {
        $params['app_key'] = $this->account->app_key;
        $params['timestamp'] = (string) round(microtime(true) * 1000);
        $params['sign_method'] = 'sha256';

        if ($requiresAccessToken) {
            $params['access_token'] = $this->account->access_token;
        }

        $params['sign'] = $this->sign($apiPath, $params);

        return $params;
    }

    /**
     * @param  mixed  $requestBodyForLogging  the string/description of what was
     *                sent, for the error log only — not re-derivable from the
     *                HTTP response, so the caller passes it in explicitly.
     */
    private function handleResponse(\Illuminate\Http\Client\Response $response, string $apiPath, mixed $requestBodyForLogging): array
    {
        $data = $response->json();

        if ($data === null) {
            throw new RuntimeException("Lazada API returned a non-JSON response (HTTP {$response->status()}): ".$response->body());
        }

        if (($data['code'] ?? '0') !== '0') {
            // Lazada's own docs: top-level codes like "500: Create product
            // failed" are an "overview error code" — the actual cause (which
            // SKU/field) is in a nested detail/data field this client wasn't
            // capturing at all, so every failure surfaced as an opaque
            // one-liner. Log the full request+response and put the whole
            // response body in the exception too, so a live failure like
            // this is actually diagnosable instead of just "it failed".
            Log::error('Lazada API error', [
                'api_path' => $apiPath,
                'request_body' => $requestBodyForLogging,
                'response' => $data,
            ]);

            throw new RuntimeException(
                "Lazada API error [{$data['code']}]: ".($data['message'] ?? 'unknown error')
                .' | full response: '.json_encode($data, JSON_UNESCAPED_UNICODE)
            );
        }

        return $data;
    }

    /**
     * Sort params by key, concatenate as "{key}{value}{key}{value}...",
     * prefix with the API path, HMAC-SHA256 with app_secret, uppercase hex.
     */
    private function sign(string $apiPath, array $params): string
    {
        ksort($params);

        $base = $apiPath;
        foreach ($params as $key => $value) {
            $base .= $key.$value;
        }

        return strtoupper(hash_hmac('sha256', $base, $this->account->app_secret));
    }
}
