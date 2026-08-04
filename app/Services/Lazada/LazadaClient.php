<?php

namespace App\Services\Lazada;

use App\Models\LazadaSellerAccount;
use Illuminate\Support\Facades\Http;
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
     * Creates a new listing for this shop. $product is the shape built by
     * LazadaProductSyncService::buildPayload() — see that class for what's
     * grounded in our own data vs. what still needs live-API verification.
     *
     * NOT verified against Lazada's live API — the XML field/tag names below
     * are best-effort from general Lazada Open Platform integration
     * knowledge, not confirmed current documentation. Mandatory attributes
     * also vary per category (fetched via /category/attributes/get, which
     * this client doesn't implement yet) — a real category will likely
     * reject this payload if it requires fields beyond what's built here.
     * Verify against Lazada's official docs or sandbox before using for real.
     */
    public function createProduct(array $product): array
    {
        return $this->request('/product/create', ['payload' => $this->buildProductXml($product)], method: 'POST');
    }

    /**
     * Same caveats as createProduct() — untested against the live API.
     */
    public function updateProduct(array $product): array
    {
        return $this->request('/product/update', ['payload' => $this->buildProductXml($product)], method: 'POST');
    }

    private function buildProductXml(array $product): string
    {
        // Without an explicit encoding, libxml emits non-ASCII text (e.g. Thai
        // product names) as numeric character references instead of raw
        // UTF-8 — technically valid XML, but needlessly verbose and an
        // avoidable risk if Lazada's parser is at all picky about it.
        $xml = new \SimpleXMLElement('<?xml version="1.0" encoding="UTF-8"?><Request/>');
        $productNode = $xml->addChild('Product');

        $productNode->addChild('PrimaryCategory', (string) $product['primary_category_id']);

        $attributesNode = $productNode->addChild('Attributes');
        foreach ($product['attributes'] as $key => $value) {
            $attributesNode->addChild($key, htmlspecialchars((string) $value, ENT_XML1));
        }

        $skusNode = $productNode->addChild('Skus');
        foreach ($product['skus'] as $skuData) {
            $skuNode = $skusNode->addChild('Sku');
            foreach ($skuData as $key => $value) {
                if ($key === 'images') {
                    $imagesNode = $skuNode->addChild('Images');
                    foreach ($value as $imageUrl) {
                        $imagesNode->addChild('Image', htmlspecialchars((string) $imageUrl, ENT_XML1));
                    }
                    continue;
                }

                $skuNode->addChild($key, htmlspecialchars((string) $value, ENT_XML1));
            }
        }

        return $xml->asXML();
    }

    private function request(string $apiPath, array $params = [], bool $requiresAccessToken = true, string $method = 'GET'): array
    {
        $params['app_key'] = $this->account->app_key;
        $params['timestamp'] = (string) round(microtime(true) * 1000);
        $params['sign_method'] = 'sha256';

        if ($requiresAccessToken) {
            $params['access_token'] = $this->account->access_token;
        }

        $params['sign'] = $this->sign($apiPath, $params);

        $response = $method === 'POST'
            ? Http::asForm()->post($this->baseUrl.$apiPath, $params)
            : Http::get($this->baseUrl.$apiPath, $params);
        $data = $response->json();

        if ($data === null) {
            throw new RuntimeException("Lazada API returned a non-JSON response (HTTP {$response->status()}): ".$response->body());
        }

        if (($data['code'] ?? '0') !== '0') {
            throw new RuntimeException("Lazada API error [{$data['code']}]: ".($data['message'] ?? 'unknown error'));
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
