<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductValue;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Controller-level tests for ProductController — this codebase has no
 * precedent for HTTP/route-level (actingAs + permission middleware) tests,
 * so these call store()/update()/duplicate() directly with a hand-built
 * Request, the same way the rest of the suite tests Services directly.
 * $request->user() resolves to null this way (no auth setup), which is
 * harmless — created_by/updated_by/AuditLog all null-safe on a missing user.
 */
function pcController(): ProductController
{
    return app(ProductController::class);
}

test('store trims leading/trailing whitespace from sku before saving', function () {
    $request = Request::create('/catalog/products', 'POST', [
        'sku' => '  SKU-TRIM-ME  ',
        'type' => 'simple',
        'enabled' => false,
    ]);

    pcController()->store($request);

    expect(Product::where('sku', 'SKU-TRIM-ME')->exists())->toBeTrue();
    expect(Product::where('sku', '  SKU-TRIM-ME  ')->exists())->toBeFalse();
});

test('store rejects a sku containing characters outside A-Z, 0-9, dash and underscore', function () {
    $request = Request::create('/catalog/products', 'POST', [
        'sku' => 'SKU WITH SPACE',
        'type' => 'simple',
        'enabled' => false,
    ]);

    expect(fn () => pcController()->store($request))->toThrow(ValidationException::class);
    expect(Product::count())->toBe(0);
});

test('store accepts a sku made only of letters, numbers, dashes and underscores', function () {
    $request = Request::create('/catalog/products', 'POST', [
        'sku' => 'Valid_SKU-123',
        'type' => 'simple',
        'enabled' => false,
    ]);

    pcController()->store($request);

    expect(Product::where('sku', 'Valid_SKU-123')->exists())->toBeTrue();
});

test('update rejects changing sku to a value with disallowed characters', function () {
    $product = Product::create(['sku' => 'ORIGINAL-SKU', 'type' => 'simple', 'enabled' => false]);

    $request = Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'bad sku!',
        'type' => 'simple',
        'enabled' => false,
    ]);

    expect(fn () => pcController()->update($request, $product))->toThrow(ValidationException::class);
    expect($product->fresh()->sku)->toBe('ORIGINAL-SKU');
});

test('update grandfathers a legacy sku that predates the character rule as long as it is left unchanged', function () {
    // สินค้าเก่าที่มี SKU ไม่ตรง pattern ใหม่อยู่แล้ว (สมมติสร้างไว้ก่อนมีกฎนี้)
    $product = Product::create(['sku' => 'LEGACY SKU/OLD', 'type' => 'simple', 'enabled' => false]);

    // Save ปกติที่ฟิลด์ SKU ถูก disabled ไว้ในหน้า UI — ค่าที่ส่งกลับมาเหมือนเดิม
    $request = Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => 'LEGACY SKU/OLD',
        'type' => 'simple',
        'enabled' => true,
    ]);

    pcController()->update($request, $product);

    expect($product->fresh()->enabled)->toBeTrue();
    expect($product->fresh()->sku)->toBe('LEGACY SKU/OLD');
});

test('duplicate as a plain copy carries over attribute values and categories (unchanged existing behavior)', function () {
    $source = Product::create(['sku' => 'SRC-SKU', 'type' => 'simple', 'enabled' => true]);
    $category = Category::create(['code' => 'cat-'.uniqid(), 'name' => 'Test Category']);
    $source->categories()->sync([$category->id]);

    $request = Request::create("/catalog/products/{$source->id}/duplicate", 'POST', ['as_template' => false]);

    pcController()->duplicate($request, $source);

    // CodeGenerator::sequential() ต่อท้ายด้วย "_{n}" เสมอ (ดู app/Services/CodeGenerator.php)
    $duplicate = Product::where('sku', 'like', 'SRC-SKU-copy_%')->firstOrFail();
    expect($duplicate->enabled)->toBeFalse();
    expect($duplicate->categories()->pluck('categories.id')->all())->toBe([$category->id]);
});

test('duplicate as a template ("Save as Template") produces an empty structure with no copied values or categories', function () {
    $source = Product::create(['sku' => 'TEMPLATE-SRC', 'type' => 'simple', 'enabled' => true]);
    $category = Category::create(['code' => 'cat-'.uniqid(), 'name' => 'Test Category']);
    $source->categories()->sync([$category->id]);

    $request = Request::create("/catalog/products/{$source->id}/duplicate", 'POST', ['as_template' => true]);

    pcController()->duplicate($request, $source);

    $template = Product::where('sku', 'like', 'TEMPLATE-SRC-copy_%')->firstOrFail();
    expect($template->enabled)->toBeFalse();
    expect($template->categories()->count())->toBe(0);
    expect(ProductValue::where('product_id', $template->id)->count())->toBe(0);
});

test('update stores multiple videos for a "video" attribute as a JSON array, like gallery', function () {
    Storage::fake('public');

    $product = Product::create(['sku' => 'VIDEO-PRODUCT', 'type' => 'simple', 'enabled' => false]);
    $videoAttr = Attribute::create(['code' => 'promo_video', 'type' => 'video']);

    $file1 = UploadedFile::fake()->create('clip1.mp4', 1024, 'video/mp4');
    $file2 = UploadedFile::fake()->create('clip2.mp4', 1024, 'video/mp4');

    $request = Request::create(
        "/catalog/products/{$product->id}",
        'PUT',
        [
            'sku' => $product->sku,
            'type' => 'simple',
            'enabled' => false,
            'values' => [$videoAttr->id => ['global' => ['default' => []]]],
        ],
        [],
        ['values' => [$videoAttr->id => ['global' => ['default' => [$file1, $file2]]]]]
    );

    pcController()->update($request, $product);

    $stored = ProductValue::where('product_id', $product->id)
        ->where('attribute_id', $videoAttr->id)
        ->value('value');
    $paths = json_decode($stored, true);

    expect($paths)->toBeArray()->toHaveCount(2);
    foreach ($paths as $path) {
        Storage::disk('public')->assertExists($path);
    }
});

test('update rejects more videos than MAX_VIDEO_COUNT (3) for a "video" attribute', function () {
    Storage::fake('public');

    $product = Product::create(['sku' => 'VIDEO-OVERFLOW', 'type' => 'simple', 'enabled' => false]);
    $videoAttr = Attribute::create(['code' => 'promo_video2', 'type' => 'video']);

    $files = collect(range(1, 4))->map(fn ($i) => UploadedFile::fake()->create("clip{$i}.mp4", 512, 'video/mp4'))->all();

    $request = Request::create(
        "/catalog/products/{$product->id}",
        'PUT',
        [
            'sku' => $product->sku,
            'type' => 'simple',
            'enabled' => false,
            'values' => [$videoAttr->id => ['global' => ['default' => []]]],
        ],
        [],
        ['values' => [$videoAttr->id => ['global' => ['default' => $files]]]]
    );

    expect(fn () => pcController()->update($request, $product))->toThrow(ValidationException::class);
    expect(ProductValue::where('product_id', $product->id)->where('attribute_id', $videoAttr->id)->exists())->toBeFalse();
});

test('update removing one of two existing videos deletes only the removed file from storage', function () {
    Storage::fake('public');

    $product = Product::create(['sku' => 'VIDEO-REMOVE-ONE', 'type' => 'simple', 'enabled' => false]);
    $videoAttr = Attribute::create(['code' => 'promo_video3', 'type' => 'video']);

    $keptPath = UploadedFile::fake()->create('kept.mp4', 512, 'video/mp4')->store('product-attributes', 'public');
    $removedPath = UploadedFile::fake()->create('removed.mp4', 512, 'video/mp4')->store('product-attributes', 'public');

    ProductValue::create([
        'product_id' => $product->id,
        'attribute_id' => $videoAttr->id,
        'channel_id' => null,
        'locale_id' => null,
        'value' => json_encode([$keptPath, $removedPath]),
    ]);

    $request = Request::create(
        "/catalog/products/{$product->id}",
        'PUT',
        [
            'sku' => $product->sku,
            'type' => 'simple',
            'enabled' => false,
            'values' => [$videoAttr->id => ['global' => ['default' => [$keptPath]]]],
        ]
    );

    pcController()->update($request, $product);

    Storage::disk('public')->assertExists($keptPath);
    Storage::disk('public')->assertMissing($removedPath);
});
