<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\ProductCategoryLinker;
use Illuminate\Console\Command;

/**
 * One-off backfill for products that existed before ProductRowImporter
 * started auto-linking the categories tree from pcatname/psubcatname/
 * productgroupname on import — see ProductCategoryLinker for why this
 * matching works (categories.code mirrors the ERP coding scheme).
 */
class LinkProductCategoriesFromCodes extends Command
{
    protected $signature = 'app:link-product-categories-from-codes';

    protected $description = 'Backfill product_category tree links from existing pcatname/psubcatname/productgroupname attribute values';

    public function handle(): int
    {
        $attributeIds = Attribute::whereIn('code', ['pcatname', 'psubcatname', 'productgroupname'])
            ->pluck('id', 'code');

        if ($attributeIds->isEmpty()) {
            $this->error('None of pcatname/psubcatname/productgroupname exist as attributes.');
            return self::FAILURE;
        }

        $valuesByProduct = ProductValue::whereIn('attribute_id', $attributeIds)
            ->whereNull('channel_id')
            ->whereNull('locale_id')
            ->get(['product_id', 'attribute_id', 'value'])
            ->groupBy('product_id');

        $products = Product::whereIn('id', $valuesByProduct->keys())->get(['id', 'sku']);
        $linked = 0;

        $this->withProgressBar($products, function (Product $product) use ($valuesByProduct, &$linked) {
            $codes = $valuesByProduct->get($product->id, collect())->pluck('value')->all();
            $before = $product->categories()->count();

            ProductCategoryLinker::linkFromCodes($product, $codes);

            if ($product->categories()->count() > $before) {
                $linked++;
            }
        });

        $this->newLine(2);
        $this->info("Checked {$products->count()} product(s), linked {$linked} that had no matching category before.");

        return self::SUCCESS;
    }
}
