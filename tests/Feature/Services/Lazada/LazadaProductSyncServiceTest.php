<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\LazadaBrand;
use App\Models\LazadaCategory;
use App\Models\LazadaProduct;
use App\Models\LazadaSellerAccount;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Services\Lazada\LazadaClient;
use App\Services\Lazada\LazadaProductSyncService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

function lpsProduct(array $attributes = []): Product
{
    return Product::create(array_merge(['sku' => 'SKU-'.uniqid()], $attributes));
}

function lpsShop(): SalesPlatformShop
{
    $platform = SalesPlatform::create(['code' => 'lazada_'.uniqid(), 'name' => 'Lazada']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'My Shop']);
}

function lpsAccount(): LazadaSellerAccount
{
    $account = new LazadaSellerAccount();
    $account->app_key = 'appkey123';
    $account->app_secret = 'appsecret123';
    $account->access_token = 'token123';

    return $account;
}

function lpsMapField(string $targetField, string $attributeCode, ?string $lazadaAttributeName = null, string $attributeType = 'text'): Attribute
{
    // firstOrCreate: lpsPushableProduct() is called more than once within a
    // single test (e.g. syncLiveStatus's multi-product scenarios), and each
    // call maps the same 'pname'/'price_std' codes again.
    $attribute = Attribute::firstOrCreate(['code' => $attributeCode], ['type' => $attributeType]);
    LazadaAttributeMapping::firstOrCreate(
        ['attribute_id' => $attribute->id],
        ['target_field' => $targetField, 'lazada_attribute_name' => $lazadaAttributeName, 'sort_order' => 0]
    );

    return $attribute;
}

function lpsSetValue(Product $product, Attribute $attribute, ?string $value, ?int $localeId = null): void
{
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => $value, 'locale_id' => $localeId]);
}

/**
 * Maps a select-type PIM attribute (with one AttributeOption) onto a Lazada
 * category attribute, and gives the product a value for it — the shared
 * setup behind every singleSelect/brand-mapping test below.
 *
 * @return LazadaAttributeMapping the mapping row, for a matching LazadaAttributeOptionMapping to be attached to
 */
function lpsMapSingleSelect(Product $product, string $lazadaAttributeName, string $optionCode, ?string $inputType = 'singleSelect'): LazadaAttributeMapping
{
    $attribute = Attribute::firstOrCreate(['code' => 'select_'.$lazadaAttributeName], ['type' => 'select']);
    LazadaAttribute::firstOrCreate(['name' => $lazadaAttributeName], ['input_type' => $inputType, 'attribute_type' => 'normal']);
    $mapping = LazadaAttributeMapping::firstOrCreate(
        ['attribute_id' => $attribute->id],
        ['target_field' => 'lazada_attribute', 'lazada_attribute_name' => $lazadaAttributeName, 'sort_order' => 0]
    );
    $option = AttributeOption::firstOrCreate(['attribute_id' => $attribute->id, 'code' => $optionCode]);
    lpsSetValue($product, $attribute, $optionCode);

    return $mapping->fresh();
}

function lpsPushableProduct(): Product
{
    LazadaCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    LazadaBrand::firstOrCreate(['id' => 50], ['name' => 'Test Brand']);

    $product = lpsProduct(['lazada_category_id' => 100, 'lazada_brand_id' => 50]);
    lpsSetValue($product, lpsMapField('name', 'pname'), 'Widget');
    lpsSetValue($product, lpsMapField('price', 'price_std'), '199');

    return $product;
}

function lpsFakeCategoryAttributes(array $schema = []): void
{
    Http::fake(['*/category/attributes/get*' => Http::response(['code' => '0', 'data' => $schema], 200)]);
}

/** Merges a category-attributes fake with whatever other endpoints a test also needs faked. */
function lpsFake(array $extra = [], array $schema = []): void
{
    Http::fake(array_merge($extra, [
        '*/category/attributes/get*' => Http::response(['code' => '0', 'data' => $schema], 200),
    ]));
}

function lpsNoMatchFake(): array
{
    return ['*/products/get*' => Http::response(['code' => '0', 'data' => ['products' => []]], 200)];
}

beforeEach(function () {
    config(['services.lazada.base_url' => 'https://api.lazada.co.th/rest']);
    $this->service = new LazadaProductSyncService(new LazadaClient(lpsAccount()));
});

// --- buildPayload guard clauses ---

test('buildPayload throws when the product has no category mapped to Lazada at all', function () {
    $product = lpsProduct();

    $this->service->buildPayload($product, lpsShop());
})->throws(RuntimeException::class, 'no category mapped to a Lazada category yet');

test('buildPayload throws when neither name nor price is mapped', function () {
    LazadaCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    $product = lpsProduct(['lazada_category_id' => 100]);
    lpsFakeCategoryAttributes();

    $this->service->buildPayload($product, lpsShop());
})->throws(RuntimeException::class, 'missing a name or price');

test('buildPayload throws when the product has no brand mapped via either the Master Brand override or a generic attribute mapping', function () {
    LazadaCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    $product = lpsProduct(['lazada_category_id' => 100]);
    lpsSetValue($product, lpsMapField('name', 'pname'), 'Widget');
    lpsSetValue($product, lpsMapField('price', 'price_std'), '199');
    lpsFakeCategoryAttributes();

    $this->service->buildPayload($product, lpsShop());
})->throws(RuntimeException::class, 'has no brand mapped to Lazada yet');

// --- brand resolution: two independent routes ---

test('buildPayload prefers the Master Brand page override (products.lazada_brand_id) when present', function () {
    $product = lpsPushableProduct();
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes']['brand'])->toBe('Test Brand');
});

test('buildPayload falls back to a generic attribute mapping onto Lazada\'s own `brand` field, preferring the label captured at mapping time', function () {
    LazadaCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    $product = lpsProduct(['lazada_category_id' => 100]); // no lazada_brand_id override
    lpsSetValue($product, lpsMapField('name', 'pname'), 'Widget');
    lpsSetValue($product, lpsMapField('price', 'price_std'), '199');

    $mapping = lpsMapSingleSelect($product, 'brand', 'NIKE');
    $option = AttributeOption::where('code', 'NIKE')->first();
    LazadaAttributeOptionMapping::create([
        'lazada_attribute_mapping_id' => $mapping->id,
        'attribute_option_id' => $option->id,
        'lazada_option_value' => '999',
        'lazada_option_label' => 'Nike',
    ]);
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes']['brand'])->toBe('Nike');
});

test('buildPayload falls back further to resolveGenericBrandName() (legacy, id-based) when the option mapping has no captured label', function () {
    LazadaCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
    $product = lpsProduct(['lazada_category_id' => 100]);
    lpsSetValue($product, lpsMapField('name', 'pname'), 'Widget');
    lpsSetValue($product, lpsMapField('price', 'price_std'), '199');

    $mapping = lpsMapSingleSelect($product, 'brand', 'ADIDAS');
    $option = AttributeOption::where('code', 'ADIDAS')->first();
    LazadaAttributeOptionMapping::create([
        'lazada_attribute_mapping_id' => $mapping->id,
        'attribute_option_id' => $option->id,
        'lazada_option_value' => '777',
        'lazada_option_label' => null,
    ]);
    LazadaAttribute::where('name', 'brand')->update(['options' => json_encode([['id' => '777', 'name' => 'Legacy Adidas Name']])]);
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes']['brand'])->toBe('Legacy Adidas Name');
});

// --- generic attribute mapping resolution ---

test('buildPayload sends a singleSelect attribute\'s option NAME (not its numeric id) in the payload', function () {
    $product = lpsPushableProduct();
    $mapping = lpsMapSingleSelect($product, 'multipack_bundle', 'M2');
    $option = AttributeOption::where('code', 'M2')->first();
    LazadaAttributeOptionMapping::create([
        'lazada_attribute_mapping_id' => $mapping->id,
        'attribute_option_id' => $option->id,
        'lazada_option_value' => '310684',
        'lazada_option_label' => '2-Pack',
    ]);
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes']['multipack_bundle'])->toBe('2-Pack');
});

test('buildPayload resolves a multiSelect attribute to a list of option NAMEs, in the stored order', function () {
    $product = lpsPushableProduct();
    $attribute = Attribute::firstOrCreate(['code' => 'features'], ['type' => 'text']);
    LazadaAttribute::firstOrCreate(['name' => 'features'], ['input_type' => 'multiSelect', 'attribute_type' => 'normal']);
    $mapping = LazadaAttributeMapping::firstOrCreate(
        ['attribute_id' => $attribute->id],
        ['target_field' => 'lazada_attribute', 'lazada_attribute_name' => 'features', 'sort_order' => 0]
    );
    $optionA = AttributeOption::firstOrCreate(['attribute_id' => $attribute->id, 'code' => 'WATERPROOF']);
    $optionB = AttributeOption::firstOrCreate(['attribute_id' => $attribute->id, 'code' => 'FOLDABLE']);
    LazadaAttributeOptionMapping::create(['lazada_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $optionA->id, 'lazada_option_value' => '1', 'lazada_option_label' => 'Waterproof']);
    LazadaAttributeOptionMapping::create(['lazada_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $optionB->id, 'lazada_option_value' => '2', 'lazada_option_label' => 'Foldable']);
    lpsSetValue($product, $attribute, json_encode(['WATERPROOF', 'FOLDABLE']));
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes']['features'])->toBe(['Waterproof', 'Foldable']);
});

test('buildPayload includes the video attribute only when a video is actually mapped and has a value', function () {
    $product = lpsPushableProduct();
    lpsSetValue($product, lpsMapField('video', 'attribute_6', attributeType: 'video'), 'products/video.mp4');
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes'])->toHaveKey('video');
});

test('buildPayload omits the video attribute when no video is mapped', function () {
    $product = lpsPushableProduct();
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes'])->not->toHaveKey('video');
});

test('buildPayload resolves an `_en`-suffixed Lazada attribute from the English locale value while the base attribute stays Thai', function () {
    $product = lpsPushableProduct();
    $enLocale = Locale::firstOrCreate(['code' => 'en']);
    $thLocale = Locale::firstOrCreate(['code' => 'th']);

    $attribute = Attribute::firstOrCreate(['code' => 'product_details_features'], ['type' => 'text', 'is_locale_based' => true]);
    LazadaAttribute::firstOrCreate(['name' => 'description_en'], ['input_type' => null, 'attribute_type' => 'normal']);
    LazadaAttributeMapping::create(['attribute_id' => $attribute->id, 'target_field' => 'lazada_attribute', 'lazada_attribute_name' => 'description_en', 'sort_order' => 0]);
    lpsSetValue($product, $attribute, 'English text', $enLocale->id);
    lpsSetValue($product, $attribute, 'Thai text', $thLocale->id);
    lpsFakeCategoryAttributes();

    $payload = $this->service->buildPayload($product, lpsShop());

    expect($payload['attributes']['description_en'])->toBe('English text');
});

// --- assertMandatoryFieldsPresent ---

test('buildPayload throws naming a still-missing mandatory Lazada category attribute', function () {
    $product = lpsPushableProduct();
    lpsFakeCategoryAttributes([
        ['name' => 'product_warranty', 'label' => 'Warranty', 'attribute_type' => 'normal', 'is_mandatory' => true],
    ]);

    $this->service->buildPayload($product, lpsShop());
})->throws(RuntimeException::class, 'Warranty');

test('buildPayload translates Lazada\'s "__images__" schema field name to our own "images" payload key when checking mandatory SKU images', function () {
    $product = lpsPushableProduct();
    lpsFakeCategoryAttributes([
        ['name' => '__images__', 'label' => 'Images', 'attribute_type' => 'sku', 'is_mandatory' => true],
    ]);

    expect(fn () => $this->service->buildPayload($product, lpsShop()))->toThrow(RuntimeException::class, 'missing mandatory field');
});

test('buildPayload throws naming a provided value that is not in Lazada\'s current dropdown for that attribute', function () {
    $product = lpsPushableProduct();
    $mapping = lpsMapSingleSelect($product, 'condition_type', 'REFURB');
    $option = AttributeOption::where('code', 'REFURB')->first();
    LazadaAttributeOptionMapping::create([
        'lazada_attribute_mapping_id' => $mapping->id,
        'attribute_option_id' => $option->id,
        'lazada_option_value' => '5',
        'lazada_option_label' => 'Refurbished',
    ]);
    lpsFakeCategoryAttributes([
        ['name' => 'condition_type', 'label' => 'Condition', 'attribute_type' => 'normal', 'is_mandatory' => false, 'options' => [
            ['name' => 'New', 'en_name' => 'New', 'id' => 1],
            ['name' => 'Used', 'en_name' => 'Used', 'id' => 2],
        ]],
    ]);

    $this->service->buildPayload($product, lpsShop());
})->throws(RuntimeException::class, "not in Lazada's current dropdown");

// --- push(): create vs. update, and Lazada-CDN upload steps ---

test('push creates a new listing (no item_id/SkuId) when Lazada has no existing SKU match', function () {
    $product = lpsPushableProduct();
    lpsFake(lpsNoMatchFake() + ['*/product/create*' => Http::response(['code' => '0', 'data' => ['item_id' => 1]], 200)]);

    $this->service->push($product, lpsShop());

    Http::assertSent(function ($request) {
        if (!str_contains($request->url(), '/product/create')) {
            return false;
        }
        $payload = json_decode($request['payload'], true);

        return !isset($payload['Request']['Product']['ItemId']) && !isset($payload['Request']['Product']['Skus']['Sku'][0]['SkuId']);
    });
});

test('push updates the existing listing, attaching the item_id/SkuId Lazada told us about, when a SKU match already exists', function () {
    $product = lpsPushableProduct();
    lpsFake([
        '*/products/get*' => Http::response(['code' => '0', 'data' => ['products' => [
            ['item_id' => 777, 'skus' => [['SellerSku' => $product->sku, 'SkuId' => 888, 'Status' => 'active']]],
        ]]], 200),
        '*/product/update*' => Http::response(['code' => '0', 'data' => []], 200),
    ]);

    $this->service->push($product, lpsShop());

    Http::assertSent(function ($request) use ($product) {
        if (!str_contains($request->url(), '/product/update')) {
            return false;
        }
        $payload = json_decode($request['payload'], true);

        return $payload['Request']['Product']['ItemId'] === '777'
            && $payload['Request']['Product']['Skus']['Sku'][0]['SkuId'] === '888';
    });
});

test('push uploads product/SKU images and the video to Lazada\'s own CDN before submitting, swapping in the hosted URLs', function () {
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    Storage::disk('public')->put('products/video.mp4', 'fake-video-bytes');

    $product = lpsPushableProduct();
    lpsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');
    lpsSetValue($product, lpsMapField('video', 'attribute_6', attributeType: 'video'), 'products/video.mp4');

    lpsFake(lpsNoMatchFake() + [
        '*/image/upload*' => Http::response(['code' => '0', 'data' => ['image' => ['url' => 'https://cdn.lazada.co.th/img1.jpg']]], 200),
        '*/media/video/block/create*' => Http::response(['success' => true, 'upload_id' => 'up1'], 200),
        '*/media/video/block/upload*' => Http::response(['success' => true, 'e_tag' => 'etag1'], 200),
        '*/media/video/block/commit*' => Http::response(['success' => true, 'video_id' => 'vid123'], 200),
        '*/product/create*' => Http::response(['code' => '0', 'data' => ['item_id' => 1]], 200),
    ]);

    $this->service->push($product, lpsShop());

    Http::assertSent(function ($request) {
        if (!str_contains($request->url(), '/product/create')) {
            return false;
        }
        $payload = json_decode($request['payload'], true)['Request']['Product'];

        return $payload['Images']['Image'][0] === 'https://cdn.lazada.co.th/img1.jpg'
            && $payload['Skus']['Sku'][0]['Images']['Image'][0] === 'https://cdn.lazada.co.th/img1.jpg'
            && $payload['Attributes']['video'] === 'vid123';
    });
});

test('push drops the video entirely instead of failing when there is no image to use as the required cover', function () {
    $product = lpsPushableProduct();
    lpsSetValue($product, lpsMapField('video', 'attribute_6', attributeType: 'video'), 'products/video.mp4');

    lpsFake(lpsNoMatchFake() + ['*/product/create*' => Http::response(['code' => '0', 'data' => ['item_id' => 1]], 200)]);

    $this->service->push($product, lpsShop());

    Http::assertNotSent(fn ($request) => str_contains($request->url(), '/media/video/'));
    Http::assertSent(function ($request) {
        if (!str_contains($request->url(), '/product/create')) {
            return false;
        }
        $payload = json_decode($request['payload'], true)['Request']['Product'];

        return !isset($payload['Attributes']['video']);
    });
});

// --- deactivate() ---

test('deactivate throws when the product has never been pushed to this shop', function () {
    $product = lpsPushableProduct();
    Http::fake(lpsNoMatchFake());

    $this->service->deactivate($product, lpsShop());
})->throws(RuntimeException::class, 'nothing to deactivate');

test('deactivate sends the real Lazada item_id/sku_id/seller_sku it found, not anything guessed locally', function () {
    $product = lpsPushableProduct();
    Http::fake([
        '*/products/get*' => Http::response(['code' => '0', 'data' => ['products' => [
            ['item_id' => 321, 'skus' => [['SellerSku' => $product->sku, 'SkuId' => 654, 'Status' => 'active']]],
        ]]], 200),
        '*/product/deactivate*' => Http::response(['code' => '0', 'data' => []], 200),
    ]);

    $this->service->deactivate($product, lpsShop());

    Http::assertSent(function ($request) use ($product) {
        if (!str_contains($request->url(), '/product/deactivate')) {
            return false;
        }
        $xml = simplexml_load_string($request['apiRequestBody']);

        return (string) $xml->Product->ItemId === '321'
            && (string) $xml->Product->Skus->SkuId === '654'
            && (string) $xml->Product->Skus->SellerSku === $product->sku;
    });
});

// --- checkLiveStatus() ---

test('checkLiveStatus reports never_pushed=true and safely no-ops the DB update when Lazada has no SKU match at all', function () {
    $product = lpsPushableProduct();
    $shop = lpsShop();
    Http::fake(lpsNoMatchFake());

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => false, 'never_pushed' => true, 'status' => null]);
    expect(DB::table('product_platform_shops')->where('product_id', $product->id)->count())->toBe(0);
});

test('checkLiveStatus reports is_live=true and caches status=live for an active match', function () {
    $product = lpsPushableProduct();
    $shop = lpsShop();
    Http::fake(['*/products/get*' => Http::response(['code' => '0', 'data' => ['products' => [
        ['item_id' => 555, 'skus' => [['SellerSku' => $product->sku, 'Status' => 'active']]],
    ]]], 200)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => true, 'never_pushed' => false, 'status' => 'active']);
    $row = DB::table('product_platform_shops')->where('product_id', $product->id)->where('sales_platform_shop_id', $shop->id)->first();
    expect($row->status)->toBe('live');
    expect($row->platform_item_id)->toBe('555');
});

test('checkLiveStatus reports is_live=false but still caches the platform_item_id for a match that is not active', function () {
    $product = lpsPushableProduct();
    $shop = lpsShop();
    Http::fake(['*/products/get*' => Http::response(['code' => '0', 'data' => ['products' => [
        ['item_id' => 555, 'skus' => [['SellerSku' => $product->sku, 'Status' => 'inactive']]],
    ]]], 200)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => false, 'never_pushed' => false, 'status' => 'inactive']);
    $row = DB::table('product_platform_shops')->where('product_id', $product->id)->where('sales_platform_shop_id', $shop->id)->first();
    expect($row->status)->toBeNull();
    expect($row->platform_item_id)->toBe('555');
});

// --- syncLiveStatus() ---

test('syncLiveStatus marks matched SKUs live and resets any previously-live row that no longer shows up as live', function () {
    $stillLiveProduct = lpsProduct(['sku' => 'SKU-STILL-LIVE']);
    $noLongerLiveProduct = lpsProduct(['sku' => 'SKU-DELISTED']);
    $shop = lpsShop();

    DB::table('product_platform_shops')->insert([
        'product_id' => $noLongerLiveProduct->id,
        'sales_platform_shop_id' => $shop->id,
        'status' => 'live',
        'platform_item_id' => '111',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    Http::fake(['*/products/get*' => Http::response(['code' => '0', 'data' => [
        'total_products' => 1,
        'products' => [
            ['item_id' => 999, 'skus' => [['SellerSku' => $stillLiveProduct->sku]]],
        ],
    ]], 200)]);

    $result = $this->service->syncLiveStatus($shop);

    expect($result)->toBe(['matched' => 1, 'total_live' => 1]);
    expect(DB::table('product_platform_shops')->where('product_id', $stillLiveProduct->id)->value('status'))->toBe('live');
    expect(DB::table('product_platform_shops')->where('product_id', $stillLiveProduct->id)->value('platform_item_id'))->toBe('999');
    expect(DB::table('product_platform_shops')->where('product_id', $noLongerLiveProduct->id)->value('status'))->toBeNull();
});

// --- syncMasterProductList() ---

test('syncMasterProductList calls getAllProducts (filter=all), not getLiveProducts, so inactive listings are seen too', function () {
    $shop = lpsShop();
    Http::fake(['*/products/get*' => Http::response(['code' => '0', 'data' => ['total_products' => 0, 'products' => []]], 200)]);

    $this->service->syncMasterProductList($shop);

    Http::assertSent(function ($request) {
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $params);

        return ($params['filter'] ?? null) === 'all';
    });
});

test('syncMasterProductList caches one row per SellerSku, scoped to this shop', function () {
    $shop = lpsShop();
    Http::fake(['*/products/get*' => Http::response(['code' => '0', 'data' => [
        'total_products' => 1,
        'products' => [
            [
                'item_id' => 555,
                'images' => ['https://img.lazada.co.th/1.jpg'],
                'attributes' => ['name' => 'Widget'],
                'skus' => [
                    ['SkuId' => 111, 'SellerSku' => 'SKU-A', 'ShopSku' => 'shop-a', 'Status' => 'active', 'quantity' => 10, 'price' => '199.00', 'Url' => 'https://lazada.co.th/a'],
                    ['SkuId' => 112, 'SellerSku' => 'SKU-B', 'ShopSku' => 'shop-b', 'Status' => 'inactive', 'quantity' => 0, 'price' => '299.00', 'Url' => 'https://lazada.co.th/b'],
                ],
            ],
        ],
    ]], 200)]);

    $result = $this->service->syncMasterProductList($shop);

    expect($result)->toBe(['synced' => 2, 'total' => 1]);

    $rowA = LazadaProduct::where('sales_platform_shop_id', $shop->id)->where('seller_sku', 'SKU-A')->first();
    expect($rowA)->not->toBeNull();
    expect($rowA->item_id)->toBe(555);
    expect($rowA->sku_id)->toBe(111);
    expect($rowA->shop_sku)->toBe('shop-a');
    expect($rowA->name)->toBe('Widget');
    expect($rowA->status)->toBe('active');
    expect($rowA->quantity)->toBe(10);
    expect((string) $rowA->price)->toBe('199.00');
    expect($rowA->image_url)->toBe('https://img.lazada.co.th/1.jpg');
    expect($rowA->lazada_url)->toBe('https://lazada.co.th/a');

    $rowB = LazadaProduct::where('sales_platform_shop_id', $shop->id)->where('seller_sku', 'SKU-B')->first();
    expect($rowB)->not->toBeNull();
    expect($rowB->item_id)->toBe(555); // same product, second variant
    expect($rowB->status)->toBe('inactive');
});

test('syncMasterProductList skips a sku with no SellerSku at all', function () {
    $shop = lpsShop();
    Http::fake(['*/products/get*' => Http::response(['code' => '0', 'data' => [
        'total_products' => 1,
        'products' => [
            ['item_id' => 555, 'skus' => [['SkuId' => 1, 'SellerSku' => '']]],
        ],
    ]], 200)]);

    $result = $this->service->syncMasterProductList($shop);

    expect($result)->toBe(['synced' => 0, 'total' => 1]);
    expect(LazadaProduct::where('sales_platform_shop_id', $shop->id)->count())->toBe(0);
});

test('syncMasterProductList re-syncing the same SellerSku updates the existing row instead of duplicating it', function () {
    $shop = lpsShop();
    $callCount = 0;
    Http::fake(function () use (&$callCount) {
        $callCount++;
        $status = $callCount === 1 ? 'active' : 'inactive';
        $quantity = $callCount === 1 ? 5 : 0;

        return Http::response(['code' => '0', 'data' => [
            'total_products' => 1,
            'products' => [['item_id' => 555, 'skus' => [['SellerSku' => 'SKU-A', 'Status' => $status, 'quantity' => $quantity]]]],
        ]], 200);
    });
    $this->service->syncMasterProductList($shop);
    $this->service->syncMasterProductList($shop);

    expect(LazadaProduct::where('sales_platform_shop_id', $shop->id)->where('seller_sku', 'SKU-A')->count())->toBe(1);
    expect(LazadaProduct::where('sales_platform_shop_id', $shop->id)->where('seller_sku', 'SKU-A')->value('status'))->toBe('inactive');
});

test('syncMasterProductList pages through every offset until total_products is exhausted', function () {
    $shop = lpsShop();
    $callCount = 0;
    Http::fake(function () use (&$callCount) {
        $callCount++;
        $sku = $callCount === 1 ? 'SKU-PAGE-1' : 'SKU-PAGE-2';

        return Http::response(['code' => '0', 'data' => [
            'total_products' => 51,
            'products' => [['item_id' => $callCount, 'skus' => [['SellerSku' => $sku]]]],
        ]], 200);
    });

    $result = $this->service->syncMasterProductList($shop);

    expect($callCount)->toBe(2);
    expect($result['synced'])->toBe(2);
    expect(LazadaProduct::where('sales_platform_shop_id', $shop->id)->count())->toBe(2);
});
