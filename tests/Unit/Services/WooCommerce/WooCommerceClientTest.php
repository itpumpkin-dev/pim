<?php

use App\Services\WooCommerce\WooCommerceApiException;
use App\Services\WooCommerce\WooCommerceClient;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

uses(Tests\TestCase::class);

beforeEach(function () {
    config([
        'services.woocommerce.url' => 'https://shop.example.com',
        'services.woocommerce.consumer_key' => 'ck_123',
        'services.woocommerce.consumer_secret' => 'cs_123',
        'services.woocommerce.wp_username' => 'wpuser',
        'services.woocommerce.wp_app_password' => 'wppass',
    ]);
});

test('the constructor throws a clear error when url/consumer_key/consumer_secret are not configured', function () {
    config(['services.woocommerce.url' => null]);

    new WooCommerceClient();
})->throws(RuntimeException::class, 'not configured');

test('every request uses HTTP Basic Auth with the WooCommerce consumer key/secret', function () {
    Http::fake(['*' => Http::response([], 200)]);
    (new WooCommerceClient())->getCategories();

    Http::assertSent(function ($request) {
        return $request->hasHeader('Authorization', 'Basic '.base64_encode('ck_123:cs_123'));
    });
});

test('findProductBySku filters by the exact sku and returns the first match', function () {
    Http::fake(['*' => Http::response([['id' => 1, 'sku' => 'SKU-1']], 200)]);

    $product = (new WooCommerceClient())->findProductBySku('SKU-1');

    expect($product)->toBe(['id' => 1, 'sku' => 'SKU-1']);
    Http::assertSent(fn ($request) => str_contains($request->url(), '/products') && $request['sku'] === 'SKU-1');
});

test('findProductBySku returns null when nothing matches', function () {
    Http::fake(['*' => Http::response([], 200)]);

    expect((new WooCommerceClient())->findProductBySku('NO-SUCH-SKU'))->toBeNull();
});

test('getProduct returns null (swallowing the exception) instead of throwing when the lookup fails, e.g. a 404', function () {
    Http::fake(['*' => Http::response(['message' => 'Not found', 'code' => 'woocommerce_rest_product_invalid_id'], 404)]);

    expect((new WooCommerceClient())->getProduct(999))->toBeNull();
});

test('getProduct returns the decoded product on success', function () {
    Http::fake(['*' => Http::response(['id' => 5, 'name' => 'Widget'], 200)]);

    expect((new WooCommerceClient())->getProduct(5))->toBe(['id' => 5, 'name' => 'Widget']);
});

test('createProduct POSTs the payload to /products', function () {
    Http::fake(['*' => Http::response(['id' => 1], 200)]);
    (new WooCommerceClient())->createProduct(['name' => 'Widget']);

    Http::assertSent(fn ($request) => $request->method() === 'POST' && str_contains($request->url(), '/products') && $request['name'] === 'Widget');
});

test('updateProduct PUTs the payload to /products/{id}', function () {
    Http::fake(['*' => Http::response(['id' => 5], 200)]);
    (new WooCommerceClient())->updateProduct(5, ['status' => 'draft']);

    Http::assertSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/products/5') && $request['status'] === 'draft');
});

test('getCategories/getBrands/getAttributes each send page/per_page to their own endpoint', function () {
    Http::fake(['*' => Http::response([], 200)]);
    $client = new WooCommerceClient();

    $client->getCategories(2, 50);
    $client->getBrands(3, 25);
    $client->getAttributes();

    Http::assertSent(fn ($request) => str_contains($request->url(), '/products/categories') && $request['page'] === 2 && $request['per_page'] === 50);
    Http::assertSent(fn ($request) => str_contains($request->url(), '/products/brands') && $request['page'] === 3 && $request['per_page'] === 25);
    Http::assertSent(fn ($request) => str_contains($request->url(), '/products/attributes') && $request['page'] === 1 && $request['per_page'] === 100);
});

// --- error handling: request() correctly uses throw:false, unlike Shopee/Lazada/TikTok ---

test('a real 4xx/5xx response DOES reach handleResponse() and throws a WooCommerceApiException carrying the error code/data (request() correctly passes throw:false)', function () {
    Http::fake(['*' => Http::response(['message' => 'Invalid SKU', 'code' => 'product_invalid_sku', 'data' => ['status' => 400]], 400)]);

    try {
        (new WooCommerceClient())->createProduct(['sku' => 'DUP']);
        $this->fail('Expected a WooCommerceApiException');
    } catch (WooCommerceApiException $e) {
        expect($e->getMessage())->toContain('[400]', 'Invalid SKU');
        expect($e->apiErrorCode)->toBe('product_invalid_sku');
        expect($e->errorData)->toBe(['status' => 400]);
    }
});

test('a non-JSON response throws, naming the method/path/HTTP status', function () {
    Http::fake(['*' => Http::response('<html>bad gateway</html>', 502)]);

    (new WooCommerceClient())->getCategories();
})->throws(RuntimeException::class, 'GET /products/categories');

test('a genuine connection-level style failure does not get wrapped as a generic RequestException, unlike Shopee/Lazada/TikTok\'s GET (request() passes throw:false)', function () {
    Http::fake(['*' => Http::response('gateway error', 502)]);

    (new WooCommerceClient())->getCategories();
})->throws(RuntimeException::class); // WooCommerceApiException specifically, not Illuminate\Http\Client\RequestException

// --- uploadMedia ---

test('uploadMedia throws a clear error when WordPress credentials are not configured, without needing the WooCommerce ones', function () {
    config(['services.woocommerce.wp_username' => null]);

    (new WooCommerceClient())->uploadMedia('https://cdn/photo.jpg');
})->throws(RuntimeException::class, 'not configured');

test('uploadMedia uses the WordPress Application Password (not the WooCommerce consumer key) for Basic Auth', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    Http::fake(['*' => Http::response(['id' => 1, 'source_url' => 'https://cdn/uploaded.jpg'], 200)]);

    $url = Storage::disk('public')->url('products/photo.jpg');
    (new WooCommerceClient())->uploadMedia($url);

    Http::assertSent(function ($request) {
        return $request->hasHeader('Authorization', 'Basic '.base64_encode('wpuser:wppass'))
            && str_contains($request->url(), '/wp-json/wp/v2/media');
    });
});

test('uploadMedia sends the Content-Disposition header with the derived filename and the raw bytes as the body', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-image-bytes');
    Http::fake(['*' => Http::response(['id' => 1], 200)]);

    $url = Storage::disk('public')->url('products/photo.jpg');
    (new WooCommerceClient())->uploadMedia($url);

    Http::assertSent(function ($request) {
        return $request->hasHeader('Content-Disposition', 'attachment; filename="photo.jpg"')
            && $request->body() === 'fake-image-bytes';
    });
});

test('uploadMedia throws when no bytes could be read at all', function () {
    Http::fake(['*' => Http::response('', 200)]);

    (new WooCommerceClient())->uploadMedia('https://cdn.example.com/missing.jpg');
})->throws(RuntimeException::class, 'Could not read image');

test('a non-2xx failure fetching a remote (non-local) image IS auto-thrown by ->retry() here (no throw:false on this particular call, unlike request())', function () {
    // uploadMedia()'s own inline remote-fetch retry() call doesn't pass
    // throw:false the way request() deliberately does — an asymmetry within
    // this same class, discovered by testing it directly.
    Http::fake(['*' => Http::response('not found', 404)]);

    (new WooCommerceClient())->uploadMedia('https://cdn.example.com/missing.jpg');
})->throws(\Illuminate\Http\Client\RequestException::class, '404');
