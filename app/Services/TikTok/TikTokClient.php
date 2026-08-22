<?php

namespace App\Services\TikTok;

use App\Models\TikTokSellerAccount;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Thin wrapper around TikTok Shop's Partner API. Confirmed LIVE, 2026-08-17,
 * against a real connected shop (all four GET methods below returned real
 * data — 2692 real categories, real category rules/attributes for a real
 * leaf category, a real paginated brand list; getWarehouseList() too — two
 * real warehouses): base URL, path shapes, required header
 * (x-tts-access-token — a header, unlike Lazada/Shopee which pass their
 * token in the query string/form body), and GET signing in sign().
 *
 * POST/PUT signing confirmed live too, 2026-08-17, via deactivateProducts()
 * — but only after fixing two real bugs a GET-only test could never have
 * caught (GET has no body to get wrong):
 *
 * 1. TikTok's signature must include the exact raw JSON body string, not
 *    just the query params — sign()'s original GET-only shape (query params
 *    only) got `[106001] Invalid credentials. The 'sign' query parameter is
 *    invalid` on the very first real write. None of the shared docs spell
 *    this out on any single page; it's this API family's general pattern.
 *    See sign()'s docblock for exactly what's appended and why $body is
 *    sent via withBody() rather than post()/put()'s own $data argument.
 * 2. Sending 'content-type' via withHeaders() AND letting withBody() set
 *    its own 'Content-Type' produced two different header array keys (PHP
 *    array keys are case-sensitive) — i.e. two literal Content-Type header
 *    lines on the wire, even though both carried "application/json".
 *    TikTok rejected that outright with `[36009022] Invalid request
 *    format`, a completely different failure from the signature one above.
 *    See request()'s docblock.
 *
 * With both fixed, a live deactivateProducts() call against a syntactically
 * valid but nonexistent product_id came back exactly as the shared docs'
 * own example shows — top-level `code: 0`, the real error nested in
 * `data.errors[]` (`[12052032] The product does not exist`) — proving the
 * full POST request/response cycle, not just the signature.
 *
 * createProduct() and uploadImage() are CONFIRMED LIVE too, 2026-08-17, via
 * a full real push (through TikTokProductSyncService::push(), not called
 * directly): a real product's image uploaded, a real TikTok product got
 * created (`data.product_id` came back, a real SKU id under it, zero
 * warnings), and product_platform_shops.platform_item_id cached it
 * correctly. updateProduct()/activateProducts()/uploadFile() share this
 * same confirmed request()/sign() machinery but haven't been separately
 * exercised — updateProduct() specifically still carries the unconfirmed
 * PUT-vs-POST method choice noted below, since the live push above only
 * exercised the create path (this product had no prior platform_item_id
 * cached, so push()'s create-vs-update branch never reached updateProduct()).
 *
 * Real quirks confirmed live that the docs/screenshots didn't show: TikTok's
 * own attribute response spells the field "is_requried" (their typo, not
 * ours — see getAttributes()), and its brand `authorized_status` value is
 * "UNAUTHORIEZD" (also their typo) rather than the "UNAUTHORIZED" shown in
 * the docs' example response.
 *
 * Two real contradictions found *within* TikTok's own shared docs (not
 * live-confirmed either way, just flagging what was actually written):
 * "Edit Product"'s own Method field says POST, but its curl example uses
 * `-X PUT` — updateProduct() below goes with PUT (the runnable example, not
 * the summary table). Both "Upload Product Image" and "Upload Product
 * File"'s Method fields say GET, but their curl examples use POST with a
 * multipart body — uploadImage()/uploadFile() go with POST for the same
 * reason. If either guess is wrong, the fix is a one-line method-string
 * change in request()'s call site.
 *
 * Also notable: "Edit Product" lives on API version `202509`, not `202309`
 * like every other endpoint here — not a typo, the doc's own path and every
 * code sample agree on it, so updateProduct() defaults $apiVersion
 * differently from its siblings. And per the shared docs, the two upload
 * endpoints' Query params are app_key/sign/timestamp only — no shop_cipher,
 * unlike every other endpoint — so signedParams() below takes an
 * $includeShopCipher flag rather than assuming it's always required.
 */
class TikTokClient
{
    private string $baseUrl;

    private string $appKey;

    private string $appSecret;

    public function __construct(private readonly TikTokSellerAccount $account)
    {
        $this->baseUrl = config('services.tiktok.base_url');

        // Fails here with a clear, actionable message instead of further
        // down as a cryptic "Cannot assign null to property ... of type
        // string" — these two have no default in config/services.php (no
        // sane one exists for a secret) and are still unset in .env as of
        // this writing.
        $this->appKey = config('services.tiktok.app_key')
            ?: throw new RuntimeException('TIKTOK_APP_KEY is not set in .env — get it from TikTok Shop Partner Center and add it before syncing TikTok categories/products.');
        $this->appSecret = config('services.tiktok.app_secret')
            ?: throw new RuntimeException('TIKTOK_APP_SECRET is not set in .env — get it from TikTok Shop Partner Center and add it before syncing TikTok categories/products.');
    }

    /**
     * GET /product/{version}/categories — confirmed shape from the shared
     * docs: flat `data.categories[]`, each {id, parent_id, local_name,
     * is_leaf, permission_statuses}. `202309` is the API version segment
     * used in the docs' own curl example — not confirmed whether a newer
     * version exists/is preferred, kept as a param in case it needs to
     * change later without touching call sites.
     */
    public function getCategoryTree(string $categoryVersion = 'v2', string $locale = 'th-TH', string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/categories", [
            'category_version' => $categoryVersion,
            'locale' => $locale,
        ]);
    }

    /**
     * GET /product/{version}/categories/{category_id}/rules — confirmed
     * shape from the shared docs: `data` is a map keyed by requirement name
     * (e.g. "cod", "package_dimension", "epr", "responsible_person",
     * "manufacturer"), each `{is_supported, is_required}`, plus a top-level
     * `allowed_special_product_types` list. This is TikTok's compliance/
     * certification requirement check — a different concern from
     * getAttributes() below (which is the sales/product-property schema);
     * Lazada/Shopee don't separate the two the same way. $categoryId must
     * be a leaf category, per the docs' Note.
     *
     * Returned as the raw decoded `data` rather than reshaped into a typed
     * array — the shared screenshot's example was cut off before the full
     * field list, so the complete set of possible keys isn't confirmed.
     */
    public function getCategoryRules(string $categoryId, string $categoryVersion = 'v2', string $locale = 'th-TH', string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/categories/{$categoryId}/rules", [
            'category_version' => $categoryVersion,
            'locale' => $locale,
        ]);
    }

    /**
     * GET /product/{version}/categories/{category_id}/attributes —
     * confirmed live, 2026-08-17: `data.attributes[]`, each {id, name, type
     * (e.g. "PRODUCT_PROPERTY"), is_customizable, is_multiple_selection,
     * values?: [{id, name}]}. NOT `is_required` as the docs' example shows —
     * the real response spells it `is_requried` (TikTok's own typo);
     * value_data_format/icon_url appear in the docs' example but weren't
     * present on every real attribute seen, so treat both as optional. This
     * is the sales/product attribute schema — see getCategoryRules() above
     * for the separate compliance-requirement check. $categoryId must be a
     * leaf category, per the docs' Note.
     */
    public function getAttributes(string $categoryId, string $categoryVersion = 'v2', string $locale = 'th-TH', string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/categories/{$categoryId}/attributes", [
            'category_version' => $categoryVersion,
            'locale' => $locale,
        ]);
    }

    /**
     * GET /product/{version}/brands — confirmed live, 2026-08-17:
     * `data.brands[]`, each {id, name, authorized_status, is_t1_brand,
     * brand_status ("AVAILABLE")}, plus `data.total_count`/
     * `data.next_page_token`. authorized_status came back "UNAUTHORIEZD"
     * live, not "UNAUTHORIZED" as the docs' example shows (TikTok's own
     * typo) — match against the misspelled value if filtering on it.
     * Pagination is cursor-based (page_token/next_page_token), NOT
     * offset-based like Lazada's startRow/Shopee's offset — passing
     * $pageToken from a previous response's next_page_token is how a caller
     * pages through results. $categoryId (optional) scopes to brands usable
     * in that category; page_size is documented as required, range 1-100.
     */
    public function getBrands(?string $categoryId = null, ?string $brandName = null, int $pageSize = 50, ?string $pageToken = null, string $categoryVersion = 'v2', string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/brands", array_filter([
            'category_id' => $categoryId,
            'brand_name' => $brandName,
            'page_size' => $pageSize,
            'page_token' => $pageToken,
            'category_version' => $categoryVersion,
        ], fn ($value) => $value !== null));
    }

    /**
     * GET /logistics/{version}/warehouses — confirmed live, 2026-08-17:
     * `data.warehouses[]`, each {id, entity_id, name, effect_status
     * ("ENABLED"/"DISABLED"/"RESTRICTED"), type ("SALES_WAREHOUSE"/
     * "RETURN_WAREHOUSE"), sub_type, is_default, address: {...}} — a real
     * shop returned exactly one of each type. This `id` is what
     * TikTokProductSyncService needs for every SKU's
     * skus[].inventory[].warehouse_id — see that class's resolveWarehouseId().
     */
    public function getWarehouseList(string $apiVersion = '202309'): array
    {
        return $this->request("/logistics/{$apiVersion}/warehouses");
    }

    /**
     * GET /logistics/{version}/global_warehouses — confirmed shape from the
     * shared docs: `data.global_warehouses[]`, each {id, name, ownership
     * ("SELLER"/"PLATFORM_COOPERATION")}. Distinct concept from
     * getWarehouseList() above — this is for global/cross-border sellers'
     * own consolidated warehouses, not the per-shop sales/return warehouses
     * a domestic push actually needs; not currently used by
     * TikTokProductSyncService. Per the shared docs, this endpoint's Query
     * params don't include shop_cipher (same irregularity as the two
     * upload endpoints — see class docblock), hence $includeShopCipher:
     * false. NOT yet confirmed live.
     */
    public function getGlobalSellerWarehouse(string $apiVersion = '202309'): array
    {
        return $this->request("/logistics/{$apiVersion}/global_warehouses", includeShopCipher: false);
    }

    /**
     * GET /product/{version}/products/{product_id} — confirmed shape from
     * shared docs. Huge response (certifications, POD templates, subscribe
     * info, ...) — decoded and returned as-is, callers pick what they need.
     * `data.status` ("This status incorporates both the product status and
     * the audit status" per the docs — distinct from the separate
     * `data.product_status`, which excludes audit) is what
     * TikTokProductSyncService::checkLiveStatus() uses to determine
     * is_live — "ACTIVATE" means live, matching the docs' own example.
     * NOT yet confirmed live — an entirely different response shape from
     * anything called live so far in this session.
     */
    public function getProduct(string $productId, string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/products/{$productId}");
    }

    /**
     * POST /product/{version}/products/search — confirmed shape from
     * shared docs. Bulk equivalent of getProduct() above — not currently
     * called by TikTokProductSyncService (no bulk syncLiveStatus()
     * implemented yet, see that class's docblock), but available here for
     * one, the same shape Lazada/ShopeeProductSyncService::syncLiveStatus()
     * already use. Genuinely different from every other write method here:
     * page_size/page_token are QUERY params (confirmed from the curl
     * example — signed alongside app_key/sign/timestamp/shop_cipher) even
     * though the call itself is POST with a JSON body for the actual
     * filters (status, seller_skus, ...) — the only endpoint among all of
     * these where a POST carries both a signed query and a body; see
     * request()'s docblock for how that's handled. NOT yet confirmed live.
     * Different API version (`202502`) from every other product/...
     * endpoint here — like updateProduct()'s `202509`, confirmed from the
     * doc's own path and every code sample, not a typo.
     */
    public function searchProducts(array $filters = [], int $pageSize = 100, ?string $pageToken = null, string $apiVersion = '202502'): array
    {
        return $this->request("/product/{$apiVersion}/products/search", array_filter([
            'page_size' => $pageSize,
            'page_token' => $pageToken,
        ], fn ($value) => $value !== null), method: 'POST', body: $filters);
    }

    /**
     * POST /product/{version}/products — CONFIRMED LIVE, 2026-08-17: a real
     * push (via TikTokProductSyncService::push()) created a real TikTok
     * product — `data.product_id` and a real SKU id came back, zero
     * warnings. $product must already be built to TikTok's schema — this
     * client doesn't build or validate it; see TikTokProductSyncService for
     * that, mirroring LazadaProductSyncService/
     * ShopeeProductSyncService::buildPayload().
     *
     * Only description/category_id/main_images/skus/title are marked
     * required by the docs — everything else (brand_id, product_attributes,
     * package_weight, certifications, ...) is conditionally required
     * depending on the category's rules (see getCategoryRules()/
     * getAttributes()), same pattern as Lazada's assertMandatoryFieldsPresent().
     *
     * FIRES A REAL, LIVE WRITE — creates an actual listing on the seller's
     * storefront, visible to real customers (unless save_mode is set to
     * AS_DRAFT). Never call this without the user's explicit, specific
     * go-ahead on a real product.
     */
    public function createProduct(array $product, string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/products", method: 'POST', body: $product);
    }

    /**
     * PUT /product/{version}/products/{product_id} — confirmed shape from
     * the shared "Edit Product" docs (method choice and API version — see
     * class docblock for why both differ from createProduct()'s pattern).
     * Shares the same confirmed-live signing/content-type machinery as
     * deactivateProducts() (see class docblock) but hasn't itself been
     * separately called against a real shop.
     *
     * Critical semantic difference from createProduct(): $product['skus']
     * is NOT additive. Per the docs, any of the product's existing SKU IDs
     * NOT included here get deleted — e.g. a 5-SKU product edited with only
     * 2 SKU IDs present loses the other 3. A caller must always pass every
     * SKU it wants to keep, existing or new (existing ones carry their
     * `id`; new ones omit it).
     *
     * FIRES A REAL, LIVE WRITE — edits an actual listing visible to real
     * customers (unless save_mode is AS_DRAFT). Same explicit-go-ahead rule
     * as createProduct().
     */
    public function updateProduct(string $productId, array $product, string $apiVersion = '202509'): array
    {
        return $this->request("/product/{$apiVersion}/products/{$productId}", method: 'PUT', body: $product);
    }

    /**
     * POST /product/{version}/images/upload — CONFIRMED LIVE, 2026-08-17:
     * uploaded a real product's image as part of the same real push
     * createProduct() was confirmed with (see that method's docblock) — the
     * `-X POST` vs. the docs' own "Method: GET" contradiction (see class
     * docblock) resolved correctly. $imageUrl is one of our own
     * already-built URLs; identical local-disk-read-over-self-HTTP-call
     * reasoning as LazadaClient::uploadImage()'s docblock (avoids a
     * same-process deadlock under a limited-worker web server) — the HTTP
     * fallback below only exists for a URL from somewhere else.
     *
     * Returns the `uri` TikTok assigns the upload — this, not the image's
     * original URL, is what main_images[].uri (and every other image slot)
     * in createProduct()/updateProduct() must reference; TikTok rejects any
     * image URL that isn't already hosted on their own domain, same rule
     * Lazada/Shopee enforce.
     *
     * FIRES A REAL WRITE — uploads a real file to TikTok's media library.
     * Lower risk than the product write methods above (doesn't attach it to
     * any listing by itself), but still a live write against a real shop.
     */
    public function uploadImage(string $imageUrl, string $useCase = 'MAIN_IMAGE', string $apiVersion = '202309'): string
    {
        $localPath = $this->resolveLocalPublicStoragePath($imageUrl);
        $imageBytes = $localPath !== null
            ? Storage::disk('public')->get($localPath)
            : Http::timeout(30)->retry(2, 200)->get($imageUrl)->body();

        if (! $imageBytes) {
            throw new RuntimeException("Could not read image to upload to TikTok: {$imageUrl}");
        }

        $filename = basename((string) parse_url($imageUrl, PHP_URL_PATH)) ?: 'image.jpg';
        $apiPath = "/product/{$apiVersion}/images/upload";
        $query = $this->signedParams($apiPath, [], includeShopCipher: false);

        // No retry() here — unlike a plain GET, a partial failure after
        // TikTok already received the bytes shouldn't be blindly resent,
        // same reasoning as ShopeeClient/LazadaClient's own upload paths.
        $response = Http::timeout(30)
            ->withHeaders(['x-tts-access-token' => $this->account->access_token])
            ->attach('data', $imageBytes, $filename)
            ->withQueryParameters($query)
            ->post($this->baseUrl.$apiPath, ['use_case' => $useCase]);

        $data = $this->handleResponse($response, $apiPath);

        $uri = $data['data']['uri'] ?? null;
        if (! $uri) {
            throw new RuntimeException('TikTok image upload succeeded but returned no uri: '.json_encode($data, JSON_UNESCAPED_UNICODE));
        }

        return $uri;
    }

    /**
     * POST /product/{version}/files/upload — confirmed shape from the
     * shared "Upload Product File" docs (method choice — see class
     * docblock; NOT yet confirmed live). Same local-disk-first reasoning as
     * uploadImage() above. Used for certification PDFs and product videos
     * (certifications[].files[].id / video.id in createProduct()/
     * updateProduct()) — $filename must include the extension per the docs
     * ("certification.pdf", not "certification"). Wired up for the video
     * case, 2026-08-22, by TikTokProductSyncService::uploadVideoToTikTok() —
     * still not itself confirmed live (that method's docblock).
     */
    public function uploadFile(string $fileUrl, ?string $filename = null, string $apiVersion = '202309'): string
    {
        $localPath = $this->resolveLocalPublicStoragePath($fileUrl);
        $fileBytes = $localPath !== null
            ? Storage::disk('public')->get($localPath)
            : Http::timeout(30)->retry(2, 200)->get($fileUrl)->body();

        if (! $fileBytes) {
            throw new RuntimeException("Could not read file to upload to TikTok: {$fileUrl}");
        }

        $filename ??= basename((string) parse_url($fileUrl, PHP_URL_PATH)) ?: 'file.pdf';
        $apiPath = "/product/{$apiVersion}/files/upload";
        $query = $this->signedParams($apiPath, [], includeShopCipher: false);

        $response = Http::timeout(30)
            ->withHeaders(['x-tts-access-token' => $this->account->access_token])
            ->attach('data', $fileBytes, $filename)
            ->withQueryParameters($query)
            ->post($this->baseUrl.$apiPath, ['name' => $filename]);

        $data = $this->handleResponse($response, $apiPath);

        $fileId = $data['data']['id'] ?? null;
        if (! $fileId) {
            throw new RuntimeException('TikTok file upload succeeded but returned no id: '.json_encode($data, JSON_UNESCAPED_UNICODE));
        }

        return $fileId;
    }

    /**
     * POST /product/{version}/products/activate — confirmed shape from the
     * shared docs; shares the confirmed-live machinery deactivateProducts()
     * below proved out (see class docblock), not separately called itself.
     * $productIds are TikTok's own product IDs (from createProduct()'s
     * response `data.product_id`, not ours) — max 20 per call per the docs.
     * $listingPlatforms only matters for sellers migrated from Tokopedia;
     * omit it to default to TIKTOK_SHOP only.
     *
     * Response is 200 even for partial failure — per-product errors land in
     * `data.errors[].detail.product_id`, not an HTTP error or top-level
     * `code` — handleResponse() won't catch a partial failure here, the
     * caller must inspect `data.errors` itself.
     *
     * FIRES A REAL, LIVE WRITE — activates real listing(s) visible to real
     * customers. Same explicit-go-ahead rule as createProduct().
     */
    public function activateProducts(array $productIds, ?array $listingPlatforms = null, string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/products/activate", method: 'POST', body: array_filter([
            'product_ids' => $productIds,
            'listing_platforms' => $listingPlatforms,
        ], fn ($value) => $value !== null));
    }

    /**
     * POST /product/{version}/products/deactivate — CONFIRMED LIVE,
     * 2026-08-17, against a real shop: a syntactically valid but
     * nonexistent product_id came back `{"code":0,"data":{"errors":[
     * {"code":12052032,"message":"The product does not exist",...}]}}` —
     * exactly the shape the shared docs' own example shows, proving the
     * full request/response cycle (signing, content-type, response
     * parsing), not just that the call reached TikTok. This is what
     * surfaced and fixed the two real signing/header bugs described in the
     * class docblock. Same $productIds/max-20/partial-failure-in-
     * `data.errors` caveats as activateProducts() above.
     *
     * FIRES A REAL, LIVE WRITE — takes down real listing(s) visible to real
     * customers. Same explicit-go-ahead rule as createProduct() — this
     * method's own signing being proven doesn't mean it's safe to call
     * against a real product_id without asking first.
     */
    public function deactivateProducts(array $productIds, ?array $listingPlatforms = null, string $apiVersion = '202309'): array
    {
        return $this->request("/product/{$apiVersion}/products/deactivate", method: 'POST', body: array_filter([
            'product_ids' => $productIds,
            'listing_platforms' => $listingPlatforms,
        ], fn ($value) => $value !== null));
    }

    /**
     * $params are query params (signed — see signedParams()) — sent on
     * every method, GET or not: most POST/PUT call sites here pass none
     * (their business fields all live in $body instead), but
     * searchProducts() is the one exception, needing page_size/page_token
     * signed in the query string alongside a POST body — see that
     * method's docblock. Confirmed live, 2026-08-17: the query string
     * alone (app_key/sign/timestamp/shop_cipher, no business fields —
     * matching every POST curl example in the shared docs) is NOT enough
     * to sign a POST/PUT correctly — TikTok rejected the first real write
     * with `[106001] Invalid credentials. The 'sign' query parameter is
     * invalid`, which only a body-carrying call could ever surface (every
     * GET above signed and worked first try, but GETs have no body to
     * omit). The real algorithm needs the exact raw JSON body string
     * appended to the signed base too — see sign()'s docblock. $body is
     * sent via withBody() rather than passed to post()/put()'s own $data
     * argument specifically so the bytes actually transmitted are
     * byte-identical to $rawBody below — Laravel's default
     * json-encode-on-send (Guzzle's json middleware) isn't guaranteed to
     * produce the same bytes as our own json_encode() call, and a signature
     * over the wrong bytes would fail the same way this one just did.
     */
    private function request(string $apiPath, array $params = [], string $method = 'GET', ?array $body = null, bool $includeShopCipher = true): array
    {
        $isWrite = in_array($method, ['POST', 'PUT'], true);
        $rawBody = $isWrite ? json_encode($body ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
        $query = $this->signedParams($apiPath, $params, $includeShopCipher, $rawBody);

        $http = Http::timeout(30)->withHeaders([
            'x-tts-access-token' => $this->account->access_token,
        ]);

        // content-type set two different ways below, deliberately not both
        // on the same request — confirmed live, 2026-08-17: withHeaders()
        // stores the key exactly as given ('content-type'), while
        // withBody()'s own contentType() call stores 'Content-Type'
        // (capitalized). PHP array keys are case-sensitive, so setting both
        // sent two separate Content-Type header lines and TikTok rejected
        // the request outright (36009022 "Invalid request format") even
        // though both lines carried the identical value. GET has no
        // withBody() call, so it still needs its own explicit header here;
        // POST/PUT get theirs from withBody() alone.
        //
        // retry() only for GET — only fires on connection-level failures
        // since handleResponse() below doesn't throw on TikTok's own error
        // codes, but a write (POST/PUT) that connected and was received
        // shouldn't be blindly resent even on a later network hiccup, same
        // reasoning as ShopeeClient/LazadaClient's upload paths.
        $response = match ($method) {
            'POST' => $http->withQueryParameters($query)->withBody($rawBody, 'application/json')->post($this->baseUrl.$apiPath),
            'PUT' => $http->withQueryParameters($query)->withBody($rawBody, 'application/json')->put($this->baseUrl.$apiPath),
            default => $http->withHeaders(['content-type' => 'application/json'])->retry(2, 200)->get($this->baseUrl.$apiPath, $query),
        };

        return $this->handleResponse($response, $apiPath);
    }

    /**
     * app_key/timestamp/[shop_cipher]/sign — shop_cipher is required on
     * every call per the shared docs' "Query" table EXCEPT the two upload
     * endpoints, whose own docs list only app_key/sign/timestamp (see class
     * docblock) — $includeShopCipher lets uploadImage()/uploadFile() opt
     * out. shop_cipher itself comes from this account's own n8n row
     * (TikTokSellerAccount::$shops_cipher), not a fixed app-level value —
     * each connected shop has its own. $rawBody is forwarded to sign() only
     * — see that method's docblock for why request() passes it here but
     * uploadImage()/uploadFile() (multipart, calls this directly) never do.
     */
    private function signedParams(string $apiPath, array $params, bool $includeShopCipher = true, ?string $rawBody = null): array
    {
        $params['app_key'] = $this->appKey;
        $params['timestamp'] = time();
        if ($includeShopCipher) {
            $params['shop_cipher'] = $this->account->shops_cipher;
        }
        $params['sign'] = $this->sign($apiPath, $params, $rawBody);

        return $params;
    }

    /**
     * GET signing confirmed live, 2026-08-17 (every read-only method above
     * signed and worked first try): sort params (excluding sign/
     * access_token) by key, concatenate as "{key}{value}{key}{value}...",
     * prefix with the API path.
     *
     * $rawBody EXTENSION — not confirmed by a worked example anywhere in
     * the shared docs, added only after the first real POST (createProduct
     * via push()) came back `[106001] Invalid credentials. The 'sign' query
     * parameter is invalid` with the body excluded. Appending the exact raw
     * JSON body string to $base (still wrapped with app_secret on both
     * sides, still HMAC-SHA256 keyed by app_secret, same as GET) is this
     * API family's documented general pattern — TikTok's own docs just
     * never spell it out on any single page shared in this session. Passed
     * as null for GET and for the two multipart upload endpoints (see
     * signedParams()'s docblock) — this still needs its own live
     * confirmation on the very next real write attempt.
     */
    private function sign(string $apiPath, array $params, ?string $rawBody = null): string
    {
        unset($params['sign'], $params['access_token']);
        ksort($params);

        $base = $apiPath;
        foreach ($params as $key => $value) {
            $base .= $key.$value;
        }

        if ($rawBody !== null) {
            $base .= $rawBody;
        }

        $input = $this->appSecret.$base.$this->appSecret;

        return hash_hmac('sha256', $input, $this->appSecret);
    }

    /**
     * Reverses Storage::disk('public')->url($path) — identical to
     * ShopeeClient/LazadaClient's version of this helper.
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

    private function handleResponse(Response $response, string $apiPath): array
    {
        $data = $response->json();

        if ($data === null) {
            throw new RuntimeException("TikTok API returned a non-JSON response (HTTP {$response->status()}): ".$response->body());
        }

        if (($data['code'] ?? 0) !== 0) {
            Log::error('TikTok API error', [
                'api_path' => $apiPath,
                'response' => $data,
            ]);

            throw new RuntimeException(
                "TikTok API error [{$data['code']}]: ".($data['message'] ?? 'unknown error')
            );
        }

        return $data;
    }
}
