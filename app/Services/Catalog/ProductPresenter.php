<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Maps EAV-backed Product/ProductValue rows to the plain shape the public
 * home page and the internal staff products/show preview expect, matching
 * the `Product` interface in resources/js/data/products.ts.
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

    /** Select-type codes among CODES whose stored value is an AttributeOption code, not a display label — see resolveSelectOptionLabels(). */
    private const SELECT_CODES_TO_RESOLVE = ['pcatname', 'pbaseunit', 'pbrand'];

    /**
     * @param  string  $localeCode  Which locale's ProductValue rows (pname, spec_*, ...)
     *                              to prefer. Defaults to 'th' — still fixed for home()
     *                              (the public storefront listing), but
     *                              StorefrontController::show() and admin-facing callers
     *                              (e.g. the dashboard) explicitly pass app()->getLocale()
     *                              instead, so the result follows whatever locale the
     *                              visitor/admin has switched to.
     * @param  ?User  $viewer  When given, fields whose attribute belongs to an Attribute
     *                         Group the viewer's role can't view (Attribute Access
     *                         permissions) are blanked out — same rule as the product
     *                         edit page and export/import. Null (the default, used by
     *                         the public home() page) means no restriction.
     */
    public static function mapMany(Collection $products, string $localeCode = 'th', ?User $viewer = null): array
    {
        if ($products->isEmpty()) {
            return [];
        }

        $attributesByCode = Attribute::whereIn('code', self::CODES)->get(['id', 'code', 'name'])->keyBy('id');
        $allowedCodes = app(AttributeAccessPolicy::class)->filterAttributeCodes($viewer, self::CODES, 'view');

        // Attribute::name resolves through its translations relation to
        // whatever label an admin actually configured (Attribute management),
        // in the current app locale — used so the specs table shows real,
        // admin-editable headings instead of text hardcoded here.
        $labelsByCode = $attributesByCode->values()->pluck('name', 'code');

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

        $valuesByProduct = self::resolveSelectOptionLabels($valuesByProduct, $attributesByCode);

        $categoryNamesByProduct = self::rootCategoryNames($products);

        return $products->map(
            fn (Product $product) => self::mapOne(
                $product,
                $valuesByProduct->get($product->id, collect()),
                $categoryNamesByProduct->get($product->id),
                $allowedCodes,
                $labelsByCode
            )
        )->values()->all();
    }

    /**
     * pcatname/pbaseunit/pbrand are select fields backed by AttributeOption,
     * whose stored value is the option's `code` (not its label — codes have
     * to be unique per attribute, and several labels collide across
     * attributes, so the label can't double as the code). Resolve each back
     * to its real admin_label here so every consumer of the mapped product
     * sees "พัมคิน"/"ชิ้น" instead of a bare code like "option_1". Values
     * from before a field became a dropdown (plain free-typed text) won't
     * match any option code and pass through unchanged.
     *
     * @return Collection<int, Collection<string, string>>
     */
    private static function resolveSelectOptionLabels(Collection $valuesByProduct, Collection $attributesByCode): Collection
    {
        $attributeIdsByCode = collect(self::SELECT_CODES_TO_RESOLVE)
            ->mapWithKeys(fn (string $code) => [$code => $attributesByCode->search(fn ($attr) => $attr->code === $code)])
            ->filter(fn ($id) => $id !== false);

        if ($attributeIdsByCode->isEmpty()) {
            return $valuesByProduct;
        }

        $labelsByAttributeId = AttributeOption::whereIn('attribute_id', $attributeIdsByCode->values())
            ->get(['attribute_id', 'code', 'admin_label'])
            ->groupBy('attribute_id')
            ->map(fn (Collection $options) => $options->pluck('admin_label', 'code'));

        return $valuesByProduct->map(function (Collection $values) use ($attributeIdsByCode, $labelsByAttributeId) {
            foreach ($attributeIdsByCode as $code => $attributeId) {
                if ($values->has($code)) {
                    $raw = $values->get($code);
                    $labels = $labelsByAttributeId->get($attributeId, collect());
                    $values = $values->put($code, $labels->get($raw, $raw));
                }
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

    /**
     * Falls back to the original hardcoded Thai text only if the attribute
     * itself (or its name) is somehow missing — the real label always comes
     * from $labelsByCode (Attribute::name, i.e. Attribute management) below.
     */
    private const SPEC_LABEL_FALLBACKS = [
        'spec_specifications' => 'ข้อมูลจำเพาะ',
        'spec_packaging' => 'บรรจุภัณฑ์',
        'spec_accessories' => 'อุปกรณ์เสริม',
        'how_to_use' => 'วิธีใช้งาน',
        'warnings' => 'คำเตือน',
        'warranty_period' => 'การรับประกัน',
    ];

    /**
     * @param  array<int, string>  $allowedCodes  Codes from self::CODES the viewer is
     *                                             permitted to see (see mapMany()'s
     *                                             $viewer doc). Values for any other
     *                                             code are blanked out below, so the
     *                                             restricted data never reaches the
     *                                             mapped result at all — not just hidden
     *                                             client-side.
     * @param  Collection<string, string>  $labelsByCode  code => Attribute::name, used for
     *                                                     the specs table's row labels so
     *                                                     they reflect whatever an admin
     *                                                     actually configured, not text
     *                                                     baked into this class.
     */
    private static function mapOne(Product $product, Collection $values, ?string $categoryName, array $allowedCodes, Collection $labelsByCode): array
    {
        $get = fn (string $code) => in_array($code, $allowedCodes, true) ? ($values->get($code) ?: null) : null;
        $specLabel = fn (string $code) => $labelsByCode->get($code) ?: self::SPEC_LABEL_FALLBACKS[$code];

        $price = (float) ($get('price_std') ?? $get('price_recommend') ?? 0);

        $specs = array_filter([
            $specLabel('spec_specifications') => self::plainText($get('spec_specifications')),
            $specLabel('spec_packaging') => self::plainText($get('spec_packaging')),
            $specLabel('spec_accessories') => self::plainText($get('spec_accessories')),
            $specLabel('how_to_use') => self::plainText($get('how_to_use')),
            $specLabel('warnings') => self::plainText($get('warnings')),
            $specLabel('warranty_period') => $get('warranty_period') ? $get('warranty_period').' เดือน' : null,
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
            // price_std and packaging_box now live in separate Attribute Groups
            // (Pricing vs Packaging, split from the original combined group) and
            // can be restricted independently — each flag tells the frontend
            // whether to render that tile at all, rather than showing the
            // placeholder 0/1 fallback values.
            'canViewPricing' => in_array('price_std', $allowedCodes, true),
            'canViewPackaging' => in_array('packaging_box', $allowedCodes, true),
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
