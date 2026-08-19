<?php

namespace App\Services\ImportExport;

use App\Models\Attribute;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Services\Catalog\AttributeValueFormatter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Reverse of WooCommerceConverter: maps PIM products onto the column shape
 * WooCommerce's own Products > Import screen expects, for a single chosen
 * locale. Unlike WooCommerceConverter (which only ever writes to the global,
 * locale-less ProductValue scope) or the generic ProductRowExporter (which
 * only ever reads that same scope), this resolves a specific requested
 * locale's content — see resolveValue()'s Thai-fallback note for the one
 * deliberate exception.
 *
 * A configurable product is expanded into a `variable` parent row plus one
 * `variation` row per child product, matching WooCommerce's own CSV shape
 * for products with options — there is no equivalent expansion anywhere
 * else in this codebase to mirror, since every other export
 * (ProductRowExporter, quickExport) treats each Product row independently.
 */
class WooCommerceExporter
{
    /**
     * Every non-axis attribute this exporter ever reads. Axis attributes
     * (a configurable product's variation-defining attributes, e.g. Color/
     * Size) are resolved separately per product, since which attributes
     * those are varies per product rather than being a fixed set.
     */
    private const FIXED_ATTRIBUTE_CODES = [
        'pname', 'pimage', 'price_std', 'price_recommend', 'qty',
        'weight_pcs', 'length_pcs', 'width_pcs', 'height_pcs',
        'barcode_pcs', 'pbrand', 'youtube_url', 'catalog_pdf',
        'product_details_features', 'spec_specifications', 'spec_features', 'included_accessories',
    ];

    /** @var array<string, int> attribute code => id */
    private array $attributeIdByCode = [];

    /** @var array<int, Attribute> attribute id => Attribute, with options.translations loaded where relevant */
    private array $attributesById = [];

    private ?int $thaiLocaleId = null;

    private ?int $localeId = null;

    /** @var Collection<string, Collection> "productId-attributeId" => value rows */
    private Collection $valuesByProductAttribute;

    /** @var array<int, Category> */
    private array $categoriesById = [];

    /** @var array<int, array<int, int>> product id => category ids */
    private array $categoryIdsByProduct = [];

    /**
     * @param  Collection<int, Product>  $products  Top-level products only (no variants — pulled in automatically per configurable parent).
     * @return array{header: array<int, string>, rows: array<int, array<string, string>>}
     */
    public function export(Collection $products, string $localeCode): array
    {
        // Reset every accumulator below — a fresh instance is created per
        // request today (see WooCommerceConversionController::export()),
        // but nothing should silently carry state from a prior run into
        // this one if that ever changes (e.g. exporting several locales in
        // one request).
        $this->attributeIdByCode = [];
        $this->attributesById = [];
        $this->categoriesById = [];
        $this->categoryIdsByProduct = [];

        $this->localeId = Locale::idForCode($localeCode);
        $this->thaiLocaleId = Locale::idForCode('th');

        $fixedAttributes = Attribute::whereIn('code', self::FIXED_ATTRIBUTE_CODES)->with('options.translations')->get();
        foreach ($fixedAttributes as $attribute) {
            $this->attributeIdByCode[$attribute->code] = $attribute->id;
            $this->attributesById[$attribute->id] = $attribute;
        }

        $configurableProducts = $products->filter(fn (Product $p) => strtolower($p->type) === 'configurable');
        $variantsByParent = $configurableProducts->isEmpty()
            ? collect()
            : Product::whereIn('parent_id', $configurableProducts->pluck('id'))->orderBy('sku')->get()->groupBy('parent_id');
        $allProducts = $products->concat($variantsByParent->flatten(1));

        $axisAttributeIds = $configurableProducts
            ->flatMap(fn (Product $p) => is_array($p->configurable_attributes) ? $p->configurable_attributes : [])
            ->unique()
            ->diff(array_keys($this->attributesById));
        if ($axisAttributeIds->isNotEmpty()) {
            foreach (Attribute::whereIn('id', $axisAttributeIds)->with('options.translations')->get() as $attribute) {
                $this->attributesById[$attribute->id] = $attribute;
            }
        }

        $attributeIds = array_values(array_unique(array_merge(array_values($this->attributeIdByCode), $axisAttributeIds->all())));

        // Raw query-builder rows, not hydrated ProductValue models — same
        // reasoning as the Missing Translations report: this can be many
        // thousands of rows for a full-catalog export, and nothing here
        // needs more than the four raw column values.
        $this->valuesByProductAttribute = DB::table('product_values')
            ->whereIn('product_id', $allProducts->pluck('id'))
            ->whereIn('attribute_id', $attributeIds)
            ->get(['product_id', 'attribute_id', 'channel_id', 'locale_id', 'value'])
            ->groupBy(fn ($row) => $row->product_id.'-'.$row->attribute_id);

        $this->categoriesById = Category::all(['id', 'parent_id', 'name'])->keyBy('id')->all();
        $this->categoryIdsByProduct = DB::table('product_category')
            ->whereIn('product_id', $products->pluck('id'))
            ->get(['product_id', 'category_id'])
            ->groupBy('product_id')
            ->map(fn ($rows) => $rows->pluck('category_id')->all())
            ->all();

        $maxAxes = $configurableProducts->max(fn (Product $p) => is_array($p->configurable_attributes) ? count($p->configurable_attributes) : 0) ?: 0;

        $rows = [];
        foreach ($products as $product) {
            if (strtolower($product->type) === 'configurable') {
                $variants = $variantsByParent->get($product->id, collect());
                $rows[] = $this->buildParentRow($product, $variants, $maxAxes);
                foreach ($variants as $variant) {
                    $rows[] = $this->buildVariationRow($variant, $product, $maxAxes);
                }
            } else {
                $rows[] = $this->buildSimpleRow($product, $maxAxes);
            }
        }

        return ['header' => $this->buildHeader($maxAxes), 'rows' => $rows];
    }

    private function rawValueRows(int $productId, int $attributeId): Collection
    {
        return $this->valuesByProductAttribute->get($productId.'-'.$attributeId, collect());
    }

    /**
     * Resolves one attribute's value for the requested export locale.
     * Non-locale-based attributes (weight, qty, images, ...) always read the
     * global (channel_id=null, locale_id=null) scope, same as
     * ProductRowExporter/quickExport.
     *
     * For locale-based attributes: prefers a row explicitly tagged with the
     * requested locale. Thai gets one deliberate exception — this catalog's
     * content is overwhelmingly bulk-imported and never split per locale
     * (see ProductRowImporter::sourceLocaleId()'s docblock: imported values
     * always land in the global scope, treated as Thai by convention), so a
     * Thai export falls back to that global value rather than coming back
     * empty for content that's really just sitting one scope over.
     */
    private function resolveValue(Product $product, string $code): ?string
    {
        $attributeId = $this->attributeIdByCode[$code] ?? null;
        $attribute = $attributeId ? ($this->attributesById[$attributeId] ?? null) : null;
        if (! $attribute) {
            return null;
        }

        $rows = $this->rawValueRows($product->id, $attribute->id);

        if (! $attribute->is_locale_based) {
            $row = $rows->first(fn ($r) => $r->channel_id === null && $r->locale_id === null);

            return $this->formatted($attribute, $row->value ?? null);
        }

        $row = $rows->first(fn ($r) => $r->channel_id === null && $r->locale_id === $this->localeId);
        if ($row !== null && trim((string) $row->value) !== '') {
            return $this->formatted($attribute, $row->value);
        }

        if ($this->localeId !== null && $this->localeId === $this->thaiLocaleId) {
            $globalRow = $rows->first(fn ($r) => $r->channel_id === null && $r->locale_id === null);
            if ($globalRow !== null) {
                return $this->formatted($attribute, $globalRow->value);
            }
        }

        return null;
    }

    private function formatted(Attribute $attribute, ?string $raw): ?string
    {
        $formatted = AttributeValueFormatter::format($attribute, $raw);
        if (is_array($formatted)) {
            return implode(', ', array_filter($formatted));
        }

        return $formatted !== null ? (string) $formatted : null;
    }

    /**
     * A `select`-type attribute's ProductValue is an AttributeOption code
     * (e.g. pbrand), not display text — resolves it to that option's label
     * in the requested export locale, falling back to its raw admin_label.
     */
    private function optionLabel(Attribute $attribute, ?string $code): ?string
    {
        if ($code === null || trim($code) === '') {
            return null;
        }

        $option = $attribute->options->firstWhere('code', $code);
        if (! $option) {
            return $code;
        }

        if ($this->localeId) {
            $translation = $option->translations->firstWhere('locale_id', $this->localeId);
            if ($translation && trim((string) $translation->label) !== '') {
                return $translation->label;
            }
        }

        return $option->getRawOriginal('admin_label');
    }

    private function resolveOptionValue(Product $product, string $code): ?string
    {
        $attributeId = $this->attributeIdByCode[$code] ?? null;
        $attribute = $attributeId ? ($this->attributesById[$attributeId] ?? null) : null;
        if (! $attribute) {
            return null;
        }

        $row = $this->rawValueRows($product->id, $attribute->id)->first(fn ($r) => $r->channel_id === null && $r->locale_id === null);

        return $this->optionLabel($attribute, $row->value ?? null);
    }

    /**
     * A variant's own value for one of its parent's variation-axis
     * attributes (e.g. this variant's specific Color) — channel-scoped like
     * any other value, but never locale-scoped since axis attributes are
     * always `select` (see ProductController::configurableAttributeOptions()'s
     * `->has('options')` filter), not locale-based.
     */
    private function variantAxisValue(Product $variant, Attribute $attribute): ?string
    {
        $row = $this->rawValueRows($variant->id, $attribute->id)->first(fn ($r) => $r->channel_id === null);

        return $this->optionLabel($attribute, $row->value ?? null);
    }

    private function attributeLabel(Attribute $attribute): string
    {
        if ($this->localeId) {
            $translation = $attribute->translations->firstWhere('locale_id', $this->localeId);
            if ($translation && trim((string) $translation->label) !== '') {
                return $translation->label;
            }
        }

        return $attribute->getRawOriginal('name');
    }

    /**
     * Builds "Root > Child" category paths for a product's assigned
     * categories (comma-separated if it's assigned to more than one leaf),
     * matching WooCommerce's own Categories column format. A category
     * assigned at multiple levels of the same branch (the category picker
     * auto-checks every ancestor) only produces one path per branch — its
     * deepest pick, same de-duplication as
     * ProductController::categoryPathBySku().
     */
    private function categoryPathsText(Product $product): string
    {
        $categoryIds = $this->categoryIdsByProduct[$product->id] ?? [];
        if (empty($categoryIds)) {
            return '';
        }

        $ancestorIdsOf = function (int $id): array {
            $ids = [];
            $category = $this->categoriesById[$id] ?? null;
            while ($category?->parent_id) {
                $ids[] = $category->parent_id;
                $category = $this->categoriesById[$category->parent_id] ?? null;
            }

            return $ids;
        };

        $allAncestorIds = [];
        foreach ($categoryIds as $id) {
            $allAncestorIds = array_merge($allAncestorIds, $ancestorIdsOf($id));
        }
        $leafIds = array_diff($categoryIds, $allAncestorIds);

        $paths = [];
        foreach ($leafIds as $id) {
            $parts = [];
            $category = $this->categoriesById[$id] ?? null;
            while ($category) {
                array_unshift($parts, $this->categoryLabel($category));
                $category = $category->parent_id ? ($this->categoriesById[$category->parent_id] ?? null) : null;
            }
            if (! empty($parts)) {
                $paths[] = implode(' > ', $parts);
            }
        }

        return implode(', ', $paths);
    }

    private function categoryLabel(Category $category): string
    {
        if ($this->localeId) {
            $translation = $category->translations->firstWhere('locale_id', $this->localeId);
            if ($translation && trim((string) $translation->label) !== '') {
                return $translation->label;
            }
        }

        return $category->getRawOriginal('name');
    }

    private function buildHeader(int $maxAxes): array
    {
        $header = [
            'Type', 'SKU', 'Parent', 'Name', 'Published', 'Short description', 'Description',
            'Regular price', 'In stock?', 'Stock', 'Weight (kg)', 'Length (cm)', 'Width (cm)', 'Height (cm)',
            'Categories', 'Images', 'Brands', 'GTIN, UPC, EAN, or ISBN',
            'Meta: youtube_url', 'Meta: downloads_catalogue', 'Meta: specification', 'Meta: key_features', 'Meta: in-the-box',
        ];

        for ($i = 1; $i <= $maxAxes; $i++) {
            $header[] = "Attribute {$i} name";
            $header[] = "Attribute {$i} value(s)";
            $header[] = "Attribute {$i} visible";
            $header[] = "Attribute {$i} global";
        }

        return $header;
    }

    private function commonFields(Product $product): array
    {
        $qty = $this->resolveValue($product, 'qty');
        $price = $this->resolveValue($product, 'price_std');
        if ($price === null || $price === '') {
            $price = $this->resolveValue($product, 'price_recommend');
        }

        return [
            'Name' => $this->resolveValue($product, 'pname') ?? '',
            'Short description' => '',
            'Description' => $this->resolveValue($product, 'product_details_features') ?? '',
            'Regular price' => $price ?? '',
            'In stock?' => ($qty !== null && $qty !== '' && (float) $qty > 0) ? '1' : '0',
            'Stock' => $qty ?? '',
            'Weight (kg)' => $this->resolveValue($product, 'weight_pcs') ?? '',
            'Length (cm)' => $this->resolveValue($product, 'length_pcs') ?? '',
            'Width (cm)' => $this->resolveValue($product, 'width_pcs') ?? '',
            'Height (cm)' => $this->resolveValue($product, 'height_pcs') ?? '',
            'Categories' => $this->categoryPathsText($product),
            'Images' => $this->resolveValue($product, 'pimage') ?? '',
            'Brands' => $this->resolveOptionValue($product, 'pbrand') ?? '',
            'GTIN, UPC, EAN, or ISBN' => $this->resolveValue($product, 'barcode_pcs') ?? '',
            'Meta: youtube_url' => $this->resolveValue($product, 'youtube_url') ?? '',
            'Meta: downloads_catalogue' => $this->resolveValue($product, 'catalog_pdf') ?? '',
            'Meta: specification' => $this->resolveValue($product, 'spec_specifications') ?? '',
            'Meta: key_features' => $this->resolveValue($product, 'spec_features') ?? '',
            'Meta: in-the-box' => $this->resolveValue($product, 'included_accessories') ?? '',
        ];
    }

    private function padAttributeColumns(array $row, int $maxAxes, int $filledUpTo = 0): array
    {
        for ($i = $filledUpTo + 1; $i <= $maxAxes; $i++) {
            $row["Attribute {$i} name"] = '';
            $row["Attribute {$i} value(s)"] = '';
            $row["Attribute {$i} visible"] = '';
            $row["Attribute {$i} global"] = '';
        }

        return $row;
    }

    private function buildSimpleRow(Product $product, int $maxAxes): array
    {
        $row = array_merge(
            ['Type' => 'simple', 'SKU' => $product->sku, 'Parent' => '', 'Published' => $product->enabled ? '1' : '0'],
            $this->commonFields($product)
        );

        return $this->padAttributeColumns($row, $maxAxes);
    }

    private function buildParentRow(Product $product, Collection $variants, int $maxAxes): array
    {
        $row = array_merge(
            ['Type' => 'variable', 'SKU' => $product->sku, 'Parent' => '', 'Published' => $product->enabled ? '1' : '0'],
            $this->commonFields($product)
        );
        // A variable product's own price/stock don't apply to any actual
        // purchase in Woo — each variation carries its own — so leave them
        // blank on the parent row rather than showing a number nobody buys at.
        $row['Regular price'] = '';
        $row['In stock?'] = '';
        $row['Stock'] = '';

        $axisIds = is_array($product->configurable_attributes) ? $product->configurable_attributes : [];
        $i = 0;
        foreach ($axisIds as $attributeId) {
            $attribute = $this->attributesById[$attributeId] ?? null;
            if (! $attribute) {
                continue;
            }
            $i++;

            $values = $variants
                ->map(fn (Product $variant) => $this->variantAxisValue($variant, $attribute))
                ->filter(fn ($v) => $v !== null && $v !== '')
                ->unique()
                ->values();

            $row["Attribute {$i} name"] = $this->attributeLabel($attribute);
            $row["Attribute {$i} value(s)"] = $values->implode('|');
            $row["Attribute {$i} visible"] = '1';
            $row["Attribute {$i} global"] = '0';
        }

        return $this->padAttributeColumns($row, $maxAxes, $i);
    }

    private function buildVariationRow(Product $variant, Product $parent, int $maxAxes): array
    {
        $qty = $this->resolveValue($variant, 'qty');
        $price = $this->resolveValue($variant, 'price_std');
        if ($price === null || $price === '') {
            $price = $this->resolveValue($variant, 'price_recommend');
        }

        $row = [
            'Type' => 'variation',
            'SKU' => $variant->sku,
            'Parent' => $parent->sku,
            // Woo auto-generates a variation's display name from the parent
            // name + its attribute values, so left blank on purpose —
            // unlike the parent/simple rows, there's no dedicated field here.
            'Name' => '',
            'Published' => $variant->enabled ? '1' : '0',
            'Short description' => '',
            'Description' => '',
            'Regular price' => $price ?? '',
            'In stock?' => ($qty !== null && $qty !== '' && (float) $qty > 0) ? '1' : '0',
            'Stock' => $qty ?? '',
            'Weight (kg)' => $this->resolveValue($variant, 'weight_pcs') ?? '',
            'Length (cm)' => $this->resolveValue($variant, 'length_pcs') ?? '',
            'Width (cm)' => $this->resolveValue($variant, 'width_pcs') ?? '',
            'Height (cm)' => $this->resolveValue($variant, 'height_pcs') ?? '',
            'Categories' => '',
            'Images' => $this->resolveValue($variant, 'pimage') ?? '',
            'Brands' => '',
            'GTIN, UPC, EAN, or ISBN' => $this->resolveValue($variant, 'barcode_pcs') ?? '',
            'Meta: youtube_url' => '',
            'Meta: downloads_catalogue' => '',
            'Meta: specification' => '',
            'Meta: key_features' => '',
            'Meta: in-the-box' => '',
        ];

        $axisIds = is_array($parent->configurable_attributes) ? $parent->configurable_attributes : [];
        $i = 0;
        foreach ($axisIds as $attributeId) {
            $attribute = $this->attributesById[$attributeId] ?? null;
            if (! $attribute) {
                continue;
            }
            $i++;

            $row["Attribute {$i} name"] = $this->attributeLabel($attribute);
            $row["Attribute {$i} value(s)"] = $this->variantAxisValue($variant, $attribute) ?? '';
            $row["Attribute {$i} visible"] = '1';
            $row["Attribute {$i} global"] = '0';
        }

        return $this->padAttributeColumns($row, $maxAxes, $i);
    }
}
