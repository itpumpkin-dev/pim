<?php

use App\Http\Controllers\Catalog\ProductController;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Product;
use App\Models\ProductValue;
use Illuminate\Http\Request;

/**
 * masterCategoryImpact() — หน้าแก้ไขสินค้าถามก่อนบันทึกว่าการเปลี่ยนหมวดหมู่จะกระทบแอตทริบิวต์อย่างไร
 */
function impactFixture(): array
{
    $group = AttributeGroup::create(['code' => 'mci_group_'.uniqid()]);
    $oldAttr = Attribute::create(['code' => 'mci_old_'.uniqid(), 'type' => 'text']);
    $newAttr = Attribute::create(['code' => 'mci_new_'.uniqid(), 'type' => 'text', 'is_required' => true]);
    $oldFamily = AttributeFamily::create(['code' => 'mci_oldfam_'.uniqid(), 'name' => 'Old family']);
    $newFamily = AttributeFamily::create(['code' => 'mci_newfam_'.uniqid(), 'name' => 'New family']);
    FamilyAttribute::create(['family_id' => $oldFamily->id, 'attribute_id' => $oldAttr->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);
    FamilyAttribute::create(['family_id' => $newFamily->id, 'attribute_id' => $newAttr->id, 'attribute_group_id' => $group->id, 'sort_order' => 0]);

    $oldCat = Category::create(['code' => 'mci_oldcat_'.uniqid(), 'name' => 'Old']);
    $newCat = Category::create(['code' => 'mci_newcat_'.uniqid(), 'name' => 'New']);
    DB::table('category_attribute_family')->insert([
        ['category_id' => $oldCat->id, 'family_id' => $oldFamily->id, 'sort_order' => 0],
        ['category_id' => $newCat->id, 'family_id' => $newFamily->id, 'sort_order' => 0],
    ]);

    $product = Product::create(['sku' => 'MCI-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach($oldCat->id);
    ProductValue::create(['product_id' => $product->id, 'attribute_id' => $oldAttr->id, 'attribute_group_id' => $group->id, 'value' => 'filled']);

    return compact('product', 'oldCat', 'newCat', 'oldFamily', 'newFamily');
}

test('reports removed/added families, hidden filled fields and new required fields', function () {
    ['product' => $product, 'newCat' => $newCat, 'oldFamily' => $oldFamily, 'newFamily' => $newFamily] = impactFixture();

    $data = app(ProductController::class)
        ->masterCategoryImpact(Request::create('/', 'GET', ['codes' => [$newCat->code]]), $product)
        ->getData(true);

    expect($data['changes_families'])->toBeTrue();
    expect(collect($data['removed_families'])->pluck('id')->all())->toBe([$oldFamily->id]);
    expect(collect($data['added_families'])->pluck('id')->all())->toBe([$newFamily->id]);
    expect($data['hidden_filled_count'])->toBe(1);
    expect($data['new_required_empty_count'])->toBe(1);
});

test('reports no change when the families stay the same', function () {
    ['product' => $product, 'oldCat' => $oldCat] = impactFixture();

    $data = app(ProductController::class)
        ->masterCategoryImpact(Request::create('/', 'GET', ['codes' => [$oldCat->code]]), $product)
        ->getData(true);

    expect($data['changes_families'])->toBeFalse();
    expect($data['hidden_filled_count'])->toBe(0);
});
