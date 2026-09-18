<?php

use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\WooCommerceAttributeMapping;
use App\Models\WooCommerceBrand;
use App\Models\WooCommerceCategory;
use App\Services\WooCommerce\WooCommerceApiException;
use App\Services\WooCommerce\WooCommerceClient;
use App\Services\WooCommerce\WooCommerceProductSyncService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

function wcProduct(array $attributes = []): Product
{
    return Product::create(array_merge(['sku' => 'SKU-'.uniqid()], $attributes));
}

function wcShop(): SalesPlatformShop
{
    $platform = SalesPlatform::create(['code' => 'woocommerce_'.uniqid(), 'name' => 'WooCommerce']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'My Shop']);
}

function wcMapField(string $targetField, string $attributeCode, string $type = 'text', ?int $woocommerceAttributeId = null): Attribute
{
    $attribute = Attribute::create(['code' => $attributeCode, 'type' => $type]);
    WooCommerceAttributeMapping::create([
        'attribute_id' => $attribute->id,
        'target_field' => $targetField,
        'woocommerce_attribute_id' => $woocommerceAttributeId,
        'sort_order' => 0,
    ]);

    return $attribute;
}

function wcSetValue(Product $product, Attribute $attribute, string $value): void
{
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => $value]);
}

/** name+price mapped and set — the two fields buildPayload() requires before anything else. */
function wcBasicProduct(): array
{
    $product = wcProduct();
    wcSetValue($product, wcMapField('name', 'pname'), 'Widget');
    wcSetValue($product, wcMapField('price', 'price_std'), '199');

    return [$product];
}

beforeEach(function () {
    $this->service = new WooCommerceProductSyncService(new WooCommerceClient());
    // FK targets for the woocommerce_category_id=555 / woocommerce_brand_id=999
    // overrides used throughout this file.
    WooCommerceCategory::create(['id' => 555, 'name' => 'Test Category']);
    WooCommerceBrand::create(['id' => 999, 'name' => 'Test Brand']);
    config([
        'services.woocommerce.url' => 'https://shop.example.com',
        'services.woocommerce.consumer_key' => 'ck',
        'services.woocommerce.consumer_secret' => 'cs',
        'services.woocommerce.wp_username' => 'wpuser',
        'services.woocommerce.wp_app_password' => 'wppass',
    ]);
});

// --- buildPayload ---

test('buildPayload throws when neither name nor price is mapped to any value', function () {
    $product = wcProduct();
    $shop = wcShop();

    $this->service->buildPayload($product, $shop);
})->throws(RuntimeException::class, 'missing a name or price');

test('buildPayload throws when the product has no category mapped to WooCommerce at all', function () {
    [$product] = wcBasicProduct();

    $this->service->buildPayload($product, wcShop());
})->throws(RuntimeException::class, 'no category mapped');

test('buildPayload uses the product\'s own woocommerce_category_id override when present', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555]);
    $product->update(['woocommerce_brand_id' => 999]); // sidestep the brand requirement for this test

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload['categories'])->toBe([['id' => 555]]);
});

test('buildPayload falls back to a category the product is assigned to that has a WooCommerce mapping', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_brand_id' => 999]);
    WooCommerceCategory::create(['id' => 777, 'name' => 'Another Category']);
    $category = Category::create(['code' => 'cat1', 'name' => 'Cat', 'woocommerce_category_id' => 777]);
    $product->categories()->attach($category->id);

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload['categories'])->toBe([['id' => 777]]);
});

test('buildPayload throws when the product has no brand mapped to WooCommerce', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555]);

    $this->service->buildPayload($product, wcShop());
})->throws(RuntimeException::class, 'no brand mapped');

test('buildPayload resolves the brand through pbrand -> Brand.woocommerce_brand_id when there is no per-product override', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555]);
    WooCommerceBrand::create(['id' => 42, 'name' => 'Acme Brand']);
    Brand::create(['code' => 'acme', 'name' => 'Acme', 'woocommerce_brand_id' => 42]);
    wcSetValue($product, Attribute::create(['code' => 'pbrand', 'type' => 'select']), 'acme');

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload['brands'])->toBe([['id' => 42]]);
});

test('buildPayload maps name/price/qty/weight/dimensions and includes a video meta_data entry when mapped', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    wcSetValue($product, wcMapField('qty', 'qty_attr'), '10');
    wcSetValue($product, wcMapField('weight', 'weight_attr'), '2.5');
    wcSetValue($product, wcMapField('length', 'length_attr'), '10');
    wcSetValue($product, wcMapField('video', 'video_attr'), 'https://youtube.com/x');

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload['name'])->toBe('Widget');
    expect($payload['regular_price'])->toBe('199');
    expect($payload['stock_quantity'])->toBe(10);
    expect($payload['weight'])->toBe('2.5');
    expect($payload['dimensions'])->toBe(['length' => '10']);
    expect($payload['meta_data'])->toBe([['key' => 'youtube_url', 'value' => 'https://youtube.com/x']]);
});

test('buildPayload omits dimensions entirely when none of length/width/height are mapped with a value', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload)->not->toHaveKey('dimensions');
});

test('buildContentFields composes every mapped description attribute into its own labeled HTML section, in sort_order, skipping ones with no value', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    $specs = Attribute::create(['code' => 'specs', 'type' => 'text', 'name' => 'Specifications']);
    WooCommerceAttributeMapping::create(['attribute_id' => $specs->id, 'target_field' => 'description', 'sort_order' => 0]);
    $unset = Attribute::create(['code' => 'warnings', 'type' => 'text', 'name' => 'Warnings']);
    WooCommerceAttributeMapping::create(['attribute_id' => $unset->id, 'target_field' => 'description', 'sort_order' => 1]);
    wcSetValue($product, $specs, 'Some spec text');

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload['description'])->toContain('data-attribute="specs"', 'Specifications', 'Some spec text');
    expect($payload['description'])->not->toContain('data-attribute="warnings"');
});

test('buildContentFields escapes a plain-text attribute\'s value but leaves a textarea attribute\'s HTML unescaped', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    $plain = Attribute::create(['code' => 'plain_field', 'type' => 'text', 'name' => 'Plain']);
    WooCommerceAttributeMapping::create(['attribute_id' => $plain->id, 'target_field' => 'short_description', 'sort_order' => 0]);
    $rich = Attribute::create(['code' => 'rich_field', 'type' => 'textarea', 'name' => 'Rich']);
    WooCommerceAttributeMapping::create(['attribute_id' => $rich->id, 'target_field' => 'short_description', 'sort_order' => 1]);
    wcSetValue($product, $plain, '<script>alert(1)</script>');
    wcSetValue($product, $rich, '<p>Real HTML</p>');

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload['short_description'])->toContain('&lt;script&gt;');
    expect($payload['short_description'])->toContain('<p>Real HTML</p>');
});

test('buildWooCommerceAttributes picks the first attribute with a value per woocommerce_attribute_id group', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    \App\Models\WooCommerceAttribute::create(['id' => 10, 'name' => 'Color', 'slug' => 'color', 'type' => 'select']);
    $first = Attribute::create(['code' => 'color_a', 'type' => 'text']);
    WooCommerceAttributeMapping::create(['attribute_id' => $first->id, 'target_field' => 'wc_attribute', 'woocommerce_attribute_id' => 10, 'sort_order' => 0]);
    $second = Attribute::create(['code' => 'color_b', 'type' => 'text']);
    WooCommerceAttributeMapping::create(['attribute_id' => $second->id, 'target_field' => 'wc_attribute', 'woocommerce_attribute_id' => 10, 'sort_order' => 1]);
    wcSetValue($product, $second, 'Blue'); // only the 2nd-priority mapping has a value

    $payload = $this->service->buildPayload($product, wcShop());

    expect($payload['attributes'])->toBe([['id' => 10, 'options' => ['Blue'], 'visible' => true, 'variation' => false]]);
});

// --- push / createOrRecoverProduct / deactivate / checkLiveStatus ---

test('push creates a new product when none exists yet on WooCommerce, and caches the resulting status', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    $shop = wcShop();

    Http::fake([
        '*/products?sku=*' => Http::response([], 200), // findProductBySku: not found
        '*/products' => Http::response(['id' => 123, 'status' => 'publish'], 200),
    ]);

    $result = $this->service->push($product, $shop);

    expect($result['id'])->toBe(123);
    Http::assertSent(fn ($request) => $request->method() === 'POST' && str_contains($request->url(), '/products'));

    $cached = DB::table('product_platform_shops')->where('product_id', $product->id)->where('sales_platform_shop_id', $shop->id)->first();
    expect($cached->status)->toBe('live');
    expect($cached->platform_item_id)->toBe('123');
});

test('push updates the existing product when WooCommerce already has one with this SKU', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    $shop = wcShop();

    Http::fake([
        '*/products?sku=*' => Http::response([['id' => 999, 'sku' => $product->sku]], 200),
        '*/products/999' => Http::response(['id' => 999, 'status' => 'publish'], 200),
    ]);

    $this->service->push($product, $shop);

    Http::assertSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/products/999'));
});

test('push uploads each image via uploadMedia and swaps the src URL for the returned attachment id', function () {
    \Illuminate\Support\Facades\Storage::fake('public');
    \Illuminate\Support\Facades\Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    $imageUrl = \Illuminate\Support\Facades\Storage::disk('public')->url('products/photo.jpg');
    wcSetValue($product, wcMapField('image', 'image_attr'), $imageUrl);
    $shop = wcShop();

    Http::fake([
        '*/products?sku=*' => Http::response([], 200),
        '*/wp-json/wp/v2/media' => Http::response(['id' => 777], 200),
        '*/products' => Http::response(['id' => 123, 'status' => 'publish'], 200),
    ]);

    $this->service->push($product, $shop);

    Http::assertSent(function ($request) {
        if (! str_contains($request->url(), '/products') || $request->method() !== 'POST' || str_contains($request->url(), 'media')) {
            return true;
        }
        $body = json_decode($request->body(), true);

        return $body['images'] === [['id' => 777]];
    });
});

test('createOrRecoverProduct falls back to updating the resource WooCommerce names on a product_invalid_sku error', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    $shop = wcShop();

    Http::fake([
        '*/products?sku=*' => Http::response([], 200), // findProductBySku: not found -> tries create
        '*/products' => Http::response(['code' => 'product_invalid_sku', 'message' => 'Invalid SKU', 'data' => ['resource_id' => 888]], 400),
        '*/products/888' => Http::response(['id' => 888, 'status' => 'publish'], 200),
    ]);

    $result = $this->service->push($product, $shop);

    expect($result['id'])->toBe(888);
    Http::assertSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/products/888'));
});

test('createOrRecoverProduct re-throws any other API error (no resource_id, or a different code) instead of swallowing it', function () {
    [$product] = wcBasicProduct();
    $product->update(['woocommerce_category_id' => 555, 'woocommerce_brand_id' => 999]);
    $shop = wcShop();

    Http::fake([
        '*/products?sku=*' => Http::response([], 200),
        '*/products' => Http::response(['code' => 'product_invalid_sku', 'message' => 'Invalid SKU', 'data' => []], 400), // no resource_id
    ]);

    $this->service->push($product, $shop);
})->throws(WooCommerceApiException::class, 'Invalid SKU');

test('deactivate throws when the product was never pushed to this shop (WooCommerce has no matching SKU)', function () {
    $product = wcProduct();
    $shop = wcShop();
    Http::fake(['*/products?sku=*' => Http::response([], 200)]);

    $this->service->deactivate($product, $shop);
})->throws(RuntimeException::class, 'nothing to deactivate');

test('deactivate sets the existing product to draft status and updates the cache', function () {
    $product = wcProduct();
    $shop = wcShop();
    Http::fake([
        '*/products?sku=*' => Http::response([['id' => 999, 'sku' => $product->sku]], 200),
        '*/products/999' => Http::response(['id' => 999, 'status' => 'draft'], 200),
    ]);

    $this->service->deactivate($product, $shop);

    Http::assertSent(function ($request) {
        return $request->method() === 'PUT' && json_decode($request->body(), true) === ['status' => 'draft'];
    });
    $cached = DB::table('product_platform_shops')->where('product_id', $product->id)->where('sales_platform_shop_id', $shop->id)->first();
    expect($cached->status)->toBeNull(); // draft is not "live"
});

test('checkLiveStatus reports never_pushed and clears the cache when WooCommerce has no matching SKU', function () {
    $product = wcProduct();
    $shop = wcShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'status' => 'live', 'created_at' => now(), 'updated_at' => now()]);
    Http::fake(['*/products?sku=*' => Http::response([], 200)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => false, 'never_pushed' => true, 'status' => null]);
    $cached = DB::table('product_platform_shops')->where('product_id', $product->id)->first();
    expect($cached->status)->toBeNull();
});

test('checkLiveStatus reports is_live=true and caches platform_item_id when WooCommerce\'s status is "publish"', function () {
    $product = wcProduct();
    $shop = wcShop();
    Http::fake(['*/products?sku=*' => Http::response([['id' => 555, 'status' => 'publish']], 200)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => true, 'never_pushed' => false, 'status' => 'publish']);
    $cached = DB::table('product_platform_shops')->where('product_id', $product->id)->first();
    expect($cached->platform_item_id)->toBe('555');
});
