<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Brand;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use App\Models\TikTokBrand;
use App\Models\TikTokCategory;
use App\Models\TikTokSellerAccount;
use App\Services\TikTok\TikTokClient;
use App\Services\TikTok\TikTokProductSyncService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

function tpsProduct(array $attributes = []): Product
{
    return Product::create(array_merge(['sku' => 'SKU-'.uniqid()], $attributes));
}

function tpsShop(): SalesPlatformShop
{
    $platform = SalesPlatform::create(['code' => 'tiktok_'.uniqid(), 'name' => 'TikTok']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'My Shop']);
}

function tpsAccount(): TikTokSellerAccount
{
    $account = new TikTokSellerAccount();
    $account->access_token = 'token123';
    $account->shops_cipher = 'cipher123';

    return $account;
}

function tpsMapField(string $targetField, string $attributeCode, ?string $tiktokAttributeId = null, string $attributeType = 'text'): Attribute
{
    $attribute = Attribute::firstOrCreate(['code' => $attributeCode], ['type' => $attributeType]);
    TikTokAttributeMapping::firstOrCreate(
        ['attribute_id' => $attribute->id],
        ['target_field' => $targetField, 'tiktok_attribute_id' => $tiktokAttributeId, 'sort_order' => 0]
    );

    return $attribute;
}

function tpsSetValue(Product $product, Attribute $attribute, ?string $value): void
{
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => $value]);
}

function tpsPushableProduct(): Product
{
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    TikTokBrand::firstOrCreate(['id' => 50], ['name' => 'Test Brand']);
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');

    $product = tpsProduct(['tiktok_category_id' => 100, 'tiktok_brand_id' => 50]);
    tpsSetValue($product, tpsMapField('name', 'pname'), 'Widget');
    tpsSetValue($product, tpsMapField('price', 'price_std'), '199');
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');

    return $product;
}

/** @param list<array<string,mixed>> $attributeSchema @param list<array<string,mixed>>|null $warehouses */
function tpsFakeBuildDeps(array $attributeSchema = [], ?array $warehouses = null, array $extra = []): void
{
    $warehouses ??= [['id' => 'wh1', 'type' => 'SALES_WAREHOUSE', 'is_default' => true]];

    Http::fake(array_merge([
        '*/logistics/*/warehouses*' => Http::response(['code' => 0, 'data' => ['warehouses' => $warehouses]], 200),
        '*/categories/*/attributes*' => Http::response(['code' => 0, 'data' => ['attributes' => $attributeSchema]], 200),
        // push() always runs the product's main image through uploadImagesToTikTok() —
        // faked here by default so every push()-level test doesn't have to repeat it.
        '*/images/upload*' => Http::response(['code' => 0, 'data' => ['uri' => 'tos-img-default']], 200),
    ], $extra));
}

beforeEach(function () {
    config([
        'services.tiktok.base_url' => 'https://open-api.tiktokglobalshop.com',
        'services.tiktok.app_key' => 'appkey123',
        'services.tiktok.app_secret' => 'appsecret123',
    ]);
    $this->service = new TikTokProductSyncService(new TikTokClient(tpsAccount()));
});

// --- buildPayload guard clauses ---

test('buildPayload throws when the product has no category mapped to TikTok at all', function () {
    $product = tpsProduct();

    $this->service->buildPayload($product, tpsShop());
})->throws(RuntimeException::class, 'no category mapped to a TikTok category yet');

test('buildPayload throws when neither name nor price is mapped', function () {
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    $product = tpsProduct(['tiktok_category_id' => 100]);
    tpsFakeBuildDeps();

    $this->service->buildPayload($product, tpsShop());
})->throws(RuntimeException::class, 'missing a name or price');

test('buildPayload throws when the product has no image at all (TikTok requires at least one main image)', function () {
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    $product = tpsProduct(['tiktok_category_id' => 100]);
    tpsSetValue($product, tpsMapField('name', 'pname'), 'Widget');
    tpsSetValue($product, tpsMapField('price', 'price_std'), '199');
    tpsFakeBuildDeps();

    $this->service->buildPayload($product, tpsShop());
})->throws(RuntimeException::class, 'no image');

test('buildPayload throws when the product has no brand mapped to TikTok yet', function () {
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    $product = tpsProduct(['tiktok_category_id' => 100]); // no tiktok_brand_id override
    tpsSetValue($product, tpsMapField('name', 'pname'), 'Widget');
    tpsSetValue($product, tpsMapField('price', 'price_std'), '199');
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');
    tpsFakeBuildDeps();

    $this->service->buildPayload($product, tpsShop());
})->throws(RuntimeException::class, 'has no brand mapped to a TikTok brand yet');

test('buildPayload throws a clear error when this TikTok shop has no warehouse configured', function () {
    $product = tpsPushableProduct();
    tpsFakeBuildDeps(warehouses: []);

    $this->service->buildPayload($product, tpsShop());
})->throws(RuntimeException::class, 'no warehouse configured');

test('buildPayload throws naming every still-missing required TikTok product attribute', function () {
    $product = tpsPushableProduct();
    tpsFakeBuildDeps([
        ['id' => 'attr1', 'name' => 'Material', 'type' => 'PRODUCT_PROPERTY', 'is_requried' => true],
    ]);

    $this->service->buildPayload($product, tpsShop());
})->throws(RuntimeException::class, 'Material');

// --- buildPayload success shape ---

test('buildPayload sends brand_id as a flat top-level string field, using the product\'s own override', function () {
    $product = tpsPushableProduct();
    tpsFakeBuildDeps();

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload['brand_id'])->toBe('50');
    expect($payload['category_version'])->toBe('v2');
});

test('buildPayload falls back to the pbrand-mapped Brand row\'s tiktok_brand_id when the product has no override', function () {
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    $product = tpsProduct(['tiktok_category_id' => 100]);
    tpsSetValue($product, tpsMapField('name', 'pname'), 'Widget');
    tpsSetValue($product, tpsMapField('price', 'price_std'), '199');
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');
    Brand::create(['code' => 'nike', 'name' => 'Nike', 'tiktok_brand_id' => 777]);
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pbrand'], ['type' => 'text']), 'nike');
    tpsFakeBuildDeps();

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload['brand_id'])->toBe('777');
});

test('buildPayload falls back to the product name for description when no description is mapped, but uses a mapped description as-is otherwise', function () {
    $product = tpsPushableProduct();
    tpsFakeBuildDeps();
    expect($this->service->buildPayload($product, tpsShop())['description'])->toBe('Widget');

    tpsSetValue($product, tpsMapField('description', 'product_details_features'), 'A really nice widget');
    expect($this->service->buildPayload($product, tpsShop())['description'])->toBe('A really nice widget');
});

test('buildPayload caps main_images at 9, TikTok\'s own documented limit', function () {
    $product = tpsPushableProduct();
    $gallery = Attribute::firstOrCreate(['code' => 'pgallery'], ['type' => 'gallery']);
    tpsSetValue($product, $gallery, json_encode(array_map(fn ($i) => "products/gallery-{$i}.jpg", range(1, 12))));
    tpsFakeBuildDeps();

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload['main_images'])->toHaveCount(9);
});

test('buildPayload includes package_weight/package_dimensions only when mapped, and omits the video field when none is mapped', function () {
    $product = tpsPushableProduct();
    tpsFakeBuildDeps();

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload)->not->toHaveKey('package_weight');
    expect($payload)->not->toHaveKey('package_dimensions');
    expect($payload)->not->toHaveKey('video');
});

test('buildPayload includes the video field (still our own storage URL, unresolved) when a video is mapped', function () {
    $product = tpsPushableProduct();
    tpsSetValue($product, tpsMapField('video', 'attribute_6', attributeType: 'video'), 'products/video.mp4');
    tpsFakeBuildDeps();

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload['video'])->toBe(['id' => Storage::disk('public')->url('products/video.mp4')]);
});

// --- product_attributes resolution ---

test('buildPayload sends a customizable attribute as a free-text {name: value}', function () {
    $product = tpsPushableProduct();
    TikTokAttribute::firstOrCreate(['id' => 'attr1'], ['name' => 'Material', 'is_customizable' => true]);
    $attribute = tpsMapField('tiktok_attribute', 'material', 'attr1');
    tpsSetValue($product, $attribute, 'Cotton');
    tpsFakeBuildDeps([
        ['id' => 'attr1', 'name' => 'Material', 'type' => 'PRODUCT_PROPERTY', 'is_requried' => false],
    ]);

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload['product_attributes'])->toBe([['id' => 'attr1', 'values' => [['name' => 'Cotton']]]]);
});

test('buildPayload sends a non-customizable single-select attribute as {id: option_value}', function () {
    $product = tpsPushableProduct();
    TikTokAttribute::firstOrCreate(['id' => 'attr2'], ['name' => 'Color', 'is_customizable' => false, 'is_multiple_selection' => false]);
    $pimAttribute = Attribute::firstOrCreate(['code' => 'color'], ['type' => 'select']);
    $mapping = TikTokAttributeMapping::create(['attribute_id' => $pimAttribute->id, 'target_field' => 'tiktok_attribute', 'tiktok_attribute_id' => 'attr2', 'sort_order' => 0]);
    $option = AttributeOption::firstOrCreate(['attribute_id' => $pimAttribute->id, 'code' => 'RED']);
    TikTokAttributeOptionMapping::create(['tiktok_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $option->id, 'tiktok_option_value' => 'opt123']);
    tpsSetValue($product, $pimAttribute, 'RED');
    tpsFakeBuildDeps([
        ['id' => 'attr2', 'name' => 'Color', 'type' => 'PRODUCT_PROPERTY', 'is_requried' => false],
    ]);

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload['product_attributes'])->toBe([['id' => 'attr2', 'values' => [['id' => 'opt123']]]]);
});

test('buildPayload sends a non-customizable multi-select attribute as a list of {id}, in stored order', function () {
    $product = tpsPushableProduct();
    TikTokAttribute::firstOrCreate(['id' => 'attr3'], ['name' => 'Features', 'is_customizable' => false, 'is_multiple_selection' => true]);
    $pimAttribute = Attribute::firstOrCreate(['code' => 'features'], ['type' => 'text']);
    $mapping = TikTokAttributeMapping::create(['attribute_id' => $pimAttribute->id, 'target_field' => 'tiktok_attribute', 'tiktok_attribute_id' => 'attr3', 'sort_order' => 0]);
    $optionA = AttributeOption::firstOrCreate(['attribute_id' => $pimAttribute->id, 'code' => 'WATERPROOF']);
    $optionB = AttributeOption::firstOrCreate(['attribute_id' => $pimAttribute->id, 'code' => 'FOLDABLE']);
    TikTokAttributeOptionMapping::create(['tiktok_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $optionA->id, 'tiktok_option_value' => 'v1']);
    TikTokAttributeOptionMapping::create(['tiktok_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $optionB->id, 'tiktok_option_value' => 'v2']);
    tpsSetValue($product, $pimAttribute, json_encode(['WATERPROOF', 'FOLDABLE']));
    tpsFakeBuildDeps([
        ['id' => 'attr3', 'name' => 'Features', 'type' => 'PRODUCT_PROPERTY', 'is_requried' => false],
    ]);

    $payload = $this->service->buildPayload($product, tpsShop());

    expect($payload['product_attributes'])->toBe([['id' => 'attr3', 'values' => [['id' => 'v1'], ['id' => 'v2']]]]);
});

// --- push(): create vs. update, and the Lazada/Shopee-style CDN upload steps ---

test('push creates a new listing and caches the returned product_id when nothing was pushed before', function () {
    $product = tpsPushableProduct();
    $shop = tpsShop();
    tpsFakeBuildDeps(extra: ['*/products?*' => Http::response(['code' => 0, 'data' => ['product_id' => 'tt-1']], 200)]);

    $this->service->push($product, $shop);

    expect(DB::table('product_platform_shops')->where('product_id', $product->id)->where('sales_platform_shop_id', $shop->id)->value('platform_item_id'))->toBe('tt-1');
    Http::assertSent(fn ($request) => $request->method() === 'POST' && str_contains($request->url(), '/products?'));
});

test('push updates the existing listing by its cached platform_item_id when one is already cached', function () {
    $product = tpsPushableProduct();
    $shop = tpsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => 'tt-existing', 'created_at' => now(), 'updated_at' => now()]);
    tpsFakeBuildDeps(extra: ['*/products/tt-existing*' => Http::response(['code' => 0, 'data' => []], 200)]);

    $this->service->push($product, $shop);

    Http::assertSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/products/tt-existing'));
});

test('push falls back to creating a fresh listing when the cached platform_item_id no longer resolves on TikTok\'s side', function () {
    $product = tpsPushableProduct();
    $shop = tpsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => 'tt-stale', 'created_at' => now(), 'updated_at' => now()]);
    tpsFakeBuildDeps(extra: [
        '*/products/tt-stale*' => Http::response(['code' => 12052032, 'message' => 'The product does not exist'], 200),
        '*/products?*' => Http::response(['code' => 0, 'data' => ['product_id' => 'tt-new']], 200),
    ]);

    $this->service->push($product, $shop);

    expect(DB::table('product_platform_shops')->where('product_id', $product->id)->value('platform_item_id'))->toBe('tt-new');
});

// --- ensureTikTokBrandMapped() (called from push(), before buildPayload()) ---

test('push does not attempt any brand auto-mapping when the product already has a tiktok_brand_id override', function () {
    $product = tpsPushableProduct(); // already has tiktok_brand_id => 50
    $shop = tpsShop();
    tpsFakeBuildDeps(extra: ['*/products?*' => Http::response(['code' => 0, 'data' => ['product_id' => 'tt-1']], 200)]);

    $result = $this->service->push($product, $shop);

    expect($result)->not->toHaveKey('_auto_mapped_tiktok_brand');
    Http::assertNotSent(fn ($request) => str_contains($request->url(), '/brands'));
});

test('push auto-creates a TikTok brand via createCustomBrand() for an unmapped pbrand, and tags the result', function () {
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    $product = tpsProduct(['tiktok_category_id' => 100]);
    tpsSetValue($product, tpsMapField('name', 'pname'), 'Widget');
    tpsSetValue($product, tpsMapField('price', 'price_std'), '199');
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');
    Brand::create(['code' => 'nike', 'name' => 'Nike']);
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pbrand'], ['type' => 'text']), 'nike');
    $shop = tpsShop();
    tpsFakeBuildDeps(extra: [
        '*/brands*' => Http::response(['code' => 0, 'data' => ['id' => 999]], 200),
        '*/products?*' => Http::response(['code' => 0, 'data' => ['product_id' => 'tt-1']], 200),
    ]);

    $result = $this->service->push($product, $shop);

    expect($result['_auto_mapped_tiktok_brand'])->toBe(['name' => 'Nike', 'id' => 999, 'created' => true]);
    expect(Brand::where('code', 'nike')->value('tiktok_brand_id'))->toBe(999);
});

test('push reuses a matching cached TikTokBrand by exact name instead of creating a duplicate', function () {
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    $product = tpsProduct(['tiktok_category_id' => 100]);
    tpsSetValue($product, tpsMapField('name', 'pname'), 'Widget');
    tpsSetValue($product, tpsMapField('price', 'price_std'), '199');
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');
    Brand::create(['code' => 'nike', 'name' => 'Nike']);
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pbrand'], ['type' => 'text']), 'nike');
    TikTokBrand::create(['id' => 555, 'name' => 'Nike']);
    $shop = tpsShop();
    tpsFakeBuildDeps(extra: ['*/products?*' => Http::response(['code' => 0, 'data' => ['product_id' => 'tt-1']], 200)]);

    $result = $this->service->push($product, $shop);

    expect($result['_auto_mapped_tiktok_brand'])->toBe(['name' => 'Nike', 'id' => 555, 'created' => false]);
    Http::assertNotSent(fn ($request) => str_contains($request->url(), '/brands') && $request->method() === 'POST');
});

test('push falls back to a live exact-name brand lookup when createCustomBrand collides with an existing name (12052205)', function () {
    TikTokCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    $product = tpsProduct(['tiktok_category_id' => 100]);
    tpsSetValue($product, tpsMapField('name', 'pname'), 'Widget');
    tpsSetValue($product, tpsMapField('price', 'price_std'), '199');
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');
    Brand::create(['code' => 'nike', 'name' => 'Nike']);
    tpsSetValue($product, Attribute::firstOrCreate(['code' => 'pbrand'], ['type' => 'text']), 'nike');
    $shop = tpsShop();
    tpsFakeBuildDeps(extra: [
        '*/product/*/brands*' => function (\Illuminate\Http\Client\Request $request) {
            return $request->method() === 'GET'
                ? Http::response(['code' => 0, 'data' => ['brands' => [['id' => 321, 'name' => 'Nike']]]], 200)
                : Http::response(['code' => 12052205, 'message' => 'This operation requires a unique brand name'], 200);
        },
        '*/products?*' => Http::response(['code' => 0, 'data' => ['product_id' => 'tt-1']], 200),
    ]);

    $result = $this->service->push($product, $shop);

    expect($result['_auto_mapped_tiktok_brand'])->toBe(['name' => 'Nike', 'id' => 321, 'created' => false]);
    expect(Brand::where('code', 'nike')->value('tiktok_brand_id'))->toBe(321);
});

test('push uploads the main image and video to TikTok\'s media library before submitting, swapping in the returned uri/file id', function () {
    $product = tpsPushableProduct();
    tpsSetValue($product, tpsMapField('video', 'attribute_6', attributeType: 'video'), 'products/video.mp4');
    Storage::disk('public')->put('products/video.mp4', 'fake-video-bytes');
    $shop = tpsShop();
    tpsFakeBuildDeps(extra: [
        '*/images/upload*' => Http::response(['code' => 0, 'data' => ['uri' => 'tos-img-abc']], 200),
        '*/files/upload*' => Http::response(['code' => 0, 'data' => ['id' => 'tos-file-xyz']], 200),
        '*/products?*' => Http::response(['code' => 0, 'data' => ['product_id' => 'tt-1']], 200),
    ]);

    $this->service->push($product, $shop);

    Http::assertSent(function ($request) {
        if ($request->method() !== 'POST' || !str_contains($request->url(), '/products?')) {
            return false;
        }
        $body = json_decode($request->body(), true);

        return $body['main_images'][0]['uri'] === 'tos-img-abc' && $body['video']['id'] === 'tos-file-xyz';
    });
});

// --- deactivate() ---

test('deactivate throws when the product has never been pushed to this shop', function () {
    $product = tpsPushableProduct();

    $this->service->deactivate($product, tpsShop());
})->throws(RuntimeException::class, 'nothing to deactivate');

test('deactivate sends the cached platform_item_id to deactivateProducts', function () {
    $product = tpsPushableProduct();
    $shop = tpsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => 'tt-live', 'created_at' => now(), 'updated_at' => now()]);
    Http::fake(['*/products/deactivate*' => Http::response(['code' => 0, 'data' => []], 200)]);

    $this->service->deactivate($product, $shop);

    Http::assertSent(function ($request) {
        $body = json_decode($request->body(), true);

        return $body['product_ids'] === ['tt-live'];
    });
});

// --- checkLiveStatus() ---

test('checkLiveStatus reports never_pushed=true without calling TikTok at all when there is no cached product_id', function () {
    $product = tpsPushableProduct();
    $shop = tpsShop();

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => false, 'never_pushed' => true, 'status' => null]);
    Http::assertNothingSent();
});

test('checkLiveStatus reports is_live based on data.status === "ACTIVATE" and caches the result', function () {
    $product = tpsPushableProduct();
    $shop = tpsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => 'tt-live', 'created_at' => now(), 'updated_at' => now()]);
    Http::fake(['*/products/tt-live*' => Http::response(['code' => 0, 'data' => ['status' => 'ACTIVATE']], 200)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => true, 'never_pushed' => false, 'status' => 'ACTIVATE']);
    expect(DB::table('product_platform_shops')->where('product_id', $product->id)->value('status'))->toBe('live');
});

test('checkLiveStatus reports is_live=false for a status other than ACTIVATE (e.g. audit-approved but seller-deactivated)', function () {
    $product = tpsPushableProduct();
    $shop = tpsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => 'tt-deact', 'created_at' => now(), 'updated_at' => now()]);
    Http::fake(['*/products/tt-deact*' => Http::response(['code' => 0, 'data' => ['status' => 'SELLER_DEACTIVATED']], 200)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => false, 'never_pushed' => false, 'status' => 'SELLER_DEACTIVATED']);
    expect(DB::table('product_platform_shops')->where('product_id', $product->id)->value('status'))->toBeNull();
});
