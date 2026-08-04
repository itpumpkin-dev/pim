<?php

namespace App\Services\Catalog;

use App\Models\Category;
use App\Models\Product;

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
}
