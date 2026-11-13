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
use Illuminate\Validation\ValidationException;

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

// --- gallery editor (saveGallery) ---

function liisPng(int $w, int $h): string
{
    $img = imagecreatetruecolor($w, $h);
    ob_start();
    imagepng($img);

    return (string) ob_get_clean();
}

function liisSeedGallery($test, array $paths): void
{
    foreach ($paths as $path) {
        Storage::disk('public')->put($path, 'x');
    }
    ProductValue::create([
        'product_id' => $test->product->id, 'attribute_id' => $test->gallery->id, 'attribute_group_id' => $test->group->id,
        'channel_id' => null, 'locale_id' => null, 'value' => json_encode($paths),
    ]);
}

test('gallery reports the current PIM gallery without needing a listing', function () {
    liisSeedGallery($this, ['product-attributes/one.png', 'product-attributes/two.png']);

    $state = $this->images->gallery($this->product, $this->user);

    expect($state['status'])->toBe('ready')
        ->and($state['attribute_id'])->toBe($this->gallery->id)
        ->and($state['max'])->toBe(ListingImageImportService::MAX_IMAGES)
        ->and(array_column($state['current'], 'path'))->toBe(['product-attributes/one.png', 'product-attributes/two.png']);
});

test('saveGallery reorders, removes and adds uploaded images, audits, no auto-sync', function () {
    Event::fake([ProductDataChanged::class]);
    liisSeedGallery($this, ['product-attributes/one.png', 'product-attributes/two.png', 'product-attributes/three.png']);
    Storage::disk('public')->put('product-attributes/new.png', liisPng(300, 300)); // as uploadAttributeFile() leaves it

    $this->images->saveGallery($this->product, ['product-attributes/three.png', 'product-attributes/new.png', 'product-attributes/one.png'], $this->user);

    expect(json_decode(($this->value)($this->gallery), true))->toBe(['product-attributes/three.png', 'product-attributes/new.png', 'product-attributes/one.png'])
        ->and(AuditLog::where('event', 'product_gallery_edited')->count())->toBe(1);
    Event::assertDispatched(ProductDataChanged::class, fn ($e) => $e->skipMarketplaceAutoSync === true);
});

test('saveGallery rejects a path that is neither in the gallery nor an existing upload', function () {
    liisSeedGallery($this, ['product-attributes/one.png']);

    $this->images->saveGallery($this->product, ['product-attributes/one.png', 'product-attributes/missing.png'], $this->user);
})->throws(ValidationException::class);

test('saveGallery rejects a path outside the upload dir', function () {
    Storage::disk('public')->put('secret/file.png', 'x');

    $this->images->saveGallery($this->product, ['secret/file.png'], $this->user);
})->throws(ValidationException::class);

test('saveGallery rejects more than MAX_IMAGES images', function () {
    $paths = array_map(fn ($i) => "product-attributes/p{$i}.png", range(1, ListingImageImportService::MAX_IMAGES + 1));
    foreach ($paths as $p) {
        Storage::disk('public')->put($p, 'x');
    }

    $this->images->saveGallery($this->product, $paths, $this->user);
})->throws(ValidationException::class);

test('saveGallery with an empty list clears the gallery', function () {
    liisSeedGallery($this, ['product-attributes/one.png']);

    $this->images->saveGallery($this->product, [], $this->user);

    expect(($this->value)($this->gallery))->toBeNull();
});

test('gallery reports pixel size and bytes for each image (for the per-platform image checks)', function () {
    Storage::disk('public')->put('product-attributes/px.png', $this->png);
    ProductValue::create([
        'product_id' => $this->product->id, 'attribute_id' => $this->gallery->id, 'attribute_group_id' => $this->group->id,
        'channel_id' => null, 'locale_id' => null, 'value' => json_encode(['product-attributes/px.png']),
    ]);

    $image = $this->images->gallery($this->product, $this->user)['current'][0];

    expect($image['width'])->toBe(1)->and($image['height'])->toBe(1)->and($image['bytes'])->toBe(strlen($this->png));
});

test('apply refuses an append that would push the gallery past MAX_IMAGES, before downloading anything', function () {
    $paths = array_map(fn ($i) => "product-attributes/p{$i}.png", range(1, ListingImageImportService::MAX_IMAGES - 1));
    liisSeedGallery($this, $paths);

    $this->images->apply($this->product, $this->listing->load('shop'), $this->detail, ['https://cdn.test/a.png', 'https://cdn.test/b.png'], 'append', $this->user);
})->throws(ValidationException::class, 'ต่อท้ายได้อีก 1 รูป');

test('saveGallery rejects a new upload that is not a real image', function () {
    Storage::disk('public')->put('product-attributes/doc.png', '%PDF-1.4 not an image');

    $this->images->saveGallery($this->product, ['product-attributes/doc.png'], $this->user);
})->throws(ValidationException::class);

test('saveGallery rejects a new upload smaller than 300px', function () {
    Storage::disk('public')->put('product-attributes/tiny.png', liisPng(120, 120));

    $this->images->saveGallery($this->product, ['product-attributes/tiny.png'], $this->user);
})->throws(ValidationException::class);

test('saveGallery rejects an old file in the upload dir (e.g. another product image)', function () {
    Storage::disk('public')->put('product-attributes/old.png', liisPng(300, 300));
    touch(Storage::disk('public')->path('product-attributes/old.png'), time() - 3 * 24 * 3600);

    $this->images->saveGallery($this->product, ['product-attributes/old.png'], $this->user);
})->throws(ValidationException::class);
