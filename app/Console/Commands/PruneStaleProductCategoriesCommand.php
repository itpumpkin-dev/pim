<?php

namespace App\Console\Commands;

use App\Models\Attribute;
use App\Models\AuditLog;
use App\Models\Product;
use App\Services\Catalog\ProductCategoryLinker;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Cleans up products left inconsistent by the old Edit Product form:
 *
 *  1. Stale category links — changing the category / sub-category / product
 *     group only ever detached the category replaced in THAT save, so a
 *     product changed more than once (or changed through the main Save while
 *     the locale-row bug below was live) stayed linked to old product groups
 *     too, and the edit page kept showing those groups' attribute families.
 *     See ProductCategoryLinker::staleCategoryIds() for what counts as stale.
 *
 *  2. Locale-keyed pcatname/psubcatname/productgroupname rows — the form used
 *     to write these under the editing locale while category linking read the
 *     locale-less row. Rows equal to the locale-less value are just dropped;
 *     rows that DIFFER are only reported, since which one the user meant can't
 *     be known — open the product, pick the right value, and save.
 *
 * Dry run by default; pass --apply to write.
 */
class PruneStaleProductCategoriesCommand extends Command
{
    protected $signature = 'catalog:prune-stale-product-categories {--apply : Actually detach / delete (default is a dry run)}';

    protected $description = 'Detach category links that no longer match a product\'s category / sub-category / product group, and drop leftover locale-keyed copies of those values';

    private const CODES = ['pcatname', 'psubcatname', 'productgroupname'];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $attributeIds = Attribute::whereIn('code', self::CODES)->pluck('id');
        if ($attributeIds->isEmpty()) {
            $this->warn('No pcatname/psubcatname/productgroupname attributes found.');

            return self::SUCCESS;
        }

        $codesByProduct = DB::table('product_values')
            ->whereIn('attribute_id', $attributeIds)
            ->whereNull('channel_id')->whereNull('locale_id')
            ->get(['product_id', 'value'])
            ->groupBy('product_id')
            ->map(fn ($rows) => $rows->pluck('value')->filter(fn ($v) => is_string($v) && $v !== '')->values()->all());

        // ---------------------------------------------------------------- 1. stale category links
        $affected = 0;
        $detachedTotal = 0;
        $samples = [];
        foreach ($codesByProduct as $productId => $codes) {
            $product = Product::find($productId);
            if (! $product || empty($codes)) {
                continue;
            }
            $stale = ProductCategoryLinker::staleCategoryIds($product, $codes);
            if (empty($stale)) {
                continue;
            }
            $affected++;
            $detachedTotal += count($stale);
            if (count($samples) < 10) {
                $samples[] = [$product->sku, implode(', ', $codes), DB::table('categories')->whereIn('id', $stale)->pluck('code')->implode(', ')];
            }
            if ($apply) {
                $before = $product->categories()->pluck('categories.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
                $product->categories()->detach($stale);
                $after = $product->categories()->pluck('categories.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
                AuditLog::record('categories_updated', $product, ['category_ids' => $before], ['category_ids' => $after]);
            }
        }

        $this->info(($apply ? 'Detached' : 'Would detach')." {$detachedTotal} stale category link(s) from {$affected} product(s).");
        if ($samples) {
            $this->table(['SKU', 'Chosen codes', 'Stale categories'], $samples);
        }

        // ---------------------------------------------------------------- 2. locale-keyed copies
        $localeRows = DB::table('product_values')
            ->whereIn('attribute_id', $attributeIds)
            ->whereNull('channel_id')
            ->whereNotNull('locale_id')
            ->get(['id', 'product_id', 'attribute_id', 'value']);

        $canonical = DB::table('product_values')
            ->whereIn('attribute_id', $attributeIds)
            ->whereNull('channel_id')->whereNull('locale_id')
            ->get(['product_id', 'attribute_id', 'value'])
            ->keyBy(fn ($r) => $r->product_id.'|'.$r->attribute_id);

        $sameIds = [];
        $conflicts = [];
        foreach ($localeRows as $row) {
            $base = $canonical->get($row->product_id.'|'.$row->attribute_id);
            if ($base && (string) $base->value === (string) $row->value) {
                $sameIds[] = $row->id;
            } else {
                $conflicts[] = [$row->product_id, $row->attribute_id, $row->value, $base->value ?? '—'];
            }
        }

        if ($apply && $sameIds) {
            DB::table('product_values')->whereIn('id', $sameIds)->delete();
        }
        $this->info(($apply ? 'Deleted' : 'Would delete').' '.count($sameIds).' redundant locale-keyed value row(s).');
        if ($conflicts) {
            $this->warn(count($conflicts).' locale-keyed value(s) differ from the saved value — left untouched; open each product, pick the right value and save:');
            $this->table(['product_id', 'attribute_id', 'locale value', 'saved value'], array_slice($conflicts, 0, 50));
        }

        if ($apply && ($affected > 0 || $sameIds)) {
            Product::bumpStorefrontVersion();
        }
        if (! $apply) {
            $this->line('Dry run — nothing changed. Re-run with --apply to write.');
        }

        return self::SUCCESS;
    }
}
