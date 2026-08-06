<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Maps EAV-backed Product/ProductValue rows to the plain shape the public
 * storefront pages (home, products/show) expect, matching the `Product`
 * interface in resources/js/data/products.ts.
 */
class ProductPresenter
{
    private const CODES = [
        'pname', 'pbrand', 'pcatname', 'pimage',
        'price_std', 'price_recommend',
        'pbaseunit', 'packaging_box', 'unitinfo', 'eol',
        'product_details_features', 'spec_specifications', 'spec_features',
        'spec_accessories', 'spec_packaging', 'warranty_period',
        'how_to_use', 'warnings',
    ];

    /**
     * @param  string  $localeCode  Which locale's ProductValue rows (pname, spec_*, ...)
     *                              to prefer. Defaults to 'th' for the public storefront
     *                              (home, products/show), which is always Thai regardless
     *                              of the visitor's browser — pass app()->getLocale() for
     *                              admin-facing callers (e.g. the dashboard) so the result
     *                              follows whatever language the admin has switched to.
     */
    public static function mapMany(Collection $products, string $localeCode = 'th'): array
    {
        if ($products->isEmpty()) {
            return [];
        }

        $attributesByCode = Attribute::whereIn('code', self::CODES)->get(['id', 'code'])->keyBy('id');

        // Locale-based attributes (pname, spec_*, ...) store one ProductValue
        // row per locale. Only ever display $localeCode, and order null-locale
        // (global) rows before it so a locale-specific row always wins when
        // both exist for the same attribute — otherwise whichever row the DB
        // happens to return last would win at random.
        $defaultLocaleId = Locale::where('code', $localeCode)->value('id');

        $values = ProductValue::whereIn('product_id', $products->pluck('id'))
            ->whereIn('attribute_id', $attributesByCode->keys())
            ->whereNull('channel_id')
            ->where(function ($query) use ($defaultLocaleId) {
                $query->whereNull('locale_id');
                if ($defaultLocaleId) {
                    $query->orWhere('locale_id', $defaultLocaleId);
                }
            })
            ->orderByRaw('CASE WHEN locale_id IS NULL THEN 0 ELSE 1 END ASC')
            ->get(['product_id', 'attribute_id', 'locale_id', 'value']);

        $valuesByProduct = $values->groupBy('product_id')->map(
            fn (Collection $rows) => $rows->mapWithKeys(
                fn (ProductValue $row) => [$attributesByCode[$row->attribute_id]->code => $row->value]
            )
        );

        $valuesByProduct = self::resolvePcatnameLabels($valuesByProduct, $attributesByCode);

        $categoryNamesByProduct = self::rootCategoryNames($products);

        return $products->map(
            fn (Product $product) => self::mapOne(
                $product,
                $valuesByProduct->get($product->id, collect()),
                $categoryNamesByProduct->get($product->id)
            )
        )->values()->all();
    }

    /**
     * `pcatname` is now a select field backed by AttributeOption, whose
     * stored value is the option's `code` (not its label — codes have to be
     * unique per attribute, and several category names collide, so the
     * label can't be the code). Resolve it back to the Thai name here so
     * every consumer of the mapped product still sees a real name instead
     * of a bare code like "a". Values from before this field became a
     * dropdown (plain free-typed text) won't match any option code and pass
     * through unchanged.
     *
     * @return Collection<int, Collection<string, string>>
     */
    private static function resolvePcatnameLabels(Collection $valuesByProduct, Collection $attributesByCode): Collection
    {
        $pcatnameAttributeId = $attributesByCode->search(fn ($attr) => $attr->code === 'pcatname');
        if ($pcatnameAttributeId === false) {
            return $valuesByProduct;
        }

        $labelsByCode = AttributeOption::where('attribute_id', $pcatnameAttributeId)->pluck('admin_label', 'code');

        return $valuesByProduct->map(function (Collection $values) use ($labelsByCode) {
            if ($values->has('pcatname')) {
                $raw = $values->get('pcatname');
                $values = $values->put('pcatname', $labelsByCode->get($raw, $raw));
            }

            return $values;
        });
    }

    /**
     * Real category assignment (product_category pivot) takes precedence
     * over the legacy `pcatname` free-text attribute. Products are typically
     * tagged at the most specific (product-group) level, so this walks each
     * one up to its top-level ancestor — the storefront's category filter
     * shows the ~19 root categories, not hundreds of product groups.
     *
     * @return Collection<int, string> keyed by product id
     */
    private static function rootCategoryNames(Collection $products): Collection
    {
        $assignedCategoryId = DB::table('product_category')
            ->whereIn('product_id', $products->pluck('id'))
            ->get(['product_id', 'category_id'])
            ->groupBy('product_id')
            ->map(fn (Collection $rows) => $rows->first()->category_id);

        if ($assignedCategoryId->isEmpty()) {
            return collect();
        }

        // The tree is only 3 levels deep and small (~1,000 rows) — loading it
        // whole is simpler than walking parent_id with per-level queries.
        $categoriesById = Category::all(['id', 'name', 'parent_id'])->keyBy('id');

        return $assignedCategoryId->map(function (int $categoryId) use ($categoriesById) {
            $category = $categoriesById->get($categoryId);
            while ($category?->parent_id && $categoriesById->has($category->parent_id)) {
                $category = $categoriesById->get($category->parent_id);
            }

            return $category?->name;
        })->filter();
    }

    private static function mapOne(Product $product, Collection $values, ?string $categoryName): array
    {
        $get = fn (string $code) => $values->get($code) ?: null;

        $price = (float) ($get('price_std') ?? $get('price_recommend') ?? 0);

        $specs = array_filter([
            'ข้อมูลจำเพาะ' => self::plainText($get('spec_specifications')),
            'บรรจุภัณฑ์' => self::plainText($get('spec_packaging')),
            'อุปกรณ์เสริม' => self::plainText($get('spec_accessories')),
            'วิธีใช้งาน' => self::plainText($get('how_to_use')),
            'คำเตือน' => self::plainText($get('warnings')),
            'การรับประกัน' => $get('warranty_period') ? $get('warranty_period').' เดือน' : null,
        ]);

        $result = [
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => $get('pname') ?? $product->sku,
            'brand' => $get('pbrand') ?? '-',
            'category' => $categoryName ?? $get('pcatname') ?? 'ทั่วไป',
            'size' => $get('unitinfo') ?? '',
            'packUnit' => $get('pbaseunit') ?? 'ชิ้น',
            'packQty' => (int) ($get('packaging_box') ?? 1),
            'price' => $price,
            'description' => self::plainText($get('product_details_features')) ?? '-',
            'highlights' => self::toLines($get('spec_features')),
            'specs' => $specs,
        ];

        if ($imagePath = $get('pimage')) {
            $result['image'] = Storage::url($imagePath);
        }

        if ($get('eol') === '1') {
            $result['tag'] = 'เลิกผลิต';
            $result['tagColor'] = 'error';
        }

        return $result;
    }

    private static function plainText(?string $html): ?string
    {
        if (!$html) {
            return null;
        }

        $text = trim(strip_tags($html));

        return $text !== '' ? $text : null;
    }

    private static function toLines(?string $html): array
    {
        if (!$html) {
            return [];
        }

        $text = str_replace(['<li>', '<br>', '<br/>', '<br />'], "\n", $html);
        $text = strip_tags($text);

        return collect(explode("\n", $text))
            ->map(fn ($line) => trim($line))
            ->filter()
            ->values()
            ->all();
    }
}
