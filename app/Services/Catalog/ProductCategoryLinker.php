<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductValue;

/**
 * Bridges the two parallel category systems: ERP imports only ever set the
 * flat pcatname/psubcatname/productgroupname attribute values, never the
 * `categories` tree (product_category pivot) that Lazada category mapping
 * and the Edit Product tree picker rely on. categories.code happens to use
 * the exact same coding scheme as those attribute values (e.g. 'a025001'),
 * so this links products into the tree by matching on that code.
 */
class ProductCategoryLinker
{
    /** attribute code => how many ancestor-chain levels deep (0 = root) it represents */
    private const LEGACY_CODE_LEVELS = [
        'pcatid' => 0,
        'pcatname' => 0,
        'psubcatname' => 1,
        'productgroupname' => 2,
    ];

    /**
     * Additive only — never removes a category link, since an admin may
     * have manually curated the tree (e.g. cross-listed in an extra
     * category) beyond what the ERP codes alone would produce.
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
     * Reverse of linkFromCodes(): the `categories` tree is now the single
     * place an admin picks a category on the Edit Product page (the old
     * pcatid/pcatname/psubcatname/productgroupname dropdowns were dropped
     * from the form to stop double entry), so whenever the tree assignment
     * changes this derives those legacy attribute values back from it —
     * every existing consumer that still reads them (ProductPresenter's
     * fallback, WooCommerce export, Lazada mapping) keeps working unchanged.
     *
     * Authoritative, not additive: an admin clearing a product's categories
     * clears the derived codes too, so a product never ends up advertising a
     * category it's no longer tagged with.
     */
    public static function deriveLegacyCodesFromCategories(Product $product, array $categoryIds): void
    {
        $attributeIds = Attribute::whereIn('code', array_keys(self::LEGACY_CODE_LEVELS))->pluck('id', 'code');
        if ($attributeIds->isEmpty()) {
            return;
        }

        $chain = self::deepestAncestorChain($categoryIds);

        foreach (self::LEGACY_CODE_LEVELS as $attributeCode => $level) {
            $attributeId = $attributeIds->get($attributeCode);
            if (!$attributeId) {
                continue;
            }

            $category = $chain[$level] ?? null;
            $code = $category ? strtolower(trim($category->code)) : null;

            // Only write a code that's actually a valid option for this
            // attribute (e.g. a category created by hand after the CSV seed,
            // with no matching pcatname/psubcatname/productgroupname option,
            // should leave the field unset rather than store an orphan code).
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
     * Among the product's assigned categories, picks the most specific one
     * (longest `code`, ties broken by lowest id for determinism) and returns
     * its root-to-leaf ancestor chain, indexed by depth (0 = root). The tree
     * is only 3 levels deep and small (~1,000 rows), so loading it whole is
     * simpler than walking parent_id with per-level queries — same tradeoff
     * ProductPresenter::rootCategoryNames() makes.
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
