<?php

use App\Events\ProductDataChanged;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\User;
use App\Services\Marketplace\Listings\ListingImageImportService;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * "นำเข้าข้อมูลจาก {platform}" phase 2 — listing images downloaded into the
 * PIM gallery (pgallery, global value), pimage filled when empty.
 */
beforeEach(function () {
    Storage::fake('public');
    $this->png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    Http::fake([
        'cdn.test/a.png' => Http::response($this->png, 200, ['Content-Type' => 'image/png']),
        'cdn.test/b.png' => Http::response($this->png, 200, ['Content-Type' => 'image/png']),
        'cdn.test/not-image' => Http::response('<html>nope</html>', 200, ['Content-Type' => 'text/html']),
    ]);

    $this->user = User::factory()->create();
    $platform = SalesPlatform::firstOrCreate(['code' => 'shopee'], ['name' => 'Shopee']);
    $this->shop = SalesPlatformShop::create(['sales_platform_id' => $platform->id, 'code' => 'liis_shop', 'name' => 'LIIS Shop']);

    $this->gallery = Attribute::create(['code' => 'pgallery', 'type' => 'gallery', 'is_locale_based' => true]);
    $this->single = Attribute::create(['code' => 'pimage', 'type' => 'image', 'is_locale_based' => true]);
    $this->group = AttributeGroup::create(['code' => 'liis_group']);
    $family = AttributeFamily::create(['code' => 'liis_family', 'name' => 'LIIS']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $this->gallery->id, 'attribute_group_id' => $this->group->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $this->single->id, 'attribute_group_id' => $this->group->id, 'sort_order' => 1]);
    $category = Category::create(['code' => 'liis_category', 'name' => 'LIIS']);
    DB::table('category_attribute_family')->insert(['category_id' => $category->id, 'family_id' => $family->id, 'sort_order' => 0]);

    $this->product = Product::create(['sku' => 'LIIS-1', 'type' => 'simple', 'enabled' => true]);
    $this->product->categories()->attach($category->id);

    $this->listing = MarketplaceListing::create([
        'sales_platform_shop_id' => $this->shop->id, 'platform' => 'shopee', 'item_id' => '901', 'variant_id' => '', 'is_active' => true,
        'product_id' => $this->product->id, 'match_method' => 'manual',
    ]);
    $this->detail = MarketplaceListingDetail::create([
        'sales_platform_shop_id' => $this->shop->id, 'platform' => 'shopee', 'item_id' => '901',
        'images' => ['https://cdn.test/a.png', 'https://cdn.test/b.png', 'https://cdn.test/not-image'],
        'fetched_at' => now(),
    ]);
    $this->images = app(ListingImageImportService::class);
    $this->value = fn (Attribute $a) => ProductValue::where([
        'product_id' => $this->product->id, 'attribute_id' => $a->id, 'attribute_group_id' => $this->group->id, 'channel_id' => null, 'locale_id' => null,
    ])->value('value');
});

test('plan lists the platform images and defaults to replace while the gallery is empty', function () {
    $plan = $this->images->plan($this->product, $this->detail, $this->user);

    expect($plan['status'])->toBe('ready')
        ->and($plan['source'])->toHaveCount(3)
        ->and($plan['current'])->toBe([])
        ->and($plan['default_mode'])->toBe('replace');
});

test('apply downloads the chosen images in click order, skips non-images and unknown URLs, fills pimage, audits, no auto-sync', function () {
    Event::fake([ProductDataChanged::class]);

    $result = $this->images->apply($this->product, $this->listing->load('shop'), $this->detail,
        ['https://cdn.test/b.png', 'https://cdn.test/a.png', 'https://cdn.test/not-image', 'https://evil.test/x.png'], 'replace', $this->user);

    expect($result['written'])->toBe(2)
        ->and($result['failed'])->toBe(['https://cdn.test/not-image', 'https://evil.test/x.png']);
    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'evil.test'));

    $paths = json_decode(($this->value)($this->gallery), true);
    expect($paths)->toHaveCount(2)
        ->and(($this->value)($this->single))->toBe($paths[0])
        ->and(AuditLog::where('event', 'marketplace_listing_images_imported')->count())->toBe(1);
    foreach ($paths as $path) {
        Storage::disk('public')->assertExists($path);
    }
    Event::assertDispatched(ProductDataChanged::class, fn ($e) => $e->skipMarketplaceAutoSync === true);

    // append keeps the existing images first; pimage is not overwritten
    $this->images->apply($this->product, $this->listing, $this->detail, ['https://cdn.test/a.png'], 'append', $this->user);
    $appended = json_decode(($this->value)($this->gallery), true);
    expect($appended)->toHaveCount(3)
        ->and(array_slice($appended, 0, 2))->toBe($paths)
        ->and(($this->value)($this->single))->toBe($paths[0])
        ->and($this->images->plan($this->product, $this->detail, $this->user)['default_mode'])->toBe('append');
});
