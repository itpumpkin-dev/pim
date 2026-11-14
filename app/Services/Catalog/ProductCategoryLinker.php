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

    /** attribute ที่ผู้ใช้/ไฟล์ import ใช้เลือกหมวด เรียงจากลึกสุด (หมวดลึกสุดที่เลือกไว้ชนะ) */
    public const CHOOSER_CODES = ['productgroupname', 'psubcatname', 'pcatname'];

    /**
     * ตั้งหมวดหมู่ของสินค้า — product_category คือที่เก็บหมวดที่เดียว และสินค้า 1 ตัวอยู่ได้สายเดียว
     * (DB cleanup Phase 3b): ผูก root → … → $categoryId ครบทั้งสาย ถอดหมวดอื่นทั้งหมด แล้วคำนวณ
     * pcatid/pcatname/psubcatname/productgroupname ตาม null = ล้างหมวดของสินค้า
     *
     * ทุกจุดที่เปลี่ยนหมวดของสินค้า (หน้าแก้ไข, import, แผง marketplace) ต้องผ่านเมธอดนี้
     *
     * @return array<int, int> id ของสาย root → leaf
     */
    public static function assignCategory(Product $product, ?int $categoryId): array
    {
        $chain = $categoryId ? self::chainIds($categoryId) : [];
        $product->categories()->sync($chain);
        self::deriveLegacyCodesFromCategories($product, $chain);

        return $chain;
    }

    /**
     * หมวดลึกสุดจาก code ที่เลือก (productgroupname > psubcatname > pcatname) — code ใน attribute/option
     * เป็นตัวพิมพ์เล็กเสมอ จึงเทียบกับ categories.code แบบไม่สนตัวพิมพ์ null = ไม่ได้เลือกหมวดเลย
     *
     * @param  array<string, string|null>  $codesByAttribute  attribute code => code ที่เลือก
     * @param  array<int, string>|null  $unknownCodes  ส่ง array มา = code ที่ไม่มีหมวดจริงถูกข้ามแล้วเก็บไว้ในนี้
     *                                                  (import: ใช้ระดับลึกสุดที่หาเจอ + เตือน) ไม่ส่ง = throw
     *
     * @throws \DomainException code ชนกันหลายหมวดเมื่อไม่สนตัวพิมพ์ หรือ code ไม่มีหมวดจริง (เมื่อไม่ส่ง $unknownCodes)
     */
    public static function categoryIdFromCodes(array $codesByAttribute, ?array &$unknownCodes = null): ?int
    {
        foreach (self::CHOOSER_CODES as $attributeCode) {
            $code = trim((string) ($codesByAttribute[$attributeCode] ?? ''));
            if ($code === '') {
                continue;
            }

            $ids = Category::whereRaw('lower(code) = ?', [strtolower($code)])->pluck('id');
            if ($ids->count() > 1) {
                throw new \DomainException("Category code \"{$code}\" matches more than one category (codes differ only by upper/lower case) — give one of them a different code first.");
            }
            if ($ids->isEmpty()) {
                if ($unknownCodes === null) {
                    throw new \DomainException("Category code \"{$code}\" does not exist.");
                }
                $unknownCodes[] = $code;

                continue;
            }

            return (int) $ids->first();
        }

        return null;
    }

    /**
     * @return array<int, int> root → $categoryId
     */
    public static function chainIds(int $categoryId): array
    {
        $chain = [];
        for ($id = $categoryId; $id !== null && ! in_array($id, $chain, true); ) {
            $parentId = Category::whereKey($id)->value('parent_id');
            array_unshift($chain, $id);
            $id = $parentId !== null ? (int) $parentId : null;
        }

        return $chain;
    }

    /**
     * หลังย้าย (parent เปลี่ยน) หรือลบหมวด — ผูกสายของสินค้าในหมวดนั้นใหม่ตามหมวดลึกสุดที่ยังผูกอยู่ แล้ว
     * คำนวณ code ใหม่ (ไม่งั้นสินค้ายังผูกหมวดแม่เดิม และ code ค้างเป็นหมวดที่ถูกลบ/ย้ายไปแล้ว)
     *
     * @param  iterable<int>  $productIds
     */
    public static function resyncProducts(iterable $productIds): void
    {
        foreach (Product::whereIn('id', collect($productIds)->unique()->values())->get() as $product) {
            $leaf = self::deepestAncestorChain($product->categories()->pluck('categories.id')->all());
            self::assignCategory($product, $leaf ? end($leaf)->id : null);
        }
    }

    /**
     * สินค้าที่ผูกกับหมวดนี้หรือหมวดลูกหลานของมัน
     *
     * @return array<int, int>
     */
    public static function productIdsUnder(int $categoryId): array
    {
        return array_map('intval', array_column(\Illuminate\Support\Facades\DB::select(<<<'SQL'
            WITH RECURSIVE sub AS (
                SELECT id FROM categories WHERE id = ?
                UNION SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id)
            SELECT DISTINCT pc.product_id FROM product_category pc JOIN sub ON sub.id = pc.category_id
            SQL, [$categoryId]), 'product_id'));
    }

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
     * หมวดหมู่ที่สินค้าผูกอยู่แต่ "หลุดเส้นทาง" ที่เลือกไว้ใน pcatname/psubcatname/
     * productgroupname ($codes) — ของค้างจากการเปลี่ยนหมวดหมู่รอบก่อนๆ ที่ linkFromCodes()
     * (เพิ่มอย่างเดียว) ไม่เคยถอดออก ทำให้สินค้าอยู่ 2 กลุ่มสินค้าพร้อมกันและได้ตระกูล
     * แอตทริบิวต์ของกลุ่มเก่าปนมาด้วย
     *
     * เก็บไว้ถ้า (1) อยู่ใน $codes หรือ (2) เป็นลูกหลานของรหัสที่ลึกที่สุดใน $codes — กรณีหลัง
     * คือระดับที่ไม่ได้เลือกไว้ (เช่นมีแค่หมวดหมู่ย่อย แต่ import ผูกกลุ่มสินค้าใต้หมวดหมู่ย่อย
     * นั้นไว้) ซึ่งยังสอดคล้องกับเส้นทางเดิม ไม่ใช่ของค้าง
     *
     * @param  array<int, string>  $codes
     * @return array<int, int>
     */
    public static function staleCategoryIds(Product $product, array $codes): array
    {
        $codes = array_values(array_unique(array_filter($codes, fn ($code) => is_string($code) && $code !== '')));
        if (empty($codes)) {
            return [];
        }

        $linkedIds = $product->categories()->pluck('categories.id')->map(fn ($id) => (int) $id)->all();
        if (empty($linkedIds)) {
            return [];
        }

        $parentOf = Category::pluck('parent_id', 'id')->all();
        $chosenIds = Category::whereIn('code', $codes)->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (empty($chosenIds)) {
            return [];
        }

        $depth = function (int $id) use ($parentOf): int {
            $d = 0;
            $seen = [];
            for ($cur = $parentOf[$id] ?? null; $cur !== null && ! isset($seen[$cur]); $cur = $parentOf[$cur] ?? null) {
                $seen[$cur] = true;
                $d++;
            }

            return $d;
        };
        $deepest = collect($chosenIds)->sortByDesc($depth)->first();

        $isDescendantOf = function (int $id, int $ancestor) use ($parentOf): bool {
            $seen = [];
            for ($cur = $parentOf[$id] ?? null; $cur !== null && ! isset($seen[$cur]); $cur = $parentOf[$cur] ?? null) {
                if ((int) $cur === $ancestor) {
                    return true;
                }
                $seen[$cur] = true;
            }

            return false;
        };

        return array_values(array_filter(
            $linkedIds,
            fn (int $id) => ! in_array($id, $chosenIds, true) && ! $isDescendantOf($id, $deepest),
        ));
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
                // ไม่แยกภาษา — แถวรายภาษาที่ค้างจากหน้าแก้ไขรุ่นก่อนต้องไม่เหลือ (ตัวอ่านบางจุดเลือกแถวภาษาก่อน)
                ProductValue::where('product_id', $product->id)->where('attribute_id', $attributeId)->whereNotNull('locale_id')->delete();
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
            // ตัวพิมพ์เล็ก — option ของ master หมวดหมู่ถูกเก็บเป็นตัวพิมพ์เล็กเสมอ (AttributeOptionMirror::normaliseCode)
            // code หมวดหมู่จึงต้องไม่ซ้ำกันแบบไม่สนตัวพิมพ์ (เช่น 'L001' กับ 'l001' จะได้ option เดียวกัน)
            $result[$attributeCode] = $category ? strtolower(trim($category->code)) : null;
        }

        return $result;
    }

    /**
     * จากหมวดหมู่ที่สินค้านี้ถูก assign ไว้ทั้งหมด เลือกหมวดหมู่ที่เจาะจงที่สุด
     * (ลึกที่สุดใน tree ถ้าเท่ากันให้ใช้ id น้อยสุดเพื่อให้ผลลัพธ์คงที่แน่นอน)
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

        // ลึกสุดตามตำแหน่งจริงใน tree (จำนวนหมวดแม่) ไม่ใช่ความยาว code — code ไม่จำเป็นต้องไล่ตามระดับ
        // (หมวดที่ถูกย้าย เช่น a024004 อยู่ใต้ a006 หรือ code ที่ตั้งเอง) ลึกเท่ากันใช้ id น้อยสุดให้ผลคงที่
        $depthOf = function (Category $category) use ($categoriesById): int {
            $depth = 0;
            $seen = [];
            for ($parentId = $category->parent_id; $parentId !== null && ! isset($seen[$parentId]); $parentId = $categoriesById->get($parentId)?->parent_id) {
                $seen[$parentId] = true;
                $depth++;
            }

            return $depth;
        };
        $deepest = collect($categoryIds)
            ->map(fn ($id) => $categoriesById->get($id))
            ->filter()
            ->sort(fn (Category $a, Category $b) => $depthOf($b) <=> $depthOf($a) ?: $a->id <=> $b->id)
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
