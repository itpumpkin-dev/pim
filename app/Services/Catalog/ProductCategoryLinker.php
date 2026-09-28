<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * เชื่อมระบบหมวดหมู่สองระบบที่วิ่งขนานกันอยู่เข้าด้วยกัน: การ import จาก ERP
 * จะตั้งค่าให้แค่ attribute value แบบ flat (pcatname/psubcatname/productgroupname)
 * เท่านั้น ไม่เคยแตะต้นไม้ `categories` (product_category pivot) ที่ระบบจับคู่
 * หมวดหมู่ Lazada และตัวเลือกต้นไม้หมวดหมู่ในหน้า Edit Product ใช้งานอยู่เลย
 * บังเอิญว่า categories.code ใช้ scheme การเข้ารหัสเดียวกันเป๊ะกับ attribute
 * value พวกนั้น (เช่น 'a025001') คลาสนี้เลยอาศัยจุดนี้เชื่อมสินค้าเข้ากับต้นไม้
 * หมวดหมู่ โดยจับคู่กันที่ code
 */
class ProductCategoryLinker
{
    /** attribute code => ลึกลงไปกี่ level ในสาย ancestor (0 = root) */
    private const LEGACY_CODE_LEVELS = [
        'pcatid' => 0,
        'pcatname' => 0,
        'psubcatname' => 1,
        'productgroupname' => 2,
    ];

    /**
     * เพิ่มอย่างเดียว ไม่มีการลบ — จะไม่มีวันลบการเชื่อมโยงหมวดหมู่ทิ้ง เพราะแอดมิน
     * อาจจะจัดต้นไม้เอาไว้เองด้วยมือ (เช่น ตั้งใจให้อยู่หลายหมวดหมู่พร้อมกัน)
     * มากกว่าที่ code จาก ERP อย่างเดียวจะสร้างให้ได้
     */
    public static function linkFromCodes(Product $product, array $codes): void
    {
        $codes = array_values(array_unique(array_filter($codes, fn ($code) => is_string($code) && $code !== '')));
        if (empty($codes)) {
            return;
        }

        $categoryIds = Category::whereIn('code', $codes)->pluck('id');
        if ($categoryIds->isEmpty()) {
            return;
        }

        $product->categories()->syncWithoutDetaching($categoryIds);
    }

    /**
     * ทำงานตรงข้ามกับ linkFromCodes(): ตอนนี้ต้นไม้ `categories` คือที่เดียวที่
     * แอดมินใช้เลือกหมวดหมู่ในหน้า Edit Product (dropdown เก่าอย่าง
     * pcatid/pcatname/psubcatname/productgroupname ถูกเอาออกจากฟอร์มไปแล้ว
     * เพื่อไม่ให้ต้องกรอกซ้ำซ้อน) ดังนั้นทุกครั้งที่การ assign หมวดหมู่ในต้นไม้
     * เปลี่ยนไป เมธอดนี้จะคำนวณค่า attribute แบบเก่ากลับมาจากต้นไม้ให้ — ทำให้ทุก
     * ส่วนที่ยังอ่านค่าพวกนี้อยู่ (fallback ของ ProductPresenter, การ export
     * WooCommerce, การจับคู่ Lazada) ยังทำงานได้ตามปกติโดยไม่ต้องแก้อะไร
     *
     * เป็นตัวกำหนดค่าจริง ไม่ใช่แค่เพิ่ม: ถ้าแอดมินล้างหมวดหมู่ของสินค้าออก
     * code ที่คำนวณไว้ก็จะถูกล้างตามไปด้วย เพื่อไม่ให้สินค้าไปโฆษณาว่าอยู่ใน
     * หมวดหมู่ที่จริงๆ แล้วไม่ได้ถูก tag ไว้แล้ว
     */
    public static function deriveLegacyCodesFromCategories(Product $product, array $categoryIds): void
    {
        $attributeIds = Attribute::whereIn('code', array_keys(self::LEGACY_CODE_LEVELS))->pluck('id', 'code');
        if ($attributeIds->isEmpty()) {
            return;
        }

        $codesByAttribute = self::legacyCodesFromCategories($categoryIds);

        foreach (self::LEGACY_CODE_LEVELS as $attributeCode => $level) {
            $attributeId = $attributeIds->get($attributeCode);
            if (!$attributeId) {
                continue;
            }

            $code = $codesByAttribute[$attributeCode] ?? null;

            // เขียนเฉพาะ code ที่เป็นตัวเลือกที่ใช้ได้จริงของ attribute ตัวนี้เท่านั้น
            // (เช่น หมวดหมู่ที่สร้างขึ้นเองทีหลังจาก CSV seed แล้วไม่มีตัวเลือก
            // pcatname/psubcatname/productgroupname ที่ตรงกัน ก็ควรปล่อยให้ฟิลด์
            // ว่างไว้ ดีกว่าไปเก็บ code ที่ไม่มีที่มาที่ไป)
            $optionExists = $code && AttributeOption::where('attribute_id', $attributeId)->where('code', $code)->exists();

            if ($optionExists) {
                ProductValue::updateOrCreate(
                    ['product_id' => $product->id, 'attribute_id' => $attributeId, 'channel_id' => null, 'locale_id' => null],
                    ['value' => $code]
                );
            } else {
                ProductValue::where('product_id', $product->id)->where('attribute_id', $attributeId)->delete();
            }
        }
    }

    /**
     * เหมือน deriveLegacyCodesFromCategories() เป๊ะๆ แต่แค่คำนวณ ไม่เขียนอะไรลง
     * DB เลย — ให้ ProductController::buildProductFormProps() ใช้เป็น fallback
     * ตอนโหลดหน้า Edit Product (GET request ล้วนๆ ไม่ควรมี side effect เขียน DB)
     * สำหรับสินค้าที่ต้นไม้ categories (product_category pivot) ถูก assign ไว้
     * แล้วจริง แต่ ProductValue ของ pcatname/psubcatname/productgroupname ยังไม่
     * เคยถูกเขียนหรือค้างอยู่ (เช่น pivot ถูก sync มาจากที่อื่นที่ไม่ผ่าน
     * updateMasterCategories()/update() ที่เรียก deriveLegacyCodesFromCategories()
     * จริงๆ ให้) ไม่งั้น dropdown ของ 3 ฟิลด์นี้จะโชว์ว่างทั้งที่มีหมวดหมู่ที่
     * assign ไว้จริงอยู่ ค่าที่ fallback ตรงนี้จะถูกเขียนถาวรตอนแอดมินกด Save
     * (ปุ่มไหนก็ได้ที่ท้ายสุดเรียก deriveLegacyCodesFromCategories() จริง)
     *
     * @param  array<int, int>  $categoryIds
     * @return array<string, string|null> attribute code => code ที่ควรจะเป็น
     */
    public static function legacyCodesFromCategories(array $categoryIds): array
    {
        $chain = self::deepestAncestorChain($categoryIds);

        $result = [];
        foreach (self::LEGACY_CODE_LEVELS as $attributeCode => $level) {
            $category = $chain[$level] ?? null;
            $result[$attributeCode] = $category ? strtolower(trim($category->code)) : null;
        }

        return $result;
    }

    /**
     * จากหมวดหมู่ที่สินค้านี้ถูก assign ไว้ทั้งหมด เลือกหมวดหมู่ที่เจาะจงที่สุด
     * (code ยาวที่สุด ถ้าเท่ากันให้ใช้ id น้อยสุดเพื่อให้ผลลัพธ์คงที่แน่นอน)
     * แล้วคืนสายบรรพบุรุษของมันตั้งแต่ root ถึง leaf โดย index ตามความลึก
     * (0 = root) ต้นไม้นี้ลึกแค่ 3 level และมีขนาดเล็ก (~1,000 แถว) การโหลดมา
     * ทั้งหมดเลยง่ายกว่าการไล่ parent_id ทีละ query ต่อ level — เป็น tradeoff
     * แบบเดียวกับที่ ProductPresenter::rootCategoryNames() ใช้
     *
     * @return array<int, Category>
     */
    private static function deepestAncestorChain(array $categoryIds): array
    {
        if (empty($categoryIds)) {
            return [];
        }

        $categoriesById = Category::all(['id', 'code', 'parent_id'])->keyBy('id');

        $deepest = collect($categoryIds)
            ->map(fn ($id) => $categoriesById->get($id))
            ->filter()
            ->sort(fn (Category $a, Category $b) => strlen($b->code) <=> strlen($a->code) ?: $a->id <=> $b->id)
            ->first();

        if (!$deepest) {
            return [];
        }

        $chain = [];
        $category = $deepest;
        while ($category) {
            array_unshift($chain, $category);
            $category = $category->parent_id ? $categoriesById->get($category->parent_id) : null;
        }

        return $chain;
    }
}
