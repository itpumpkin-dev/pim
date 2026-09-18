<?php

use App\Models\LazadaSellerAccount;
use App\Services\Lazada\LazadaClient;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/** LazadaSellerAccount is read-only (n8n owns it) and on a separate 'n8n' connection — never persisted, just built in-memory. */
function makeLazadaAccount(array $overrides = []): LazadaSellerAccount
{
    $account = new LazadaSellerAccount();
    foreach (array_merge([
        'app_key' => 'appkey123',
        'app_secret' => 'appsecret123',
        'access_token' => 'token123',
    ], $overrides) as $key => $value) {
        $account->{$key} = $value;
    }

    return $account;
}

/** @return array<string,string> form/query params of a Request, whichever it used */
function lazadaRequestParams(\Illuminate\Http\Client\Request $request): array
{
    if ($request->hasHeader('Content-Type', 'application/x-www-form-urlencoded')) {
        parse_str((string) $request->body(), $params);

        return $params;
    }

    parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $params);

    return $params;
}

function expectedLazadaSign(LazadaSellerAccount $account, string $apiPath, array $params): string
{
    ksort($params);
    $base = $apiPath;
    foreach ($params as $key => $value) {
        $base .= $key.$value;
    }

    return strtoupper(hash_hmac('sha256', $base, $account->app_secret));
}

beforeEach(function () {
    config(['services.lazada.base_url' => 'https://api.lazada.co.th/rest']);
});

test('every request carries a correctly HMAC-signed set of common params', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    $account = makeLazadaAccount();
    $client = new LazadaClient($account);

    $client->getCategoryTree();

    Http::assertSent(function ($request) use ($account) {
        $params = lazadaRequestParams($request);
        expect($params['app_key'])->toBe('appkey123');
        expect($params['sign_method'])->toBe('sha256');

        $expectedParams = $params;
        unset($expectedParams['sign']);
        expect($params['sign'])->toBe(expectedLazadaSign($account, '/category/tree/get', $expectedParams));

        return true;
    });
});

test('getCategoryTree ("system tools") is called without an access_token', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    (new LazadaClient(makeLazadaAccount()))->getCategoryTree();

    Http::assertSent(function ($request) {
        return str_contains($request->url(), '/category/tree/get') && ! array_key_exists('access_token', lazadaRequestParams($request));
    });
});

test('getCategoryAttributes sends primary_category_id, no access_token', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    (new LazadaClient(makeLazadaAccount()))->getCategoryAttributes(123);

    Http::assertSent(function ($request) {
        $params = lazadaRequestParams($request);

        return $params['primary_category_id'] === '123' && ! array_key_exists('access_token', $params);
    });
});

test('queryBrands defaults startRow/pageSize and has no access_token', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    (new LazadaClient(makeLazadaAccount()))->queryBrands();

    Http::assertSent(function ($request) {
        $params = lazadaRequestParams($request);

        return $params['startRow'] === '0' && $params['pageSize'] === '40' && ! array_key_exists('access_token', $params);
    });
});

test('getCategorySuggestion requires an access_token, unlike the category/brand "system tools" endpoints', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    (new LazadaClient(makeLazadaAccount()))->getCategorySuggestion('Widget', 'https://cdn/x.jpg');

    Http::assertSent(function ($request) {
        $params = lazadaRequestParams($request);

        return $params['product_name'] === 'Widget' && $params['image_url'] === 'https://cdn/x.jpg' && $params['access_token'] === 'token123';
    });
});

test('getLiveProducts filters by live status with the given offset/limit', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    (new LazadaClient(makeLazadaAccount()))->getLiveProducts(20, 10);

    Http::assertSent(function ($request) {
        $params = lazadaRequestParams($request);

        return $params['filter'] === 'live' && $params['offset'] === '20' && $params['limit'] === '10';
    });
});

test('findProductBySku filters by "all" status (not "live", which would hide inactive items) and JSON-encodes the sku list', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    (new LazadaClient(makeLazadaAccount()))->findProductBySku('SKU-1');

    Http::assertSent(function ($request) {
        $params = lazadaRequestParams($request);

        return $params['filter'] === 'all' && $params['sku_seller_list'] === json_encode(['SKU-1']);
    });
});

test('getProductItem sends the given item_id', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    (new LazadaClient(makeLazadaAccount()))->getProductItem(999);

    Http::assertSent(fn ($request) => lazadaRequestParams($request)['item_id'] === '999');
});

// --- createProduct / updateProduct / buildProductPayload ---

test('createProduct builds a JSON payload with PrimaryCategory/Attributes/Skus, casting every value to string, and omits ItemId/Images when absent', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    $client = new LazadaClient(makeLazadaAccount());

    $client->createProduct([
        'primary_category_id' => 100,
        'attributes' => ['name' => 'Widget', 'brand' => 'Acme'],
        'skus' => [
            ['SellerSku' => 'SKU-1', 'price' => 199, 'quantity' => 10],
        ],
    ]);

    Http::assertSent(function ($request) {
        $payload = json_decode(lazadaRequestParams($request)['payload'], true);

        expect($payload)->toBe([
            'Request' => [
                'Product' => [
                    'PrimaryCategory' => '100',
                    'Attributes' => ['name' => 'Widget', 'brand' => 'Acme'],
                    'Skus' => ['Sku' => [
                        ['SellerSku' => 'SKU-1', 'price' => '199', 'quantity' => '10'],
                    ]],
                ],
            ],
        ]);
        expect($payload['Request']['Product'])->not->toHaveKey('ItemId');
        expect($payload['Request']['Product'])->not->toHaveKey('Images');

        return true;
    });
});

test('updateProduct includes ItemId and each sku\'s SkuId when the product carries them', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    $client = new LazadaClient(makeLazadaAccount());

    $client->updateProduct([
        'primary_category_id' => 100,
        'item_id' => 5555,
        'attributes' => ['name' => 'Widget'],
        'skus' => [['SkuId' => 7777, 'SellerSku' => 'SKU-1']],
    ]);

    Http::assertSent(function ($request) {
        $payload = json_decode(lazadaRequestParams($request)['payload'], true);

        return $payload['Request']['Product']['ItemId'] === '5555'
            && $payload['Request']['Product']['Skus']['Sku'][0]['SkuId'] === '7777';
    });
});

test('buildProductPayload nests a product-level Images list, and a sku\'s "images" key becomes its own Images/Image shape', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    $client = new LazadaClient(makeLazadaAccount());

    $client->createProduct([
        'primary_category_id' => 100,
        'attributes' => [],
        'images' => ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
        'skus' => [['SellerSku' => 'SKU-1', 'images' => ['https://cdn/sku-a.jpg']]],
    ]);

    Http::assertSent(function ($request) {
        $payload = json_decode(lazadaRequestParams($request)['payload'], true);
        $product = $payload['Request']['Product'];

        return $product['Images'] === ['Image' => ['https://cdn/a.jpg', 'https://cdn/b.jpg']]
            && $product['Skus']['Sku'][0]['Images'] === ['Image' => ['https://cdn/sku-a.jpg']];
    });
});

// --- deactivateProduct: XML, not JSON ---

test('deactivateProduct builds an XML apiRequestBody with the item/sku ids, HTML-escaped', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => []], 200)]);
    $client = new LazadaClient(makeLazadaAccount());

    $client->deactivateProduct(['item_id' => 111, 'sku_id' => 222, 'seller_sku' => 'SKU & Co']);

    Http::assertSent(function ($request) {
        $xml = simplexml_load_string(lazadaRequestParams($request)['apiRequestBody']);

        return (string) $xml->Product->ItemId === '111'
            && (string) $xml->Product->Skus->SkuId === '222'
            && (string) $xml->Product->Skus->SellerSku === 'SKU & Co'; // decoded back from &amp;
    });
});

// --- handleResponse (the standard JSON-envelope endpoints) ---

test('handleResponse treats code "0" as success and returns the decoded body', function () {
    Http::fake(['*' => Http::response(['code' => '0', 'data' => ['foo' => 'bar']], 200)]);

    $result = (new LazadaClient(makeLazadaAccount()))->getCategoryTree();

    expect($result)->toBe(['code' => '0', 'data' => ['foo' => 'bar']]);
});

test('handleResponse throws with the code and message for a non-"0" code', function () {
    Http::fake(['*' => Http::response(['code' => '500', 'message' => 'Create product failed'], 200)]);

    (new LazadaClient(makeLazadaAccount()))->getCategoryTree();
})->throws(RuntimeException::class, 'Lazada API error [500]: Create product failed');

test('handleResponse falls back to "unknown error" when the error response has no message', function () {
    Http::fake(['*' => Http::response(['code' => '500'], 200)]);

    (new LazadaClient(makeLazadaAccount()))->getCategoryTree();
})->throws(RuntimeException::class, 'unknown error');

test('a genuine non-2xx failure is thrown by ->retry() itself, never reaching handleResponse() (same as ShopeeClient)', function () {
    Http::fake(['*' => Http::response('gateway error', 502)]);

    (new LazadaClient(makeLazadaAccount()))->getCategoryTree();
})->throws(\Illuminate\Http\Client\RequestException::class, '502');

// --- handleMediaResponse (the Media Center endpoints: success:bool, not code) ---

test('uploadImage reads local storage bytes, uploads them, and returns the hosted Lazada URL', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    Http::fake(['*' => Http::response(['data' => ['image' => ['url' => 'https://lazada-cdn/photo.jpg']]], 200)]);

    $url = Storage::disk('public')->url('products/photo.jpg');
    $hostedUrl = (new LazadaClient(makeLazadaAccount()))->uploadImage($url);

    expect($hostedUrl)->toBe('https://lazada-cdn/photo.jpg');
});

test('uploadImage throws when Lazada\'s response carries no hosted url', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    Http::fake(['*' => Http::response(['data' => []], 200)]);

    $url = Storage::disk('public')->url('products/photo.jpg');
    (new LazadaClient(makeLazadaAccount()))->uploadImage($url);
})->throws(RuntimeException::class, 'no URL');

test('a Media Center response with code "0" but success:false is treated as a failure (regression: code alone used to look like success)', function () {
    // Specifically the 3 video/Media-Center calls (init/upload/complete) use
    // handleMediaResponse() (success:bool-based) — unlike uploadImage(),
    // which uses the ordinary code-based handleResponse(). This is the
    // exact real rejection the class's own docblock documents (a 9.98MB
    // single block: code stayed "0", only success:false revealed it).
    Storage::fake('public');
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 10));
    $url = Storage::disk('public')->url('products/clip.mp4');
    Http::fake(['*/media/video/block/create' => Http::response(
        ['code' => '0', 'success' => false, 'result_code' => 'ILLEGAL_PARAMETER', 'result_message' => 'file size is illegal'],
        200
    )]);

    (new LazadaClient(makeLazadaAccount()))->uploadVideo($url, 'https://lazada-cdn/cover.jpg');
})->throws(RuntimeException::class, 'file size is illegal');

test('a Media Center response with success as the string "true" is accepted the same as a real boolean', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 10));
    $url = Storage::disk('public')->url('products/clip.mp4');
    Http::fake([
        '*/media/video/block/create' => Http::response(['success' => 'true', 'upload_id' => 'up_1'], 200),
        '*/media/video/block/upload' => Http::response(['success' => 'true', 'e_tag' => 'etag_1'], 200),
        '*/media/video/block/commit' => Http::response(['success' => 'true', 'video_id' => 'vid_1'], 200),
    ]);

    expect((new LazadaClient(makeLazadaAccount()))->uploadVideo($url, 'https://lazada-cdn/cover.jpg'))->toBe('vid_1');
});

// --- uploadVideo: init -> block(s) -> complete, with the partNumber 0-vs-1-indexed regression ---

test('uploadVideo chains init -> block upload(s) -> complete, and returns the video_id', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 10));
    $url = Storage::disk('public')->url('products/clip.mp4');

    Http::fake([
        '*/media/video/block/create' => Http::response(['success' => true, 'upload_id' => 'up_1'], 200),
        '*/media/video/block/upload' => Http::response(['success' => true, 'e_tag' => 'etag_1'], 200),
        '*/media/video/block/commit' => Http::response(['success' => true, 'video_id' => 'vid_1'], 200),
    ]);

    $videoId = (new LazadaClient(makeLazadaAccount()))->uploadVideo($url, 'https://lazada-cdn/cover.jpg');

    expect($videoId)->toBe('vid_1');
});

test('uploadVideo splits into VIDEO_BLOCK_SIZE chunks and reports each part\'s partNumber as 1-indexed (blockNo + 1), even though blockNo itself stays 0-indexed', function () {
    Storage::fake('public');
    // 2 chunks: block size is 2,000,000 bytes, so 2,000,001 bytes -> blocks of 2,000,000 and 1.
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 2_000_001));
    $url = Storage::disk('public')->url('products/clip.mp4');

    Http::fake([
        '*/media/video/block/create' => Http::response(['success' => true, 'upload_id' => 'up_1'], 200),
        '*/media/video/block/upload' => Http::sequence()
            ->push(['success' => true, 'e_tag' => 'etag_0'], 200)
            ->push(['success' => true, 'e_tag' => 'etag_1'], 200),
        '*/media/video/block/commit' => Http::response(['success' => true, 'video_id' => 'vid_1'], 200),
    ]);

    (new LazadaClient(makeLazadaAccount()))->uploadVideo($url, 'https://lazada-cdn/cover.jpg');

    Http::assertSent(function ($request) {
        if (! str_contains($request->url(), '/media/video/block/commit')) {
            return true;
        }
        $parts = json_decode(lazadaRequestParams($request)['parts'], true);

        return $parts === [
            ['partNumber' => 1, 'eTag' => 'etag_0'],
            ['partNumber' => 2, 'eTag' => 'etag_1'],
        ];
    });
});

test('uploadVideo throws, naming the block, when a block\'s response carries no e_tag', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 10));
    $url = Storage::disk('public')->url('products/clip.mp4');

    Http::fake([
        '*/media/video/block/create' => Http::response(['success' => true, 'upload_id' => 'up_1'], 200),
        '*/media/video/block/upload' => Http::response(['success' => true], 200), // no e_tag
    ]);

    (new LazadaClient(makeLazadaAccount()))->uploadVideo($url, 'https://lazada-cdn/cover.jpg');
})->throws(RuntimeException::class, 'block 0/1');
