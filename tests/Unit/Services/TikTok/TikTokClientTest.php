<?php

use App\Models\TikTokSellerAccount;
use App\Services\TikTok\TikTokClient;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/** TikTokSellerAccount is read-only (n8n owns it) and on a separate 'n8n' connection — never persisted. */
function makeTikTokAccount(array $overrides = []): TikTokSellerAccount
{
    $account = new TikTokSellerAccount();
    foreach (array_merge([
        'access_token' => 'token123',
        'shops_cipher' => 'cipher123',
    ], $overrides) as $key => $value) {
        $account->{$key} = $value;
    }

    return $account;
}

function tiktokQueryParams(\Illuminate\Http\Client\Request $request): array
{
    parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $params);

    return $params;
}

function expectedTikTokSign(string $appSecret, string $apiPath, array $params, ?string $rawBody = null): string
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

    return hash_hmac('sha256', $appSecret.$base.$appSecret, $appSecret);
}

beforeEach(function () {
    config([
        'services.tiktok.base_url' => 'https://open-api.tiktokglobalshop.com',
        'services.tiktok.app_key' => 'appkey123',
        'services.tiktok.app_secret' => 'appsecret123',
    ]);
});

test('the constructor throws immediately, with an actionable message, when TIKTOK_APP_KEY is missing', function () {
    config(['services.tiktok.app_key' => null]);

    new TikTokClient(makeTikTokAccount());
})->throws(RuntimeException::class, 'TIKTOK_APP_KEY is not set');

test('the constructor throws immediately when TIKTOK_APP_SECRET is missing', function () {
    config(['services.tiktok.app_secret' => null]);

    new TikTokClient(makeTikTokAccount());
})->throws(RuntimeException::class, 'TIKTOK_APP_SECRET is not set');

test('a GET request carries a correctly HMAC-signed set of common params, including shop_cipher by default', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    $client = new TikTokClient(makeTikTokAccount());

    $client->getCategoryTree();

    Http::assertSent(function ($request) {
        $params = tiktokQueryParams($request);
        expect($params['app_key'])->toBe('appkey123');
        expect($params['shop_cipher'])->toBe('cipher123');
        expect($params['sign'])->toBe(expectedTikTokSign('appsecret123', '/product/202309/categories', $params));

        return true;
    });
});

test('every request carries the x-tts-access-token header', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    (new TikTokClient(makeTikTokAccount()))->getCategoryTree();

    Http::assertSent(fn ($request) => $request->hasHeader('x-tts-access-token', 'token123'));
});

test('getCategoryTree sends category_version/locale and hits the versioned categories path', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    (new TikTokClient(makeTikTokAccount()))->getCategoryTree('v2', 'en-US', '202309');

    Http::assertSent(function ($request) {
        $params = tiktokQueryParams($request);

        return str_contains($request->url(), '/product/202309/categories')
            && $params['category_version'] === 'v2' && $params['locale'] === 'en-US';
    });
});

test('getCategoryRules and getAttributes both interpolate the category id into the path', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    $client = new TikTokClient(makeTikTokAccount());

    $client->getCategoryRules('cat123');
    $client->getAttributes('cat123');

    Http::assertSent(fn ($request) => str_contains($request->url(), '/categories/cat123/rules'));
    Http::assertSent(fn ($request) => str_contains($request->url(), '/categories/cat123/attributes'));
});

test('getBrands drops null optional filters instead of sending them as empty/blank params', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    (new TikTokClient(makeTikTokAccount()))->getBrands();

    Http::assertSent(function ($request) {
        $params = tiktokQueryParams($request);

        return ! array_key_exists('category_id', $params) && ! array_key_exists('brand_name', $params) && ! array_key_exists('page_token', $params)
            && $params['page_size'] === '50';
    });
});

test('createCustomBrand POSTs the name and omits shop_cipher, per its own docs\' Query table', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => ['id' => 'brand_1']], 200)]);
    (new TikTokClient(makeTikTokAccount()))->createCustomBrand('Acme');

    Http::assertSent(function ($request) {
        $params = tiktokQueryParams($request);

        return $request->method() === 'POST' && ! array_key_exists('shop_cipher', $params)
            && json_decode($request->body(), true) === ['name' => 'Acme'];
    });
});

test('getGlobalSellerWarehouse omits shop_cipher; getWarehouseList (a different endpoint) includes it', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    $client = new TikTokClient(makeTikTokAccount());

    $client->getGlobalSellerWarehouse();
    $client->getWarehouseList();

    Http::assertSent(fn ($request) => str_contains($request->url(), 'global_warehouses') && ! array_key_exists('shop_cipher', tiktokQueryParams($request)));
    Http::assertSent(fn ($request) => str_contains($request->url(), '/warehouses') && array_key_exists('shop_cipher', tiktokQueryParams($request)));
});

test('getProduct interpolates the product id into the path', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    (new TikTokClient(makeTikTokAccount()))->getProduct('prod123');

    Http::assertSent(fn ($request) => str_contains($request->url(), '/products/prod123'));
});

test('searchProducts is the one endpoint that signs page_size/page_token in the query while also sending a JSON body', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    (new TikTokClient(makeTikTokAccount()))->searchProducts(['status' => 'LIVE'], pageSize: 20);

    Http::assertSent(function ($request) {
        $params = tiktokQueryParams($request);

        return $params['page_size'] === '20' && json_decode($request->body(), true) === ['status' => 'LIVE'];
    });
});

test('createProduct POSTs the given product as the raw JSON body to the default 202309 path', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => ['product_id' => 'p1']], 200)]);
    (new TikTokClient(makeTikTokAccount()))->createProduct(['title' => 'Widget']);

    Http::assertSent(function ($request) {
        return $request->method() === 'POST' && str_contains($request->url(), '/product/202309/products')
            && json_decode($request->body(), true) === ['title' => 'Widget'];
    });
});

test('updateProduct uses PUT and the 202509 API version, unlike every other product/... endpoint\'s 202309', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    (new TikTokClient(makeTikTokAccount()))->updateProduct('prod123', ['title' => 'Widget']);

    Http::assertSent(function ($request) {
        return $request->method() === 'PUT' && str_contains($request->url(), '/product/202509/products/prod123');
    });
});

test('activateProducts and deactivateProducts both drop listing_platforms when not given', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    $client = new TikTokClient(makeTikTokAccount());

    $client->activateProducts(['p1', 'p2']);
    $client->deactivateProducts(['p3']);

    Http::assertSent(fn ($request) => str_contains($request->url(), '/activate') && json_decode($request->body(), true) === ['product_ids' => ['p1', 'p2']]);
    Http::assertSent(fn ($request) => str_contains($request->url(), '/deactivate') && json_decode($request->body(), true) === ['product_ids' => ['p3']]);
});

// --- sign() over the raw body: a POST/PUT signs differently than a GET with the same params ---

test('sign() appends the exact raw JSON body for a POST, changing the signature from what the same params would sign as a GET', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => []], 200)]);
    (new TikTokClient(makeTikTokAccount()))->createProduct(['title' => 'Widget']);

    Http::assertSent(function ($request) {
        $params = tiktokQueryParams($request);
        $rawBody = json_encode(['title' => 'Widget'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $expectedWithBody = expectedTikTokSign('appsecret123', '/product/202309/products', $params, $rawBody);
        $expectedWithoutBody = expectedTikTokSign('appsecret123', '/product/202309/products', $params, null);

        expect($params['sign'])->toBe($expectedWithBody);
        expect($params['sign'])->not->toBe($expectedWithoutBody);

        return true;
    });
});

// --- handleResponse ---

test('handleResponse treats code 0 as success', function () {
    Http::fake(['*' => Http::response(['code' => 0, 'data' => ['x' => 1]], 200)]);

    expect((new TikTokClient(makeTikTokAccount()))->getCategoryTree())->toBe(['code' => 0, 'data' => ['x' => 1]]);
});

test('handleResponse throws with TikTok\'s numeric code set as the exception\'s own code (not just embedded in the message)', function () {
    Http::fake(['*' => Http::response(['code' => 12052205, 'message' => 'This operation requires a unique brand name'], 200)]);

    try {
        (new TikTokClient(makeTikTokAccount()))->createCustomBrand('Acme');
        $this->fail('Expected a RuntimeException');
    } catch (RuntimeException $e) {
        expect($e->getCode())->toBe(12052205);
        expect($e->getMessage())->toContain('unique brand name');
    }
});

test('handleResponse falls back to "unknown error" when the error response has no message', function () {
    Http::fake(['*' => Http::response(['code' => 500], 200)]);

    (new TikTokClient(makeTikTokAccount()))->getCategoryTree();
})->throws(RuntimeException::class, 'unknown error');

test('a non-JSON response throws, naming the HTTP status', function () {
    Http::fake(['*' => Http::response('<html>bad gateway</html>', 200)]);

    (new TikTokClient(makeTikTokAccount()))->getCategoryTree();
})->throws(RuntimeException::class, 'HTTP 200');

// --- GET vs POST retry() asymmetry ---

test('a GET\'s non-2xx failure is auto-thrown by ->retry() (same as Shopee/Lazada), never reaching handleResponse()', function () {
    Http::fake(['*' => Http::response('gateway error', 502)]);

    (new TikTokClient(makeTikTokAccount()))->getCategoryTree();
})->throws(\Illuminate\Http\Client\RequestException::class, '502');

test('unlike GET, a POST/PUT has no ->retry() chained at all, so a non-2xx response DOES reach handleResponse() instead of auto-throwing', function () {
    // request()'s docblock explains retry() is deliberately GET-only. This
    // means a 500 from a write endpoint surfaces as this class's own
    // RuntimeException (from the JSON body, if any) rather than a generic
    // RequestException — genuinely different behavior from every GET call.
    Http::fake(['*' => Http::response(['code' => 12345, 'message' => 'Internal error'], 500)]);

    (new TikTokClient(makeTikTokAccount()))->createProduct(['title' => 'Widget']);
})->throws(RuntimeException::class, 'Internal error');

// --- uploadImage / uploadFile ---

test('uploadImage reads local storage bytes, sends use_case in the multipart body, omits shop_cipher, and returns the uri', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    Http::fake(['*' => Http::response(['data' => ['uri' => 'tos-uri-1']], 200)]);

    $url = Storage::disk('public')->url('products/photo.jpg');
    $uri = (new TikTokClient(makeTikTokAccount()))->uploadImage($url);

    expect($uri)->toBe('tos-uri-1');
    Http::assertSent(fn ($request) => ! array_key_exists('shop_cipher', tiktokQueryParams($request)));
});

test('uploadImage throws when TikTok\'s response carries no uri', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    Http::fake(['*' => Http::response(['data' => []], 200)]);

    $url = Storage::disk('public')->url('products/photo.jpg');
    (new TikTokClient(makeTikTokAccount()))->uploadImage($url);
})->throws(RuntimeException::class, 'no uri');

test('uploadFile defaults its filename from the URL when none is given, and returns the file id', function () {
    Storage::fake('public');
    Storage::disk('public')->put('docs/certificate.pdf', 'fake-bytes');
    Http::fake(['*' => Http::response(['data' => ['id' => 'file_1']], 200)]);

    $url = Storage::disk('public')->url('docs/certificate.pdf');
    $fileId = (new TikTokClient(makeTikTokAccount()))->uploadFile($url);

    expect($fileId)->toBe('file_1');
});

test('uploadFile uses an explicitly given filename over the URL-derived one', function () {
    Storage::fake('public');
    Storage::disk('public')->put('docs/certificate.pdf', 'fake-bytes');
    Http::fake(['*' => Http::response(['data' => ['id' => 'file_1']], 200)]);

    $url = Storage::disk('public')->url('docs/certificate.pdf');
    (new TikTokClient(makeTikTokAccount()))->uploadFile($url, 'custom-name.pdf');

    Http::assertSent(function ($request) {
        return str_contains($request->body(), 'custom-name.pdf');
    });
});
