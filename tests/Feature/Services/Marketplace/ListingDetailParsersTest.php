<?php

use App\Services\Marketplace\Listings\Details\AbstractListingDetailFetcher;
use App\Services\Marketplace\Listings\Details\LazadaListingDetailFetcher;
use App\Services\Marketplace\Listings\Details\ShopeeListingDetailFetcher;
use App\Services\Marketplace\Listings\Details\TikTokListingDetailFetcher;
use App\Services\Marketplace\Listings\Details\WooCommerceListingDetailFetcher;

/**
 * Listing detail parsers against REAL responses captured 2026-11-09 (read-only
 * calls on the shops synced locally; trimmed to a few SKUs) — see
 * tests/Fixtures/MarketplaceListingDetails. Only the WooCommerce *variable*
 * product is synthetic: the store had no variable product to capture.
 * Feature dir only because the Lazada/Shopee parsers look up category names
 * in our own (here empty) synced category tables.
 */
function mldFixture(string $name): array
{
    return json_decode(file_get_contents(base_path("tests/Fixtures/MarketplaceListingDetails/{$name}.json")), true);
}

const MLD_KEYS = ['name', 'description', 'description_text', 'brand_id', 'brand_name', 'category_id', 'category_name', 'images',
    'video_url', 'attributes', 'package', 'variants', 'status', 'listing_url', 'raw'];

const MLD_VARIANT_KEYS = ['variant_id', 'seller_sku', 'name', 'options', 'price', 'special_price', 'quantity', 'status', 'image'];

test('lazada: single-SKU item', function () {
    $raw = [LazadaListingDetailFetcher::ENDPOINT => mldFixture('lazada_single')];
    $d = (new LazadaListingDetailFetcher)->parse($raw);

    expect(array_keys($d))->toBe(MLD_KEYS)
        ->and($d['name'])->toBe('Pumpkin พัมคิน ระดับน้ำ รุ่นซุปเปอร์ฮิต 18 นิ้ว')
        ->and($d['brand_name'])->toBe('PUMPKIN')
        ->and($d['brand_id'])->toBeNull()
        ->and($d['category_id'])->toBe('10100226')
        ->and($d['category_name'])->toBeNull() // lazada_categories not synced in tests
        ->and($d['images'])->toHaveCount(3)
        ->and($d['status'])->toBe('InActive')
        ->and($d['listing_url'])->toBe('https://www.lazada.co.th/products/pumpkin-18-i1014472745-s2241406788.html')
        ->and($d['package'])->toBe(['weight_kg' => 1.0, 'length_cm' => 80.0, 'width_cm' => 50.0, 'height_cm' => 2.5])
        ->and($d['raw'])->toBe($raw);

    // short_description bullets as text; the long description is images only
    expect($d['description_text'])->toStartWith("คุณสมบัติสินค้า\n\n• หลอดน้ำผลิตจาก Acrylic")
        ->and($d['description_text'])->not->toContain('<')
        ->and($d['description'])->toContain('<img');

    expect($d['attributes'])->toContain(['id' => 'measuring_type', 'name' => 'measuring_type', 'values' => ['Spirit Level']])
        ->and(collect($d['attributes'])->pluck('id')->all())->not->toContain('name', 'description', 'brand', 'source');

    expect($d['variants'])->toHaveCount(1);
    $v = $d['variants'][0];
    expect(array_keys($v))->toBe(MLD_VARIANT_KEYS)
        ->and($v['variant_id'])->toBe('2241406788')
        ->and($v['seller_sku'])->toBe('28213')
        ->and($v['options'])->toBe(['Color family' => 'ส้มแอปริคอต ไซส์ 18 นิ้ว']) // saleProp key → variation label
        ->and($v['price'])->toBe(272.0)
        ->and($v['special_price'])->toBeNull() // equal to price → not a special price
        ->and($v['quantity'])->toBe(100)
        ->and($v['status'])->toBe('inactive');
});

test('lazada: multi-variant item', function () {
    $d = (new LazadaListingDetailFetcher)->parse([LazadaListingDetailFetcher::ENDPOINT => mldFixture('lazada_multi')]);

    expect($d['variants'])->toHaveCount(3)
        ->and($d['variants'][0]['options'])->toBe(['ตัวเลือก ขนาด' => '24x26 mm'])
        ->and($d['variants'][0]['name'])->toBe('24x26 mm')
        ->and($d['variants'][0]['image'])->toBeNull()
        ->and($d['package']['weight_kg'])->toBe(1.2)
        ->and($d['description_text'])->toStartWith('MATSUMOTO ประแจแหวนคอ 75°')
        ->and($d['images'])->toHaveCount(7);

    // seen live: item images empty, the SKU carries them → fall back
    $raw = mldFixture('lazada_single');
    $raw['data']['images'] = [];
    $d = (new LazadaListingDetailFetcher)->parse([LazadaListingDetailFetcher::ENDPOINT => $raw]);
    expect($d['images'])->toBe($raw['data']['skus'][0]['Images']);
});

test('shopee: multi-model item with extended description', function () {
    $raw = [
        ShopeeListingDetailFetcher::BASE_INFO => mldFixture('shopee_base_multi'),
        ShopeeListingDetailFetcher::MODEL_LIST => mldFixture('shopee_models'),
    ];
    $d = (new ShopeeListingDetailFetcher)->parse($raw, ['shopee_shop_id' => 57198184]);

    expect($d['name'])->toBe('PUMPKIN ลูกบ๊อกซ์สั้น XTREME หกเหลี่ยม 8mm-32mm/40265-40288')
        ->and($d['brand_id'])->toBe('1127450')
        ->and($d['brand_name'])->toBe('Pumpkin(พัมคินส์)')
        ->and($d['category_id'])->toBe('101796')
        ->and($d['images'])->toHaveCount(7)
        ->and($d['status'])->toBe('NORMAL')
        ->and($d['listing_url'])->toBe('https://shopee.co.th/product/57198184/27763421033')
        ->and($d['package'])->toBe(['weight_kg' => 0.5, 'length_cm' => 4.0, 'width_cm' => 4.0, 'height_cm' => 10.0])
        ->and($d['description'])->toStartWith('ลูกบ๊อกซ์สั้น หกเหลี่ยม')
        ->and($d['description_text'])->toContain("ㆍผลิตจากเหล็กโครมวานาเดียม\n(Chrome Vanadium Alloy Steel)");

    // models sorted by tier_index, option names from tier_variation
    expect(array_column($d['variants'], 'name'))->toBe(['21mm', '25mm', '32mm']);
    $v = $d['variants'][0];
    expect($v['variant_id'])->toBe('226855724334')
        ->and($v['seller_sku'])->toBe('40278')
        ->and($v['options'])->toBe(['ขนาด' => '21mm'])
        ->and($v['price'])->toBe(73.0)
        ->and($v['special_price'])->toBe(67.0)
        ->and($v['quantity'])->toBe(72)
        ->and($v['status'])->toBe('MODEL_NORMAL')
        ->and($v['image'])->toStartWith('https://cf.shopee.co.th/file/');
});

test('shopee: single item with a normal description and no models', function () {
    $d = (new ShopeeListingDetailFetcher)->parse([ShopeeListingDetailFetcher::BASE_INFO => mldFixture('shopee_base_single')]);

    expect($d['description_text'])->toBe("ตัวตลับ ผลิตจากพลาสติก ABS แท้ 100%\nขอบยางลดการกระแทกของหัวเทป เมื่อดึงสายเทปย้อนกลับ\nขอเกี่ยวหัวเทป ใช้หมุดในการยึด 3 ตัว")
        ->and($d['package'])->toBe(['weight_kg' => 0.1, 'length_cm' => null, 'width_cm' => null, 'height_cm' => null]) // 0 = not set
        ->and($d['listing_url'])->toBeNull() // no shop id in context
        ->and($d['status'])->toBe('UNLIST')
        ->and($d['variants'])->toHaveCount(1)
        ->and($d['variants'][0])->toMatchArray(['variant_id' => '', 'seller_sku' => '10103', 'price' => 492.0, 'special_price' => null, 'quantity' => 0, 'options' => []]);
});

test('tiktok: multi-SKU product', function () {
    $d = (new TikTokListingDetailFetcher)->parse([TikTokListingDetailFetcher::ENDPOINT => mldFixture('tiktok_multi')]);

    expect($d['name'])->toBe('PUMPKIN ลูกบ๊อกซ์สั้น XTREME หกเหลี่ยม 8mm-32mm/40265-40288')
        ->and($d['brand_id'])->toBe('7032166665970288386')
        ->and($d['brand_name'])->toBe('pumpkin')
        ->and($d['category_id'])->toBe('882312')
        ->and($d['category_name'])->toBe('ประแจไฟฟ้า') // leaf of category_chains
        ->and($d['images'])->toHaveCount(7)
        ->and($d['status'])->toBe('ACTIVATE')
        ->and($d['listing_url'])->toBeNull()
        ->and($d['package'])->toBe(['weight_kg' => 0.5, 'length_cm' => 4.0, 'width_cm' => 4.0, 'height_cm' => 10.0])
        ->and($d['attributes'])->toBe([['id' => '100107', 'name' => 'ประเภทของการรับประกัน', 'values' => ['ไม่รับประกัน']]])
        ->and($d['description_text'])->toStartWith("ลูกบ๊อกซ์สั้น หกเหลี่ยม ลูกบ๊อกซ์ยาว หกเหลี่ยม\nㆍผลิตจาก")
        ->and($d['description_text'])->not->toContain('<');

    expect($d['variants'])->toHaveCount(3);
    expect($d['variants'][0])->toMatchArray([
        'variant_id' => '1733130233410913964', 'seller_sku' => '40265', 'options' => ['ขนาด' => '8mm'],
        'price' => 56.0, 'special_price' => null, 'quantity' => 100, 'status' => 'NORMAL',
    ]);
    expect($d['variants'][0]['image'])->toStartWith('https://');
});

test('tiktok: single-SKU product converts units and keeps a frozen status', function () {
    $d = (new TikTokListingDetailFetcher)->parse([TikTokListingDetailFetcher::ENDPOINT => mldFixture('tiktok_single')]);

    expect($d['status'])->toBe('FREEZE')
        ->and($d['package']['weight_kg'])->toBe(0.011)
        ->and($d['variants'])->toHaveCount(1)
        ->and($d['variants'][0]['seller_sku'])->toBe('50276');

    // unit conversion: grams / inches
    $raw = mldFixture('tiktok_single');
    $raw['data']['package_weight'] = ['unit' => 'GRAM', 'value' => '1500'];
    $raw['data']['package_dimensions'] = ['unit' => 'INCH', 'length' => '10', 'width' => '2', 'height' => '1'];
    $d = (new TikTokListingDetailFetcher)->parse([TikTokListingDetailFetcher::ENDPOINT => $raw]);
    expect($d['package'])->toBe(['weight_kg' => 1.5, 'length_cm' => 25.4, 'width_cm' => 5.08, 'height_cm' => 2.54]);
});

test('woocommerce: simple product', function () {
    $raw = [WooCommerceListingDetailFetcher::PRODUCT => mldFixture('woo_single'), WooCommerceListingDetailFetcher::SETTINGS => ['weight_unit' => 'kg', 'dimension_unit' => 'cm']];
    $d = (new WooCommerceListingDetailFetcher)->parse($raw);

    expect($d['name'])->toBe('PUMPKIN 17904 SCORPION WELD ตู้เชื่อม INVERTER รุ่น ECO 140PLUS')
        ->and($d['brand_id'])->toBe('940')
        ->and($d['brand_name'])->toBe('PUMPKIN')
        ->and($d['category_id'])->toBe('1142')
        ->and($d['category_name'])->toBe('เครื่องเชื่อม')
        ->and($d['images'])->toBe(['https://pumpkin.co.th/wp-content/uploads/2026/08/17904-4.jpg'])
        ->and($d['status'])->toBe('publish')
        ->and($d['listing_url'])->toBe('https://pumpkin.co.th/product/pumpkin-17904-eco-140plus/')
        ->and($d['package'])->toBe(['weight_kg' => null, 'length_cm' => null, 'width_cm' => null, 'height_cm' => null])
        ->and($d['description_text'])->toStartWith("• ใช้สาย\n• กระแสไฟเชื่อม 20-125 A");

    expect(collect($d['attributes'])->firstWhere('id', 'categories')['values'])->toHaveCount(4)
        ->and($d['variants'])->toHaveCount(1)
        ->and($d['variants'][0])->toMatchArray(['variant_id' => '', 'seller_sku' => '17904', 'price' => 4590.0, 'special_price' => null, 'quantity' => 100]);
});

test('woocommerce: variable product (synthetic) with store units in grams / mm', function () {
    $product = mldFixture('woo_single');
    $product['type'] = 'variable';
    $product['weight'] = '2500';
    $product['dimensions'] = ['length' => '300', 'width' => '200', 'height' => '100'];
    $variations = [
        ['id' => 501, 'sku' => '17904-R', 'status' => 'publish', 'regular_price' => '4590', 'sale_price' => '3990', 'price' => '3990',
            'stock_quantity' => 5, 'image' => ['src' => 'https://pumpkin.co.th/r.jpg'], 'attributes' => [['id' => 0, 'name' => 'สี', 'option' => 'แดง']]],
        ['id' => 502, 'sku' => '17904-B', 'status' => 'private', 'regular_price' => '4590', 'sale_price' => '', 'price' => '4590',
            'stock_quantity' => null, 'image' => null, 'attributes' => [['id' => 0, 'name' => 'สี', 'option' => 'น้ำเงิน']]],
    ];

    $d = (new WooCommerceListingDetailFetcher)->parse([
        WooCommerceListingDetailFetcher::PRODUCT => $product,
        WooCommerceListingDetailFetcher::VARIATIONS => $variations,
        WooCommerceListingDetailFetcher::SETTINGS => ['weight_unit' => 'g', 'dimension_unit' => 'mm'],
    ]);

    expect($d['package'])->toBe(['weight_kg' => 2.5, 'length_cm' => 30.0, 'width_cm' => 20.0, 'height_cm' => 10.0])
        ->and($d['variants'])->toHaveCount(2)
        ->and($d['variants'][0])->toMatchArray(['variant_id' => '501', 'seller_sku' => '17904-R', 'options' => ['สี' => 'แดง'], 'name' => 'แดง',
            'price' => 4590.0, 'special_price' => 3990.0, 'quantity' => 5, 'status' => 'publish', 'image' => 'https://pumpkin.co.th/r.jpg'])
        ->and($d['variants'][1])->toMatchArray(['variant_id' => '502', 'special_price' => null, 'quantity' => null, 'image' => null]);
});

test('parsers never throw on empty or malformed responses', function () {
    foreach ([
        new LazadaListingDetailFetcher, new ShopeeListingDetailFetcher, new TikTokListingDetailFetcher, new WooCommerceListingDetailFetcher,
    ] as $fetcher) {
        foreach ([[], ['x' => 'junk'], [LazadaListingDetailFetcher::ENDPOINT => ['data' => ['skus' => ['bad', null], 'attributes' => 'x']]],
            [ShopeeListingDetailFetcher::BASE_INFO => ['response' => ['item_list' => [['item_id' => 1, 'image' => 'x', 'dimension' => 5]]]], ShopeeListingDetailFetcher::MODEL_LIST => ['response' => ['model' => [['model_id' => 2, 'tier_index' => ['a']]]]]],
            [TikTokListingDetailFetcher::ENDPOINT => ['data' => ['skus' => [['id' => 3, 'sales_attributes' => 'x', 'price' => 'x']], 'category_chains' => 'x']]],
            [WooCommerceListingDetailFetcher::PRODUCT => ['images' => 'x', 'attributes' => [null, ['name' => 'a']]], WooCommerceListingDetailFetcher::VARIATIONS => [null, ['id' => 9]]],
        ] as $raw) {
            $d = $fetcher->parse($raw);
            expect(array_keys($d))->toBe(MLD_KEYS)->and($d['images'])->toBeArray()->and($d['variants'])->toBeArray();
        }
    }
});

test('htmlToText turns marketplace HTML into readable plain text', function () {
    $html = "<html><head><style>p{}</style></head><body><p>หัวข้อ&nbsp;A &amp; B</p>\n<ul>\n\t<li><p>หนึ่ง</p></li>\n<li>สอง</li></ul><p>บรรทัด<br/>ใหม่</p><script>alert(1)</script><img src=\"x.jpg\"/></body></html>";

    expect(AbstractListingDetailFetcher::htmlToText($html))->toBe("หัวข้อ A & B\n\n• หนึ่ง\n• สอง\n\nบรรทัด\nใหม่")
        ->and(AbstractListingDetailFetcher::htmlToText("plain\r\nline 2\n\n\n\nline 3"))->toBe("plain\nline 2\n\nline 3")
        ->and(AbstractListingDetailFetcher::htmlToText('<div><img src="a.jpg"></div>'))->toBeNull()
        ->and(AbstractListingDetailFetcher::htmlToText('ราคา < 5 บาท'))->toBe('ราคา < 5 บาท')
        ->and(AbstractListingDetailFetcher::htmlToText(null))->toBeNull();
});
