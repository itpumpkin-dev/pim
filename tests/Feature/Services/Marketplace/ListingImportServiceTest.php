<?php

use App\Events\ProductDataChanged;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AttributeOption;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Channel;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use App\Models\User;
use App\Services\Marketplace\Listings\ListingImportService;
use Illuminate\Support\Facades\Event;

/**
 * "นำเข้าข้อมูลจาก Shopee": payload field / platform attribute mappings walked
 * backwards from a listing's cached detail — channel-based attributes go to the
 * shop's channel, the rest to the default (never pre-ticked), locale th.
 */
beforeEach(function () {
    $this->user = User::factory()->create();
    $this->th = Locale::firstOrCreate(['code' => 'th'], ['display_name' => 'Thai', 'enabled' => true]);

    $platform = SalesPlatform::firstOrCreate(['code' => 'shopee'], ['name' => 'Shopee']);
    $this->channel = Channel::create(['code' => 'lis_shop_channel']);
    $this->shop = SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'lis_shop', 'name' => 'LIS Shop', 'channel_id' => $this->channel->id]);

    $this->name = Attribute::create(['code' => 'lis_name', 'type' => 'text', 'is_locale_based' => true, 'is_channel_based' => false]);
    $this->weight = Attribute::create(['code' => 'lis_weight', 'type' => 'number', 'is_locale_based' => false, 'is_channel_based' => true]);
    $this->material = Attribute::create(['code' => 'lis_material', 'type' => 'select', 'is_locale_based' => false, 'is_channel_based' => false]);
    $this->steel = AttributeOption::create(['attribute_id' => $this->material->id, 'code' => 'steel', 'admin_label' => 'เหล็ก', 'sort_order' => 0]);

    $this->group = AttributeGroup::create(['code' => 'lis_group']);
    $family = AttributeFamily::create(['code' => 'lis_family', 'name' => 'LIS']);
    foreach ([$this->name, $this->weight, $this->material] as $i => $attribute) {
        FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $this->group->id, 'sort_order' => $i]);
    }
    $category = Category::create(['code' => 'lis_category', 'name' => 'LIS Category']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $this->product = Product::create(['sku' => 'LIS-1', 'type' => 'simple', 'enabled' => true]);
    $this->product->categories()->attach($category->id);

    ShopeeAttributeMapping::create(['attribute_id' => $this->name->id, 'target_field' => 'name', 'sort_order' => 0]);
    ShopeeAttributeMapping::create(['attribute_id' => $this->weight->id, 'target_field' => 'weight', 'sort_order' => 0]);
    ShopeeAttribute::create(['id' => 5001, 'name' => 'Material', 'input_type' => 1]);
    $materialMapping = ShopeeAttributeMapping::create(['attribute_id' => $this->material->id, 'target_field' => 'shopee_attribute', 'shopee_attribute_id' => 5001, 'sort_order' => 0]);
    ShopeeAttributeOptionMapping::create(['shopee_attribute_mapping_id' => $materialMapping->id, 'attribute_option_id' => $this->steel->id, 'shopee_option_value' => '77', 'shopee_option_label' => 'Steel']);

    $this->listing = MarketplaceListing::create([
        'sales_platform_shop_id' => $this->shop->id, 'platform' => 'shopee', 'item_id' => '900', 'variant_id' => '', 'is_active' => true,
        'product_id' => $this->product->id, 'match_method' => 'manual',
    ]);
    $this->detail = MarketplaceListingDetail::create([
        'sales_platform_shop_id' => $this->shop->id, 'platform' => 'shopee', 'item_id' => '900',
        'name' => 'ประแจ 21 มม.', 'description' => "บรรทัดแรก\nบรรทัดสอง", 'description_text' => "บรรทัดแรก\nบรรทัดสอง",
        'package' => ['weight_kg' => 1.25, 'length_cm' => null, 'width_cm' => null, 'height_cm' => null],
        'attributes' => [['id' => '5001', 'name' => 'Material', 'values' => ['Steel']], ['id' => '6001', 'name' => 'Warranty', 'values' => ['1 ปี']]],
        'fetched_at' => now(),
    ]);
    $this->importer = app(ListingImportService::class);
});

test('form rows carry group, scope, current/proposed values, options and editability', function () {
    $rows = collect($this->importer->plan($this->product, 'shopee', $this->listing->load('shop.platform'), $this->detail, null, $this->user))->keyBy('key');

    expect($rows['field:name'])->toMatchArray(['group' => 'general', 'status' => 'ok', 'editable' => true, 'scope' => 'default', 'proposed' => 'ประแจ 21 มม.', 'differs' => true])
        ->and($rows['field:weight'])->toMatchArray(['group' => 'shipping', 'scope' => 'channel', 'proposed' => '1.25', 'current' => null])
        ->and($rows['field:description'])->toMatchArray(['group' => 'details', 'status' => 'unmapped', 'editable' => false])
        ->and($rows['attr:5001'])->toMatchArray(['group' => 'specs', 'proposed' => 'steel', 'editable' => true])
        ->and($rows['attr:5001']['options'])->toBe([['value' => 'steel', 'label' => 'เหล็ก']])
        ->and($rows['attr:6001'])->toMatchArray(['group' => 'other', 'status' => 'unmapped'])
        // Shopee requires name + weight; the material attribute isn't a mandatory category attribute here
        ->and($rows['field:name']['required'])->toBeTrue()
        ->and($rows['field:weight']['required'])->toBeTrue()
        ->and($rows['field:length']['required'])->toBeFalse()
        ->and($rows['attr:5001']['required'])->toBeFalse();
});

test('without a listing the form still offers the mapped fields (no proposed values, default scope)', function () {
    $rows = collect($this->importer->plan($this->product, 'shopee', null, null, null, $this->user))->keyBy('key');

    expect($rows['field:name'])->toMatchArray(['editable' => true, 'proposed' => null, 'scope' => 'default'])
        ->and($rows['field:weight']['scope'])->toBe('default')
        ->and($rows->has('attr:5001'))->toBeFalse(); // not on a listing, no platform category given
});

test('save writes edited values to the right channel/locale/group, validates, clears, audits, and skips auto-sync', function () {
    Event::fake([ProductDataChanged::class]);
    $listing = $this->listing->load('shop.platform');

    $result = $this->importer->apply($this->product, 'shopee', $listing, $this->detail, null, [
        'field:name' => 'ประแจแก้ไขเอง',
        'field:weight' => '1,250.50',
        'attr:5001' => 'steel',
        'attr:6001' => 'x', // unmapped → skipped
    ], $this->user);

    expect($result['written'])->toBe(3)->and($result['skipped'])->toBe(['attr:6001'])->and($result['errors'])->toBe([]);

    $value = fn (Attribute $a, ?int $channelId, ?int $localeId) => ProductValue::where([
        'product_id' => $this->product->id, 'attribute_id' => $a->id, 'attribute_group_id' => $this->group->id,
        'channel_id' => $channelId, 'locale_id' => $localeId,
    ])->value('value');

    expect($value($this->name, null, $this->th->id))->toBe('ประแจแก้ไขเอง')
        ->and($value($this->weight, $this->channel->id, null))->toBe('1250.5')
        ->and($value($this->weight, null, null))->toBeNull()
        ->and($value($this->material, null, null))->toBe('steel')
        ->and(AuditLog::where('event', 'marketplace_product_edited')->count())->toBe(1);
    Event::assertDispatched(ProductDataChanged::class, fn ($e) => $e->productId === $this->product->id && $e->skipMarketplaceAutoSync === true);

    // invalid option / number → nothing written
    $bad = $this->importer->apply($this->product, 'shopee', $listing, $this->detail, null, ['attr:5001' => 'wood', 'field:weight' => 'abc'], $this->user);
    expect($bad['written'])->toBe(0)->and(array_keys($bad['errors']))->toBe(['attr:5001', 'field:weight']);

    // empty value clears that scope; unchanged values are no-ops
    $clear = $this->importer->apply($this->product, 'shopee', $listing, $this->detail, null, ['field:weight' => '', 'attr:5001' => 'steel'], $this->user);
    expect($clear['written'])->toBe(1)->and($value($this->weight, $this->channel->id, null))->toBeNull();
});

test('only listings linked directly to the product (or a variant) can be used', function () {
    $variant = Product::create(['sku' => 'LIS-1-V', 'type' => 'simple', 'parent_id' => $this->product->id]);
    $other = Product::create(['sku' => 'LIS-OTHER', 'type' => 'simple']);

    expect(ListingImportService::listingBelongsTo($this->listing, $this->product))->toBeTrue();

    $this->listing->update(['product_id' => $variant->id]);
    expect(ListingImportService::listingBelongsTo($this->listing, $this->product))->toBeTrue();

    $this->listing->update(['product_id' => $other->id]);
    expect(ListingImportService::listingBelongsTo($this->listing, $this->product))->toBeFalse();
});

test('a description edited in the form keeps its links and images; only script-capable content is removed', function () {
    $description = Attribute::create(['code' => 'lis_desc', 'type' => 'textarea', 'is_locale_based' => true]);
    FamilyAttribute::create(['family_id' => FamilyAttribute::where('attribute_id', $this->name->id)->value('family_id'), 'attribute_id' => $description->id, 'attribute_group_id' => $this->group->id, 'sort_order' => 9]);
    ShopeeAttributeMapping::create(['attribute_id' => $description->id, 'target_field' => 'description', 'sort_order' => 0]);

    $html = '<p>ดู <a href="https://example.com/spec" target="_blank">สเปก</a> <span style="color: red">ด่วน</span></p><p><img src="/storage/x.jpg" alt="x"></p>'
        .'<script>alert(1)</script><p onclick="steal()">คลิก</p><a href="javascript:alert(1)">bad</a>';

    $this->importer->apply($this->product, 'shopee', null, null, null, ['field:description' => $html], $this->user);

    $stored = ProductValue::where(['product_id' => $this->product->id, 'attribute_id' => $description->id])->value('value');
    expect($stored)->toContain('<a href="https://example.com/spec" target="_blank">สเปก</a>')
        ->toContain('<span style="color: red">ด่วน</span>')
        ->toContain('<img src="/storage/x.jpg" alt="x">')
        ->not->toContain('<script')
        ->not->toContain('onclick')
        ->not->toContain('javascript:');
});
