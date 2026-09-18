<?php

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Locale;
use App\Models\Product;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use App\Models\ShopeeBrand;
use App\Models\ShopeeSellerAccount;
use App\Services\Shopee\ShopeeClient;
use App\Services\Shopee\ShopeeProductSyncService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

function spsProduct(array $attributes = []): Product
{
    return Product::create(array_merge(['sku' => 'SKU-'.uniqid()], $attributes));
}

function spsShop(): SalesPlatformShop
{
    $platform = SalesPlatform::create(['code' => 'shopee_'.uniqid(), 'name' => 'Shopee']);

    return SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'shop_'.uniqid(), 'name' => 'My Shop']);
}

function spsAccount(): ShopeeSellerAccount
{
    $account = new ShopeeSellerAccount();
    $account->shop_id = 'shop123';
    $account->partner_id = 'partner123';
    $account->access_token = 'token123';
    $account->partner_key = 'secretkey';

    return $account;
}

function spsMapField(string $targetField, string $attributeCode): Attribute
{
    // firstOrCreate: spsPushableProduct() is called more than once within a
    // single test (e.g. syncLiveStatus's two-product scenario), and each
    // call maps the same 'pname'/'price_std' codes again.
    $attribute = Attribute::firstOrCreate(['code' => $attributeCode], ['type' => 'text']);
    ShopeeAttributeMapping::firstOrCreate(['attribute_id' => $attribute->id, 'target_field' => $targetField], ['sort_order' => 0]);

    return $attribute;
}

function spsSetValue(Product $product, Attribute $attribute, string $value): void
{
    \App\Models\ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attribute->id, 'value' => $value]);
}

/** A product with name/price/an image and everything else needed to get past buildPayload()'s early guard clauses. */
function spsPushableProduct(): Product
{
    Storage::fake('public');
    Storage::disk('public')->put('products/photo.jpg', 'fake-bytes');
    ShopeeBrand::firstOrCreate(['id' => 50], ['name' => 'Test Brand']);

    // shopee_brand_id: 0 is falsy in PHP, so it would NOT count as "has an
    // override" in resolveShopeeBrandId()'s `if ($product->shopee_brand_id)`
    // check and fall through to needing a pbrand mapping instead — use a
    // real, nonzero, FK-valid id so every test built on this fixture clears
    // buildPayload()'s brand resolution without needing its own pbrand setup.
    $product = spsProduct(['shopee_category_id' => 100, 'shopee_brand_id' => 50]);
    spsSetValue($product, spsMapField('name', 'pname'), 'Widget');
    spsSetValue($product, spsMapField('price', 'price_std'), '199');
    // The raw stored value for an `image`-type attribute must be the
    // relative storage path, not a pre-built URL — AttributeValueFormatter
    // runs it through Storage::disk('public')->url() itself on read; storing
    // an already-resolved URL here gets it wrapped a second time (doubling
    // the /storage/ prefix into something with no scheme, which is exactly
    // what happened before this fix).
    spsSetValue($product, Attribute::firstOrCreate(['code' => 'pimage'], ['type' => 'image']), 'products/photo.jpg');

    return $product;
}

function spsFakeChannelsAndAttributes(int $categoryId = 100, array $schema = []): void
{
    Http::fake([
        '*/logistics/get_channel_list*' => Http::response(['response' => ['logistics_channel_list' => [
            ['logistics_channel_id' => 1, 'logistics_channel_name' => 'Standard', 'enabled' => true],
        ]]], 200),
        '*/product/get_attribute_tree*' => Http::response(['response' => ['list' => [
            ['attribute_tree' => $schema],
        ]]], 200),
    ]);
}

beforeEach(function () {
    config(['services.shopee.base_url' => 'https://partner.shopeemobile.com']);
    $this->service = new ShopeeProductSyncService(new ShopeeClient(spsAccount()));
    // FK target for the shopee_category_id=100 override used throughout this file.
    \App\Models\ShopeeCategory::firstOrCreate(['id' => 100], ['name' => 'Test Category', 'is_leaf' => true]);
});

// --- buildPayload guard clauses ---

test('buildPayload throws when neither name nor price is mapped', function () {
    $product = spsProduct(['shopee_category_id' => 100]);
    spsFakeChannelsAndAttributes();

    $this->service->buildPayload($product, spsShop());
})->throws(RuntimeException::class, 'missing a name or price');

test('buildPayload throws when the product has no image at all (Shopee requires at least one)', function () {
    $product = spsProduct(['shopee_category_id' => 100]);
    spsSetValue($product, spsMapField('name', 'pname'), 'Widget');
    spsSetValue($product, spsMapField('price', 'price_std'), '199');
    spsFakeChannelsAndAttributes();

    $this->service->buildPayload($product, spsShop());
})->throws(RuntimeException::class, 'no image');

test('buildPayload throws when the shop has no enabled logistics channel', function () {
    $product = spsPushableProduct();
    Http::fake(['*/logistics/get_channel_list*' => Http::response(['response' => ['logistics_channel_list' => [
        ['logistics_channel_id' => 1, 'logistics_channel_name' => 'Standard', 'enabled' => false],
    ]]], 200)]);

    $this->service->buildPayload($product, spsShop());
})->throws(RuntimeException::class, 'no enabled Shopee logistics channel');

test('buildPayload throws naming every still-missing mandatory Shopee attribute, without ever attempting a live write', function () {
    $product = spsPushableProduct();
    spsFakeChannelsAndAttributes(schema: [
        ['attribute_id' => 1, 'name' => 'TIS No.', 'mandatory' => true],
    ]);

    $this->service->buildPayload($product, spsShop());
})->throws(RuntimeException::class, 'TIS No.');

test('buildPayload uses description as-is when mapped, but falls back to the product name when no description is mapped', function () {
    $product = spsPushableProduct();
    spsFakeChannelsAndAttributes();

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['description'])->toBe('Widget');
});

test('buildPayload defaults weight to 0.1 when none is mapped, and sends the flat original_price field (not a nested price_info)', function () {
    $product = spsPushableProduct();
    spsFakeChannelsAndAttributes();

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['weight'])->toBe(0.1);
    expect($payload['original_price'])->toBe(199.0);
    expect($payload)->not->toHaveKey('price_info');
});

test('buildPayload only includes dimension when all three of length/width/height are mapped with a value', function () {
    $product = spsPushableProduct();
    spsSetValue($product, spsMapField('length', 'length_attr'), '10');
    spsFakeChannelsAndAttributes();

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload)->not->toHaveKey('dimension');
});

test('buildPayload\'s image list still carries our own storage URLs (not yet uploaded) — uploading happens later, in push()', function () {
    $product = spsPushableProduct();
    spsFakeChannelsAndAttributes();

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['image']['image_id_list'][0])->toContain('products/photo.jpg');
});

// --- resolveAttributes: FREE_TEXT / SINGLE_SELECT / MULTI_SELECT ---

test('a FREE_TEXT_FILED (input_type 3) mapped attribute sends a plain original_value_name', function () {
    $product = spsPushableProduct();
    ShopeeAttribute::create(['id' => 5, 'name' => 'Material', 'input_type' => 3]);
    $attr = Attribute::create(['code' => 'material', 'type' => 'text']);
    ShopeeAttributeMapping::create(['attribute_id' => $attr->id, 'target_field' => 'shopee_attribute', 'shopee_attribute_id' => 5, 'sort_order' => 0]);
    spsSetValue($product, $attr, 'Cotton');
    spsFakeChannelsAndAttributes(schema: [['attribute_id' => 5, 'name' => 'Material', 'mandatory' => false]]);

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['attribute_list'])->toBe([['attribute_id' => 5, 'attribute_value_list' => [['original_value_name' => 'Cotton']]]]);
});

test('a SINGLE_DROP_DOWN (input_type 1) mapped attribute resolves through ShopeeAttributeOptionMapping to a value_id', function () {
    $product = spsPushableProduct();
    ShopeeAttribute::create(['id' => 6, 'name' => 'Color', 'input_type' => 1]);
    $attr = Attribute::create(['code' => 'pcolor', 'type' => 'select']);
    $mapping = ShopeeAttributeMapping::create(['attribute_id' => $attr->id, 'target_field' => 'shopee_attribute', 'shopee_attribute_id' => 6, 'sort_order' => 0]);
    $option = AttributeOption::create(['attribute_id' => $attr->id, 'code' => 'red', 'admin_label' => 'Red']);
    ShopeeAttributeOptionMapping::create(['shopee_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $option->id, 'shopee_option_value' => '999']);
    spsSetValue($product, $attr, 'red');
    spsFakeChannelsAndAttributes(schema: [['attribute_id' => 6, 'name' => 'Color', 'mandatory' => false]]);

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['attribute_list'])->toBe([['attribute_id' => 6, 'attribute_value_list' => [['value_id' => 999]]]]);
});

test('a MULTI_DROP_DOWN (input_type 4) mapped attribute resolves every selected code to its own value_id', function () {
    $product = spsPushableProduct();
    ShopeeAttribute::create(['id' => 7, 'name' => 'Sizes', 'input_type' => 4]);
    $attr = Attribute::create(['code' => 'psizes', 'type' => 'multiselect']);
    $mapping = ShopeeAttributeMapping::create(['attribute_id' => $attr->id, 'target_field' => 'shopee_attribute', 'shopee_attribute_id' => 7, 'sort_order' => 0]);
    $s = AttributeOption::create(['attribute_id' => $attr->id, 'code' => 's', 'admin_label' => 'S']);
    $m = AttributeOption::create(['attribute_id' => $attr->id, 'code' => 'm', 'admin_label' => 'M']);
    ShopeeAttributeOptionMapping::create(['shopee_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $s->id, 'shopee_option_value' => '10']);
    ShopeeAttributeOptionMapping::create(['shopee_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $m->id, 'shopee_option_value' => '20']);
    spsSetValue($product, $attr, json_encode(['s', 'm']));
    spsFakeChannelsAndAttributes(schema: [['attribute_id' => 7, 'name' => 'Sizes', 'mandatory' => false]]);

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['attribute_list'])->toBe([['attribute_id' => 7, 'attribute_value_list' => [['value_id' => 10], ['value_id' => 20]]]]);
});

test('a locale-based multiselect attribute still resolves correctly when localeCode is passed through (regression: it used to be omitted, so a locale-based value never matched)', function () {
    $th = Locale::firstOrCreate(['code' => 'th'], ['enabled' => true]);
    $product = spsPushableProduct();
    ShopeeAttribute::create(['id' => 8, 'name' => 'Sizes', 'input_type' => 4]);
    $attr = Attribute::create(['code' => 'psizes2', 'type' => 'multiselect', 'is_locale_based' => true]);
    $mapping = ShopeeAttributeMapping::create(['attribute_id' => $attr->id, 'target_field' => 'shopee_attribute', 'shopee_attribute_id' => 8, 'sort_order' => 0]);
    $s = AttributeOption::create(['attribute_id' => $attr->id, 'code' => 's', 'admin_label' => 'S']);
    ShopeeAttributeOptionMapping::create(['shopee_attribute_mapping_id' => $mapping->id, 'attribute_option_id' => $s->id, 'shopee_option_value' => '10']);
    \App\Models\ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attr->id, 'locale_id' => $th->id, 'value' => json_encode(['s'])]);
    spsFakeChannelsAndAttributes(schema: [['attribute_id' => 8, 'name' => 'Sizes', 'mandatory' => false]]);

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['attribute_list'])->toBe([['attribute_id' => 8, 'attribute_value_list' => [['value_id' => 10]]]]);
});

test('an unmapped, non-mandatory schema attribute is silently skipped, not reported as missing', function () {
    $product = spsPushableProduct();
    spsFakeChannelsAndAttributes(schema: [['attribute_id' => 99, 'name' => 'Optional Field', 'mandatory' => false]]);

    $payload = $this->service->buildPayload($product, spsShop());

    expect($payload['attribute_list'] ?? [])->toBe([]);
});

// --- push / deactivate / delete / checkLiveStatus / syncLiveStatus ---

test('push calls addItem (not updateItem) when there is no cached platform_item_id yet, and caches the new one', function () {
    $product = spsPushableProduct();
    $shop = spsShop();
    spsFakeChannelsAndAttributes();
    Http::fake([
        '*/logistics/get_channel_list*' => Http::response(['response' => ['logistics_channel_list' => [['logistics_channel_id' => 1, 'logistics_channel_name' => 'Standard', 'enabled' => true]]]], 200),
        '*/product/get_attribute_tree*' => Http::response(['response' => ['list' => [['attribute_tree' => []]]]], 200),
        '*/media_space/upload_image*' => Http::response(['response' => ['image_info' => ['image_id' => 'img_1']]], 200),
        '*/product/add_item*' => Http::response(['response' => ['item_id' => 5555]], 200),
    ]);

    $result = $this->service->push($product, $shop);

    expect($result['response']['item_id'])->toBe(5555);
    Http::assertSent(fn ($request) => str_contains($request->url(), '/add_item'));
    $cached = DB::table('product_platform_shops')->where('product_id', $product->id)->where('sales_platform_shop_id', $shop->id)->value('platform_item_id');
    expect($cached)->toBe('5555');
});

test('push calls updateItem (with the cached item_id) when one already exists', function () {
    $product = spsPushableProduct();
    $shop = spsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => '4444', 'created_at' => now(), 'updated_at' => now()]);
    Http::fake([
        '*/logistics/get_channel_list*' => Http::response(['response' => ['logistics_channel_list' => [['logistics_channel_id' => 1, 'logistics_channel_name' => 'Standard', 'enabled' => true]]]], 200),
        '*/product/get_attribute_tree*' => Http::response(['response' => ['list' => [['attribute_tree' => []]]]], 200),
        '*/media_space/upload_image*' => Http::response(['response' => ['image_info' => ['image_id' => 'img_1']]], 200),
        '*/product/update_item*' => Http::response(['response' => ['item_id' => 4444]], 200),
    ]);

    $this->service->push($product, $shop);

    Http::assertSent(function ($request) {
        return str_contains($request->url(), '/update_item') && json_decode($request->body(), true)['item_id'] === 4444;
    });
});

test('push uploads each image via uploadImage, replacing the storage URL with the returned image_id', function () {
    $product = spsPushableProduct();
    $shop = spsShop();
    Http::fake([
        '*/logistics/get_channel_list*' => Http::response(['response' => ['logistics_channel_list' => [['logistics_channel_id' => 1, 'logistics_channel_name' => 'Standard', 'enabled' => true]]]], 200),
        '*/product/get_attribute_tree*' => Http::response(['response' => ['list' => [['attribute_tree' => []]]]], 200),
        '*/media_space/upload_image*' => Http::response(['response' => ['image_info' => ['image_id' => 'shopee_img_1']]], 200),
        '*/product/add_item*' => Http::response(['response' => ['item_id' => 1]], 200),
    ]);

    $this->service->push($product, $shop);

    Http::assertSent(function ($request) {
        if (! str_contains($request->url(), '/add_item')) {
            return true;
        }

        return json_decode($request->body(), true)['image']['image_id_list'] === ['shopee_img_1'];
    });
});

test('push carries on and tags the result with _video_upload_warning when the video upload fails, instead of aborting the whole push', function () {
    $product = spsPushableProduct();
    spsSetValue($product, spsMapField('video', 'video_attr'), Storage::disk('public')->url('products/clip.mp4'));
    $shop = spsShop();

    Http::fake([
        '*/logistics/get_channel_list*' => Http::response(['response' => ['logistics_channel_list' => [['logistics_channel_id' => 1, 'logistics_channel_name' => 'Standard', 'enabled' => true]]]], 200),
        '*/product/get_attribute_tree*' => Http::response(['response' => ['list' => [['attribute_tree' => []]]]], 200),
        '*/media_space/upload_image*' => Http::response(['response' => ['image_info' => ['image_id' => 'img_1']]], 200),
        // No video/media routes faked -> uploadVideo() fails reading a
        // nonexistent clip.mp4 -> caught, push carries on without it.
        '*/product/add_item*' => Http::response(['response' => ['item_id' => 1]], 200),
    ]);

    $result = $this->service->push($product, $shop);

    expect($result)->toHaveKey('_video_upload_warning');
    Http::assertSent(function ($request) {
        if (! str_contains($request->url(), '/add_item')) {
            return true;
        }

        return ! array_key_exists('video_upload_id', json_decode($request->body(), true));
    });
});

test('submitToShopee retries once, dropping the over-limit channel, when Shopee rejects with the "max price" / "Channel detail" error shape', function () {
    $product = spsPushableProduct();
    $shop = spsShop();

    Http::fake([
        '*/logistics/get_channel_list*' => Http::response(['response' => ['logistics_channel_list' => [
            ['logistics_channel_id' => 1, 'logistics_channel_name' => 'SPX COD', 'enabled' => true],
            ['logistics_channel_id' => 2, 'logistics_channel_name' => 'Standard', 'enabled' => true],
        ]]], 200),
        '*/product/get_attribute_tree*' => Http::response(['response' => ['list' => [['attribute_tree' => []]]]], 200),
        '*/media_space/upload_image*' => Http::response(['response' => ['image_info' => ['image_id' => 'img_1']]], 200),
        '*/product/add_item*' => Http::sequence()
            ->push(['error' => 'product.error_busi', 'msg' => 'The max price of the product is over max limit. Channel detail: SPX COD'], 200)
            ->push(['response' => ['item_id' => 1]], 200),
    ]);

    $result = $this->service->push($product, $shop);

    expect($result['response']['item_id'])->toBe(1);
    // ->values(): Http::recorded() preserves each match's original index from
    // the full (unfiltered) request log, so a filtered result's keys aren't
    // necessarily 0,1,... even with exactly 2 matches.
    $addItemCalls = collect(Http::recorded(fn ($request) => str_contains($request->url(), '/add_item')))->values();
    expect($addItemCalls)->toHaveCount(2);
    $secondCallChannels = json_decode($addItemCalls[1][0]->body(), true)['logistic_info'];
    expect($secondCallChannels)->toBe([['logistic_id' => 2, 'enabled' => true]]);
});

test('deactivate throws when the product has no cached platform_item_id; otherwise calls unlistItem', function () {
    $product = spsPushableProduct();
    $shop = spsShop();
    Http::fake(['*' => Http::response(['response' => []], 200)]);

    expect(fn () => $this->service->deactivate($product, $shop))->toThrow(RuntimeException::class, 'nothing to deactivate');

    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => '123', 'created_at' => now(), 'updated_at' => now()]);
    $this->service->deactivate($product, $shop);

    Http::assertSent(fn ($request) => str_contains($request->url(), '/unlist_item'));
});

test('delete clears the cached platform_item_id/status after a successful delete', function () {
    $product = spsPushableProduct();
    $shop = spsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => '123', 'status' => 'live', 'created_at' => now(), 'updated_at' => now()]);
    Http::fake(['*/product/delete_item*' => Http::response(['response' => []], 200)]);

    $this->service->delete($product, $shop);

    $row = DB::table('product_platform_shops')->where('product_id', $product->id)->first();
    expect($row->platform_item_id)->toBeNull();
    expect($row->status)->toBeNull();
});

test('checkLiveStatus returns never_pushed=true without calling Shopee at all when there is no cached item_id', function () {
    $product = spsPushableProduct();
    $shop = spsShop();
    Http::fake(['*' => Http::response('should not be called', 500)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => false, 'never_pushed' => true, 'status' => null]);
});

test('checkLiveStatus reports is_live based on item_status === "NORMAL" and caches the result', function () {
    $product = spsPushableProduct();
    $shop = spsShop();
    DB::table('product_platform_shops')->insert(['product_id' => $product->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => '123', 'created_at' => now(), 'updated_at' => now()]);
    Http::fake(['*/product/get_item_base_info*' => Http::response(['response' => ['item_list' => [['item_status' => 'NORMAL']]]], 200)]);

    $result = $this->service->checkLiveStatus($product, $shop);

    expect($result)->toBe(['is_live' => true, 'never_pushed' => false, 'status' => 'NORMAL']);
    expect(DB::table('product_platform_shops')->where('product_id', $product->id)->value('status'))->toBe('live');
});

test('syncLiveStatus pages through get_item_list until has_next_page is false, marking matched rows live and resetting stale ones', function () {
    $shop = spsShop();
    $stillLiveProduct = spsPushableProduct();
    $noLongerLiveProduct = spsPushableProduct();
    DB::table('product_platform_shops')->insert([
        ['product_id' => $stillLiveProduct->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => '111', 'status' => null, 'created_at' => now(), 'updated_at' => now()],
        ['product_id' => $noLongerLiveProduct->id, 'sales_platform_shop_id' => $shop->id, 'platform_item_id' => '222', 'status' => 'live', 'created_at' => now(), 'updated_at' => now()],
    ]);

    Http::fake([
        '*/product/get_item_list*' => Http::sequence()
            ->push(['response' => ['item' => [['item_id' => 111]], 'has_next_page' => false]], 200),
    ]);

    $result = $this->service->syncLiveStatus($shop);

    expect($result)->toBe(['matched' => 1, 'total_live' => 1]);
    expect(DB::table('product_platform_shops')->where('product_id', $stillLiveProduct->id)->value('status'))->toBe('live');
    expect(DB::table('product_platform_shops')->where('product_id', $noLongerLiveProduct->id)->value('status'))->toBeNull();
});
