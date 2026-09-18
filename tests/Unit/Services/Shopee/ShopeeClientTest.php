<?php

use App\Models\ShopeeSellerAccount;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

/**
 * ShopeeSellerAccount is read-only (n8n owns it — see the model's own
 * docblock; ::create()/save() throw) and lives on a separate 'n8n'
 * connection anyway, so it's never persisted here — just constructed
 * in-memory with the 4 fields ShopeeClient actually reads.
 */
function makeShopeeAccount(array $overrides = []): ShopeeSellerAccount
{
    $account = new ShopeeSellerAccount();
    foreach (array_merge([
        'shop_id' => 'shop123',
        'partner_id' => 'partner123',
        'access_token' => 'token123',
        'partner_key' => 'secretkey',
    ], $overrides) as $key => $value) {
        $account->{$key} = $value;
    }

    return $account;
}

function shopeeQueryParams(\Illuminate\Http\Client\Request $request): array
{
    parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $params);

    return $params;
}

function expectedShopeeSign(ShopeeSellerAccount $account, string $apiPath, string $timestamp): string
{
    $base = $account->partner_id.$apiPath.$timestamp.$account->access_token.$account->shop_id;

    return hash_hmac('sha256', $base, $account->partner_key);
}

beforeEach(function () {
    config(['services.shopee.base_url' => 'https://partner.shopeemobile.com']);
});

test('every request carries a correctly HMAC-signed set of common params', function () {
    Http::fake(['*' => Http::response(['response' => []], 200)]);
    $account = makeShopeeAccount();
    $client = new ShopeeClient($account);

    $client->getCategoryTree();

    Http::assertSent(function ($request) use ($account) {
        $params = shopeeQueryParams($request);
        expect($params['partner_id'])->toBe('partner123');
        expect($params['access_token'])->toBe('token123');
        expect($params['shop_id'])->toBe('shop123');
        expect($params['sign'])->toBe(expectedShopeeSign($account, '/api/v2/product/get_category', $params['timestamp']));

        return true;
    });
});

test('getCategoryTree sends the language param and hits the correct path', function () {
    Http::fake(['*' => Http::response(['response' => ['category_list' => []]], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $result = $client->getCategoryTree('th');

    expect($result)->toBe(['response' => ['category_list' => []]]);
    Http::assertSent(function ($request) {
        return str_contains($request->url(), '/api/v2/product/get_category')
            && shopeeQueryParams($request)['language'] === 'th';
    });
});

test('getAttributeTree joins category ids with commas', function () {
    Http::fake(['*' => Http::response(['response' => []], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getAttributeTree([1, 2, 3]);

    Http::assertSent(fn ($request) => shopeeQueryParams($request)['category_id_list'] === '1,2,3');
});

test('getCategoryRecommend sends item_name to the category_recommend path (not get_category_recommend)', function () {
    Http::fake(['*' => Http::response(['response' => ['category_id' => [1]]], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getCategoryRecommend('Widget');

    Http::assertSent(function ($request) {
        return str_contains($request->url(), '/api/v2/product/category_recommend')
            && shopeeQueryParams($request)['item_name'] === 'Widget';
    });
});

test('getBrandList always sends status=1 alongside the given category/offset/page_size', function () {
    Http::fake(['*' => Http::response(['response' => []], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getBrandList(100, offset: 42, pageSize: 20);

    Http::assertSent(function ($request) {
        $params = shopeeQueryParams($request);

        return $params['category_id'] === '100' && $params['offset'] === '42'
            && $params['page_size'] === '20' && $params['status'] === '1';
    });
});

test('getItemBaseInfo joins item ids with commas', function () {
    Http::fake(['*' => Http::response(['response' => []], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getItemBaseInfo([111, 222]);

    Http::assertSent(fn ($request) => shopeeQueryParams($request)['item_id_list'] === '111,222');
});

test('getItemList defaults offset/page_size/item_status and allows overriding them', function () {
    Http::fake(['*' => Http::response(['response' => []], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getItemList();

    Http::assertSent(function ($request) {
        $params = shopeeQueryParams($request);

        return $params['offset'] === '0' && $params['page_size'] === '50' && $params['item_status'] === 'NORMAL';
    });
});

// --- write paths: request shape only, no real API caveats to test here ---

test('addItem POSTs the given payload as the JSON body to add_item', function () {
    Http::fake(['*' => Http::response(['response' => ['item_id' => 1]], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->addItem(['item_name' => 'Widget']);

    Http::assertSent(function ($request) {
        return $request->method() === 'POST'
            && str_contains($request->url(), '/api/v2/product/add_item')
            && $request->data() === ['item_name' => 'Widget'];
    });
});

test('unlistItem wraps the item id into Shopee\'s item_list/unlist shape', function () {
    Http::fake(['*' => Http::response(['response' => []], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->unlistItem(555);

    Http::assertSent(function ($request) {
        return $request->data() === ['item_list' => [['item_id' => 555, 'unlist' => true]]];
    });
});

test('deleteItem POSTs the item id to delete_item', function () {
    Http::fake(['*' => Http::response(['response' => []], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->deleteItem(555);

    Http::assertSent(function ($request) {
        return str_contains($request->url(), '/api/v2/product/delete_item') && $request->data() === ['item_id' => 555];
    });
});

// --- error handling ---

test('a genuine non-2xx HTTP failure is thrown by ->retry() itself as a RequestException, never reaching handleResponse()\'s own non-JSON check', function () {
    // Documents actual (verified) behavior, contradicting this codebase's
    // own comment on ShopeeClient::request() ("retry() only fires on
    // connection-level failures ... a real Shopee error is never blindly
    // retried"). Laravel's PendingRequest::retry($times, $sleep) defaults
    // $throw=true, and with $times>1 it calls $response->throw() itself
    // once retries are exhausted for ANY non-2xx status — see
    // PendingRequest.php:1080-1081. So handleResponse()'s "non-JSON
    // response (HTTP {status})" message is reachable only for a 2xx
    // response with a non-JSON body; a true outage (5xx/4xx) throws
    // Illuminate\Http\Client\RequestException first, with Laravel's own
    // generic message instead of this class's more specific one.
    Http::fake(['*' => Http::response('<html>not json</html>', 502)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getCategoryTree();
})->throws(\Illuminate\Http\Client\RequestException::class, '502');

test('a non-JSON 2xx response does reach handleResponse() and throws its own descriptive error', function () {
    Http::fake(['*' => Http::response('<html>not json</html>', 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getCategoryTree();
})->throws(RuntimeException::class, 'HTTP 200');

test('an error response prefers "msg" over "message" (regression: msg used to be ignored)', function () {
    Http::fake(['*' => Http::response(['error' => 'error_auth', 'msg' => 'No permission', 'message' => 'Generic'], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getCategoryTree();
})->throws(RuntimeException::class, 'No permission');

test('an error response with only "message" (no msg) falls back to it', function () {
    Http::fake(['*' => Http::response(['error' => 'error_auth', 'message' => 'Generic error'], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getCategoryTree();
})->throws(RuntimeException::class, 'Generic error');

test('an error response with neither msg nor message falls back to "unknown error"', function () {
    Http::fake(['*' => Http::response(['error' => 'error_auth'], 200)]);
    $client = new ShopeeClient(makeShopeeAccount());

    $client->getCategoryTree();
})->throws(RuntimeException::class, 'unknown error');

// --- uploadImage ---

test('uploadImage reads bytes straight off local disk for a URL pointing at our own public storage, and returns the image_id', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-image-bytes');
    Http::fake(['*' => Http::response(['response' => ['image_info' => ['image_id' => 'img_1']]], 200)]);

    $client = new ShopeeClient(makeShopeeAccount());
    $url = Storage::disk('public')->url('products/photo.jpg');

    $imageId = $client->uploadImage($url);

    expect($imageId)->toBe('img_1');
    Http::assertSent(fn ($request) => str_contains($request->url(), '/api/v2/media_space/upload_image'));
});

test('uploadImage fetches over HTTP for a non-local (external) URL', function () {
    Http::fake([
        'https://cdn.example.com/*' => Http::response('external-bytes', 200),
        '*/media_space/upload_image*' => Http::response(['response' => ['image_info' => ['image_id' => 'img_2']]], 200),
    ]);

    $imageId = (new ShopeeClient(makeShopeeAccount()))->uploadImage('https://cdn.example.com/photo.jpg');

    expect($imageId)->toBe('img_2');
    Http::assertSent(fn ($request) => str_contains($request->url(), 'cdn.example.com'));
});

test('uploadImage throws when the image bytes can\'t be read at all', function () {
    // A 2xx-but-empty body, not a 404 — a non-2xx here would itself throw a
    // RequestException from ->retry()'s own default $throw=true (see the
    // dedicated test above documenting that), never reaching this class's
    // own "Could not read image" check at all.
    Http::fake(['*' => Http::response('', 200)]);

    (new ShopeeClient(makeShopeeAccount()))->uploadImage('https://cdn.example.com/missing.jpg');
})->throws(RuntimeException::class, 'Could not read image');

test('uploadImage throws when Shopee\'s response carries no image_id', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    Http::fake(['*' => Http::response(['response' => []], 200)]);

    $url = Storage::disk('public')->url('products/photo.jpg');
    (new ShopeeClient(makeShopeeAccount()))->uploadImage($url);
})->throws(RuntimeException::class, 'no image_id');

// --- uploadVideo ---

test('uploadVideo chains init -> per-part upload -> complete -> poll, and returns the video_upload_id once SUCCEEDED', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 30));
    $url = Storage::disk('public')->url('products/clip.mp4');

    Http::fake([
        '*/init_video_upload*' => Http::response(['response' => ['video_upload_id' => 'vid_1', 'part_size' => 10]], 200),
        '*/upload_video_part*' => Http::response(['response' => []], 200),
        '*/complete_video_upload*' => Http::response(['response' => []], 200),
        '*/get_video_upload_result*' => Http::response(['response' => ['status' => 'SUCCEEDED']], 200),
    ]);

    $videoUploadId = (new ShopeeClient(makeShopeeAccount()))->uploadVideo($url);

    expect($videoUploadId)->toBe('vid_1');
    // 30 bytes at part_size=10 -> exactly 3 parts.
    Http::assertSentCount(1 + 3 + 1 + 1); // init + 3 parts + complete + 1 poll
});

test('uploadVideo splits the file into exactly part_size-sized chunks per init\'s returned part_size', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 25)); // not an exact multiple of 10
    $url = Storage::disk('public')->url('products/clip.mp4');

    Http::fake([
        '*/init_video_upload*' => Http::response(['response' => ['video_upload_id' => 'vid_1', 'part_size' => 10]], 200),
        '*/upload_video_part*' => Http::response(['response' => []], 200),
        '*/complete_video_upload*' => Http::response(['response' => []], 200),
        '*/get_video_upload_result*' => Http::response(['response' => ['status' => 'SUCCEEDED']], 200),
    ]);

    (new ShopeeClient(makeShopeeAccount()))->uploadVideo($url);

    $partSeqs = [];
    Http::assertSent(function ($request) use (&$partSeqs) {
        if (str_contains($request->url(), '/upload_video_part')) {
            $partSeqs[] = shopeeQueryParams($request)['part_seq'];
        }

        return true;
    });
    expect($partSeqs)->toBe(['0', '1', '2']); // 25 bytes / 10 = 3 chunks (10, 10, 5)
});

test('uploadVideo throws immediately if Shopee reports the transcode FAILED', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/clip.mp4', str_repeat('x', 5));
    $url = Storage::disk('public')->url('products/clip.mp4');

    Http::fake([
        '*/init_video_upload*' => Http::response(['response' => ['video_upload_id' => 'vid_1', 'part_size' => 10]], 200),
        '*/upload_video_part*' => Http::response(['response' => []], 200),
        '*/complete_video_upload*' => Http::response(['response' => []], 200),
        '*/get_video_upload_result*' => Http::response(['response' => ['status' => 'FAILED']], 200),
    ]);

    (new ShopeeClient(makeShopeeAccount()))->uploadVideo($url);
})->throws(RuntimeException::class, 'transcoding failed');
