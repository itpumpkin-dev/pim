<?php

use App\Models\AttributeFamily;
use App\Models\Category;
use App\Models\Product;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;

/**
 * ลำดับตระกูลของสินค้าที่ผูกหลายระดับ (หมวดหมู่ → หมวดหมู่ย่อย → กลุ่มสินค้า) —
 * ลำดับที่ตั้งไว้ในกลุ่มสินค้า (หมวดหมู่ที่ลึกที่สุด) ต้องเป็นหลักเสมอ แม้หมวดหมู่แม่
 * จะผูกตระกูลไว้ด้วย sort_order ที่ชนกัน
 */
test('the product group family order wins over families linked to parent categories', function () {
    $base = AttributeFamily::create(['code' => 'efo_base_'.uniqid(), 'name' => 'Base']);
    $spec = AttributeFamily::create(['code' => 'efo_spec_'.uniqid(), 'name' => 'Spec']);

    $root = Category::create(['code' => 'efo_root_'.uniqid(), 'name' => 'Root']);
    $sub = Category::create(['code' => 'efo_sub_'.uniqid(), 'name' => 'Sub', 'parent_id' => $root->id]);
    $group = Category::create(['code' => 'efo_group_'.uniqid(), 'name' => 'Group', 'parent_id' => $sub->id]);

    // กลุ่มสินค้า: พื้นฐาน (0) → สเปค (1)
    DB::table('category_attribute_family')->insert([
        ['category_id' => $group->id, 'family_id' => $base->id, 'sort_order' => 0],
        ['category_id' => $group->id, 'family_id' => $spec->id, 'sort_order' => 1],
    ]);
    // หมวดหมู่ย่อยผูก "สเปค" ไว้ที่ sort_order 0 ด้วย — ชนกับ "พื้นฐาน" ของกลุ่มสินค้า
    DB::table('category_attribute_family')->insert(['category_id' => $sub->id, 'family_id' => $spec->id, 'sort_order' => 0]);

    $product = Product::create(['sku' => 'EFO-'.uniqid(), 'type' => 'simple', 'enabled' => false]);
    $product->categories()->attach([$root->id, $sub->id, $group->id]);

    expect(app(EffectiveFamilyAttributeResolver::class)->effectiveFamilyIds($product))->toBe([$base->id, $spec->id]);
});

test('a product with no categories has no effective families', function () {
    $product = Product::create(['sku' => 'EFO-NONE-'.uniqid(), 'type' => 'simple', 'enabled' => false]);

    expect(app(EffectiveFamilyAttributeResolver::class)->effectiveFamilyIds($product))->toBe([]);
});
