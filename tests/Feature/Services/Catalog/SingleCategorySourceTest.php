<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\ImportConfig;
use App\Models\Product;
use App\Models\ProductValue;
use App\Rules\UniqueCategoryCode;
use App\Services\ImportExport\Importers\ProductRowImporter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * DB cleanup Phase 3b-2 — product_category is the only category store: every write goes through
 * ProductCategoryLinker::assignCategory() (one chain per product) and the four code attributes follow it.
 */
function scsAttributes(): array
{
    $sources = ['pcatid' => 'categories', 'pcatname' => 'categories', 'psubcatname' => 'subcategories', 'productgroupname' => 'product_groups'];
    $attributes = [];
    foreach ($sources as $code => $source) {
        $attributes[$code] = Attribute::firstOrCreate(['code' => $code], ['type' => 'select', 'master_source' => $source]);
    }

    return $attributes;
}

/** root → sub → group; category saves mirror the codes into the attributes' options */
function scsChain(string $prefix, ?Category $root = null): array
{
    scsAttributes();
    $root ??= Category::create(['code' => "{$prefix}", 'name' => $prefix]);
    $sub = Category::create(['code' => "{$prefix}01", 'name' => "{$prefix}01", 'parent_id' => $root->id]);
    $group = Category::create(['code' => "{$prefix}01001", 'name' => "{$prefix}01001", 'parent_id' => $sub->id]);

    return [$root, $sub, $group];
}

function scsCodes(Product $product): array
{
    return ProductValue::where('product_id', $product->id)->join('attributes', 'attributes.id', '=', 'product_values.attribute_id')
        ->whereIn('attributes.code', ['pcatid', 'pcatname', 'psubcatname', 'productgroupname'])
        ->pluck('product_values.value', 'attributes.code')->sortKeys()->all();
}

function scsLinks(Product $product): array
{
    return $product->categories()->pluck('categories.code')->sort()->values()->all();
}

function scsProduct(): Product
{
    return Product::create(['sku' => 'SCS-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
}

test('the Master Categories panel replaces the whole chain and derives the four codes', function () {
    [$r1, $s1, $g1] = scsChain('qa');
    [, , $g2] = scsChain('qb');
    $product = scsProduct();
    $product->categories()->attach([$r1->id, $s1->id, $g1->id]);

    app(ProductController::class)->updateMasterCategories(
        Request::create("/catalog/products/{$product->id}/master-categories", 'PUT', ['pcatname' => 'qb', 'psubcatname' => 'qb01', 'productgroupname' => 'qb01001']),
        $product,
    );

    expect(scsLinks($product))->toBe(['qb', 'qb01', 'qb01001']);
    expect(scsCodes($product))->toBe(['pcatid' => 'qb', 'pcatname' => 'qb', 'productgroupname' => 'qb01001', 'psubcatname' => 'qb01']);
});

test('the Master Categories panel rejects a code shared by two categories that differ only by case', function () {
    scsAttributes();
    Category::create(['code' => 'qc', 'name' => 'lower']);
    Category::create(['code' => 'QC', 'name' => 'upper']);
    DB::table('attribute_options')->insertOrIgnore(['attribute_id' => Attribute::where('code', 'pcatname')->value('id'), 'code' => 'qc', 'sort_order' => 0, 'is_active' => true, 'is_customized' => false]);
    $product = scsProduct();

    expect(fn () => app(ProductController::class)->updateMasterCategories(
        Request::create("/catalog/products/{$product->id}/master-categories", 'PUT', ['pcatname' => 'qc']),
        $product,
    ))->toThrow(ValidationException::class);
    expect(scsLinks($product))->toBe([]);
});

test('import replaces the category instead of adding to it', function () {
    [$r1, $s1, $g1] = scsChain('qd');
    scsChain('qe');
    $product = scsProduct();
    $product->categories()->attach([$r1->id, $s1->id, $g1->id]);
    $config = ImportConfig::create(['code' => 'scs_'.uniqid(), 'type' => 'products', 'file_format' => 'csv', 'field_separator' => ',', 'action' => 'create_update', 'validation_strategy' => 'skip_errors', 'ai_translate' => false, 'allowed_errors' => 10]);

    (new ProductRowImporter)->importRow(['sku' => $product->sku, 'type' => 'simple', 'enabled' => '0', 'productgroupname' => 'qe01001'], $config);

    expect(scsLinks($product))->toBe(['qe', 'qe01', 'qe01001']);
    expect(scsCodes($product)['productgroupname'])->toBe('qe01001');
});

test('moving a category to another parent re-links and re-derives its products', function () {
    [, , $group] = scsChain('qf');
    [, $otherSub] = scsChain('qg');
    $product = scsProduct();
    app(ProductController::class)->updateMasterCategories(
        Request::create("/catalog/products/{$product->id}/master-categories", 'PUT', ['productgroupname' => 'qf01001']),
        $product,
    );

    $group->update(['parent_id' => $otherSub->id]);

    expect(scsLinks($product))->toBe(['qf01001', 'qg', 'qg01']);
    expect(scsCodes($product))->toBe(['pcatid' => 'qg', 'pcatname' => 'qg', 'productgroupname' => 'qf01001', 'psubcatname' => 'qg01']);
});

test('deleting a category re-derives the codes of its products from what is left', function () {
    [, , $group] = scsChain('qh');
    $product = scsProduct();
    app(ProductController::class)->updateMasterCategories(
        Request::create("/catalog/products/{$product->id}/master-categories", 'PUT', ['productgroupname' => 'qh01001']),
        $product,
    );

    $group->delete();

    expect(scsLinks($product))->toBe(['qh', 'qh01']);
    expect(scsCodes($product))->toBe(['pcatid' => 'qh', 'pcatname' => 'qh', 'psubcatname' => 'qh01']);
});

test('the marketplace "assign category" endpoint links the whole chain', function () {
    [, , $group] = scsChain('qi');
    $product = scsProduct();

    app(ProductController::class)->assignCategory(
        Request::create("/catalog/products/{$product->id}/assign-category", 'POST', ['category_id' => $group->id]),
        $product,
    );

    expect(scsLinks($product))->toBe(['qi', 'qi01', 'qi01001']);
});

test('a new category code must differ from existing ones by more than case', function () {
    Category::create(['code' => 'l001x', 'name' => 'existing']);

    expect(Validator::make(['code' => 'L001X'], ['code' => [new UniqueCategoryCode]])->fails())->toBeTrue();
    expect(Validator::make(['code' => 'l001y'], ['code' => [new UniqueCategoryCode]])->fails())->toBeFalse();
});

test('changing the category with the main Save records it and fires ProductDataChanged', function () {
    \Illuminate\Support\Facades\Event::fake([\App\Events\ProductDataChanged::class]);
    $attributes = scsAttributes();
    [$r1, $s1, $g1] = scsChain('qj');
    scsChain('qk');
    $product = scsProduct();
    $product->categories()->attach([$r1->id, $s1->id, $g1->id]);

    app(ProductController::class)->update(Request::create("/catalog/products/{$product->id}", 'PUT', [
        'sku' => $product->sku,
        'type' => 'simple',
        'enabled' => false,
        'category_ids' => [$r1->id, $s1->id, $g1->id],
        'values' => [$attributes['productgroupname']->id => ['ungrouped' => ['global' => ['default' => 'qk01001']]]],
    ]), $product);

    expect(scsLinks($product))->toBe(['qk', 'qk01', 'qk01001']);
    expect(\App\Models\AuditLog::where('auditable_id', $product->id)->where('event', 'categories_updated')->exists())->toBeTrue();
    \Illuminate\Support\Facades\Event::assertDispatched(\App\Events\ProductDataChanged::class);
});
