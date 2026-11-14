<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * Covers pim:normalize-product-categories (DB cleanup Phase 3b-1): product_category is the single
 * source, one chain per product, pcatid/pcatname/psubcatname/productgroupname derived from it.
 */
function npcAttributes(): array
{
    $attributes = [];
    foreach (['pcatid', 'pcatname', 'psubcatname', 'productgroupname'] as $code) {
        $attributes[$code] = Attribute::firstOrCreate(['code' => $code], ['type' => 'select']);
    }

    return $attributes;
}

/** Creates root → sub → group and a matching option on each level's attribute(s). */
function npcChain(string $root, string $sub, string $group): array
{
    $attributes = npcAttributes();
    $r = Category::firstOrCreate(['code' => $root], ['name' => $root]);
    $s = Category::firstOrCreate(['code' => $sub], ['name' => $sub, 'parent_id' => $r->id]);
    $g = Category::firstOrCreate(['code' => $group], ['name' => $group, 'parent_id' => $s->id]);
    foreach ([['pcatid', $root], ['pcatname', $root], ['psubcatname', $sub], ['productgroupname', $group]] as [$attr, $code]) {
        DB::table('attribute_options')->insertOrIgnore(['attribute_id' => $attributes[$attr]->id, 'code' => $code, 'sort_order' => 0, 'is_active' => true, 'is_customized' => false]);
    }

    return [$r, $s, $g];
}

function npcProduct(): Product
{
    return Product::create(['sku' => 'NPC-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
}

function npcCodes(Product $product): array
{
    return ProductValue::where('product_id', $product->id)->join('attributes', 'attributes.id', '=', 'product_values.attribute_id')
        ->whereIn('attributes.code', ['pcatid', 'pcatname', 'psubcatname', 'productgroupname'])
        ->pluck('product_values.value', 'attributes.code')->sortKeys()->all();
}

function npcLinks(Product $product): array
{
    return $product->categories()->pluck('categories.code')->sort()->values()->all();
}

test('a product with codes but no tree links gets the whole chain linked', function () {
    [, , $g] = npcChain('zz', 'zz01', 'zz01001');
    $attributes = npcAttributes();
    $product = npcProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['productgroupname']->id, 'value' => 'zz01001']);

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect(npcLinks($product))->toBe(['zz', 'zz01', 'zz01001']);
    expect(npcCodes($product))->toBe(['pcatid' => 'zz', 'pcatname' => 'zz', 'productgroupname' => 'zz01001', 'psubcatname' => 'zz01']);
});

test('a tree-only product gets its four codes derived, and missing parents are linked', function () {
    [, , $g] = npcChain('zy', 'zy01', 'zy01001');
    $product = npcProduct();
    $product->categories()->attach($g->id); // leaf only — parents missing

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect(npcLinks($product))->toBe(['zy', 'zy01', 'zy01001']);
    expect(npcCodes($product))->toBe(['pcatid' => 'zy', 'pcatname' => 'zy', 'productgroupname' => 'zy01001', 'psubcatname' => 'zy01']);
});

test('a product on two chains keeps the one matching its codes', function () {
    [$r1, $s1, $g1] = npcChain('zx', 'zx01', 'zx01001');
    [$r2, $s2, $g2] = npcChain('zw', 'zw01', 'zw01001');
    $attributes = npcAttributes();
    $product = npcProduct();
    $product->categories()->attach([$r1->id, $s1->id, $g1->id, $r2->id, $s2->id, $g2->id]);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['productgroupname']->id, 'value' => 'zw01001']);

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect(npcLinks($product))->toBe(['zw', 'zw01', 'zw01001']);
});

test('a category whose code clashes with another when case is ignored is left untouched', function () {
    npcChain('zv', 'zv01', 'zv01001');               // lowercase look-alike
    [, , $upper] = npcChain('zv', 'ZV01', 'ZV01001'); // same codes, uppercase — options collapse to the same lowercase code
    $attributes = npcAttributes();
    $product = npcProduct();
    $product->categories()->attach($upper->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['psubcatname']->id, 'value' => 'zv01']);

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect(npcCodes($product))->toBe(['psubcatname' => 'zv01']); // not re-derived — it would point at the look-alike
});

test('codes match categories regardless of case', function () {
    [, , $g] = npcChain('zr', 'ZR01', 'ZR01001');
    $attributes = npcAttributes();
    $product = npcProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['productgroupname']->id, 'value' => 'zr01001']);

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect(npcLinks($product))->toBe(['ZR01', 'ZR01001', 'zr']);
});

test('codes that match no category are left untouched', function () {
    $attributes = npcAttributes();
    $product = npcProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['pcatname']->id, 'value' => 'category_x']);

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect(npcLinks($product))->toBe([]);
    expect(npcCodes($product))->toBe(['pcatname' => 'category_x']);
});

test('values of a newly linked product get the attribute group of its new family', function () {
    [, , $g] = npcChain('zu', 'zu01', 'zu01001');
    $attributes = npcAttributes();
    $spec = Attribute::create(['code' => 'npc_spec', 'type' => 'text']);
    $group = AttributeGroup::create(['code' => 'npc_group']);
    $family = AttributeFamily::create(['code' => 'npc_family', 'name' => 'NPC']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $spec->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);
    DB::table('category_attribute_family')->insert(['category_id' => $g->id, 'family_id' => $family->id, 'sort_order' => 0]);
    $product = npcProduct();
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['productgroupname']->id, 'value' => 'zu01001']);
    $value = ProductValue::create(['product_id' => $product->id, 'attribute_id' => $spec->id, 'value' => '12V']);

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect($value->fresh()->attribute_group_id)->toBe($group->id);
});

test('dry run changes nothing', function () {
    [, , $g] = npcChain('zt', 'zt01', 'zt01001');
    $product = npcProduct();
    $product->categories()->attach($g->id);

    $this->artisan('pim:normalize-product-categories', ['--dry-run' => true])->assertSuccessful();

    expect(npcLinks($product))->toBe(['zt01001']);
    expect(npcCodes($product))->toBe([]);
});

test('a value is kept when its category has no attribute option yet', function () {
    [, , $g] = npcChain('zs', 'zs01', 'zs01001');
    $attributes = npcAttributes();
    DB::table('attribute_options')->where('attribute_id', $attributes['productgroupname']->id)->where('code', 'zs01001')->delete();
    $product = npcProduct();
    $product->categories()->attach($g->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $attributes['productgroupname']->id, 'value' => 'old-code']);

    $this->artisan('pim:normalize-product-categories')->assertSuccessful();

    expect(npcCodes($product)['productgroupname'])->toBe('old-code');
    expect(npcCodes($product)['psubcatname'])->toBe('zs01');
});
