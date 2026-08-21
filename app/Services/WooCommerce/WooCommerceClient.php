<?php

namespace App\Services\WooCommerce;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Thin wrapper around WooCommerce's REST API v3 (plain HTTPS + JSON, HTTP
 * Basic Auth with a Consumer Key/Secret pair) — no request signing, no OAuth
 * refresh, unlike LazadaClient/ShopeeClient. Reads config('services.woocommerce')
 * directly rather than taking a per-shop account, since this app currently
 * only talks to one WooCommerce site (see WooCommerceProductSyncService::forShop()'s
 * docblock for why there's no per-shop credentials model yet).
 *
 * Two separate credential pairs, not one — see uploadMedia()'s docblock for
 * why a second (WordPress Application Password, not the WooCommerce key) is
 * needed just for image uploads.
 */
class WooCommerceClient
{
    private string $siteUrl;

    private string $baseUrl;

    private string $consumerKey;

    private string $consumerSecret;

    private ?string $wpUsername;

    private ?string $wpAppPassword;

    public function __construct()
    {
        $config = config('services.woocommerce');

        if (empty($config['url']) || empty($config['consumer_key']) || empty($config['consumer_secret'])) {
            throw new RuntimeException('WooCommerce is not configured — set WOOCOMMERCE_URL/WOOCOMMERCE_CONSUMER_KEY/WOOCOMMERCE_CONSUMER_SECRET.');
        }

        $this->siteUrl = rtrim($config['url'], '/');
        $this->baseUrl = $this->siteUrl.'/wp-json/wc/v3';
        $this->consumerKey = $config['consumer_key'];
        $this->consumerSecret = $config['consumer_secret'];
        // Not required to construct the client — only uploadMedia() needs
        // these, and throws its own clear error if they're missing when
        // actually called, so every other method still works without them.
        $this->wpUsername = $config['wp_username'] ?: null;
        $this->wpAppPassword = $config['wp_app_password'] ?: null;
    }

    /**
     * GET /products?sku={sku} — WooCommerce's `sku` filter is an exact
     * match, so this is the equivalent of LazadaClient::findProductBySku()/
     * ShopeeClient's item-by-SellerSku lookup: how push()/deactivate()/
     * checkLiveStatus() decide whether a listing already exists, without
     * tracking our own platform_item_id lookup table.
     */
    public function findProductBySku(string $sku): ?array
    {
        $products = $this->request('GET', '/products', ['sku' => $sku]);

        return $products[0] ?? null;
    }

    public function getProduct(int $id): ?array
    {
        try {
            return $this->request('GET', "/products/{$id}");
        } catch (RuntimeException) {
            return null;
        }
    }

    /**
     * FIRES A REAL, LIVE WRITE TO WOOCOMMERCE — creates an actual listing on
     * the store, visible to real customers if $payload['status'] is
     * 'publish'. Never call this without the user's explicit, specific
     * go-ahead on a real product.
     */
    public function createProduct(array $payload): array
    {
        return $this->request('POST', '/products', $payload);
    }

    /**
     * FIRES A REAL, LIVE WRITE TO WOOCOMMERCE — edits an actual existing
     * listing (including deactivate()'s status:'draft' write). Same
     * explicit-go-ahead rule as createProduct().
     */
    public function updateProduct(int $id, array $payload): array
    {
        return $this->request('PUT', "/products/{$id}", $payload);
    }

    /**
     * GET /products/categories — one page (WooCommerce's default/max
     * per_page is 100). Pagination across pages is the caller's
     * responsibility (see CategoryController::syncWoocommerceCategories()),
     * same split LazadaClient/ShopeeClient keep between "one page" and their
     * sync services' pagination loop.
     */
    public function getCategories(int $page = 1, int $perPage = 100): array
    {
        return $this->request('GET', '/products/categories', ['page' => $page, 'per_page' => $perPage]);
    }

    /**
     * GET /products/brands — WooCommerce's native Product Brands taxonomy
     * (confirmed live, 2026-08-21: the real store has 4 brands returned in
     * this exact shape — {id, name, slug, parent, description, image,
     * count, ...}, identical to /products/categories). Same one-page-per-
     * call split as getCategories(); pagination loop is the caller's job.
     */
    public function getBrands(int $page = 1, int $perPage = 100): array
    {
        return $this->request('GET', '/products/brands', ['page' => $page, 'per_page' => $perPage]);
    }

    /**
     * POST /wp-json/wp/v2/media — uploads image bytes to WordPress's own
     * Media Library, returning the created attachment (notably `id` and
     * `source_url`). Needed because sending a product's images[].src as a
     * plain URL makes WordPress try to sideload it itself, which rejects our
     * storage URLs outright — confirmed live, 2026-08-20:
     * "getting remote image ... no usable URL provided", WordPress's own
     * SSRF protection against private/internal IP addresses (not a real
     * network-reachability problem — everything else about this connection
     * works). Uploading the bytes ourselves sidesteps that check entirely.
     *
     * Uses wp_username/wp_app_password (a WordPress core Application
     * Password), NOT the WooCommerce consumer_key/consumer_secret — also
     * confirmed live, 2026-08-20: the WooCommerce key gets a 401
     * rest_cannot_create against this endpoint, since WooCommerce's REST
     * Basic Auth is scoped to its own wc/v3 namespace only.
     *
     * Reads local files directly off the public disk rather than through a
     * self-HTTP GET, same deadlock-avoidance reasoning as
     * LazadaClient::uploadImage()/ShopeeClient::uploadImage().
     */
    public function uploadMedia(string $imageUrl): array
    {
        if (!$this->wpUsername || !$this->wpAppPassword) {
            throw new RuntimeException('WordPress media upload is not configured — set WOOCOMMERCE_WP_USERNAME/WOOCOMMERCE_WP_APP_PASSWORD (a WordPress Application Password, not the WooCommerce API key).');
        }

        $localPath = $this->resolveLocalPublicStoragePath($imageUrl);
        if ($localPath !== null) {
            $bytes = Storage::disk('public')->get($localPath);
            $mimeType = Storage::disk('public')->mimeType($localPath) ?: 'application/octet-stream';
        } else {
            $remote = Http::timeout(30)->retry(2, 200)->get($imageUrl);
            $bytes = $remote->body();
            $mimeType = $remote->header('Content-Type') ?: 'application/octet-stream';
        }

        if (!$bytes) {
            throw new RuntimeException("Could not read image to upload to WooCommerce: {$imageUrl}");
        }

        $filename = basename((string) parse_url($imageUrl, PHP_URL_PATH)) ?: 'image.jpg';

        $response = Http::withBasicAuth($this->wpUsername, $this->wpAppPassword)
            ->timeout(30)
            ->withBody($bytes, $mimeType)
            ->withHeaders(['Content-Disposition' => "attachment; filename=\"{$filename}\""])
            ->post($this->siteUrl.'/wp-json/wp/v2/media');

        return $this->handleResponse($response, 'POST', '/wp/v2/media');
    }

    /**
     * Reverses Storage::disk('public')->url($path) — identical to
     * LazadaClient's/ShopeeClient's version of this helper.
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

    private function request(string $method, string $path, array $params = []): array
    {
        // timeout() bounds how long a hung/slow WooCommerce response can
        // hold a request thread open; retry() only fires on connection-level
        // failures (timeout, DNS, refused) — handleResponse() below throws
        // on WooCommerce's own error responses without retrying them, same
        // "never blindly resend a real API error" reasoning as ShopeeClient.
        //
        // throw: false is required — retry()'s own default ($throw: true)
        // throws Illuminate\Http\Client\RequestException itself once retries
        // are exhausted on any failed (non-2xx) response, with a truncated
        // message and before handleResponse() below ever runs. Unlike
        // Lazada/Shopee (whose APIs return HTTP 200 with an error code in the
        // body even for business-logic failures, so this never came up for
        // ShopeeClient), WooCommerce's REST API uses real 4xx/5xx status
        // codes for errors — confirmed live, 2026-08-20: a 400 with a real
        // JSON error body (woocommerce_product_image_upload_error) surfaced
        // as this truncated RequestException instead of handleResponse()'s
        // full, readable RuntimeException until this was set explicitly.
        $http = Http::withBasicAuth($this->consumerKey, $this->consumerSecret)->timeout(30)->retry(2, 200, throw: false);

        $response = match ($method) {
            'GET' => $http->get($this->baseUrl.$path, $params),
            'POST' => $http->post($this->baseUrl.$path, $params),
            'PUT' => $http->put($this->baseUrl.$path, $params),
            default => throw new RuntimeException("Unsupported HTTP method: {$method}"),
        };

        return $this->handleResponse($response, $method, $path);
    }

    private function handleResponse(Response $response, string $method, string $path): array
    {
        $data = $response->json();

        if ($data === null) {
            throw new RuntimeException("WooCommerce API returned a non-JSON response (HTTP {$response->status()}) for {$method} {$path}: ".$response->body());
        }

        if ($response->failed()) {
            Log::error('WooCommerce API error', [
                'method' => $method,
                'path' => $path,
                'status' => $response->status(),
                'response' => $data,
            ]);

            throw new RuntimeException(
                "WooCommerce API error [{$response->status()}] for {$method} {$path}: ".($data['message'] ?? 'unknown error')
            );
        }

        return $data;
    }
}
