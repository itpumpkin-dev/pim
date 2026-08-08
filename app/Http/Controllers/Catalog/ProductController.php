<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Events\ProductDataChanged;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AssociationType;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Channel;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductAssociation;
use App\Models\ProductValue;
use App\Models\SalesPlatformShop;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\Catalog\AttributeValueFormatter;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use App\Services\ImportExport\Exporters\ProductRowExporter;
use App\Services\ImportExport\SpreadsheetWriter;
use App\Services\Lazada\LazadaProductSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ProductController extends Controller
{
    use HasVersionHistory;

    public function __construct(private readonly AttributeAccessPolicy $attributeAccess)
    {
    }


    public function index(Request $request): Response
    {
        $grid = new GridManager('product_grid');

        $nameAttributeId = Attribute::where('code', 'pname')->value('id');

        // `name` and any dynamic "Add Filter" attribute filters are EAV
        // (ProductValue), not real columns on `products`, so GridManager's
        // plain column-based applyFilters() can't express them — apply them
        // as an extra query constraint before pagination instead.
        $filtersInput = $request->input('filters', []);
        $attributeFilters = $request->input('attribute_filters', []);

        $gridData = $grid->getData($request, function ($query) use ($filtersInput, $attributeFilters, $nameAttributeId) {
            $nameValue = $filtersInput['name'] ?? null;
            if ($nameValue !== null && $nameValue !== '' && $nameAttributeId) {
                $query->whereHas('values', function ($q) use ($nameAttributeId, $nameValue) {
                    $q->where('attribute_id', $nameAttributeId)->where('value', 'like', "%{$nameValue}%");
                });
            }

            foreach ((array) $attributeFilters as $filter) {
                $attributeId = $filter['attribute_id'] ?? null;
                $value = $filter['value'] ?? null;
                if (!$attributeId || $value === null || $value === '') {
                    continue;
                }

                $query->whereHas('values', function ($q) use ($attributeId, $value) {
                    $q->where('attribute_id', $attributeId)->where('value', 'like', '%'.$value.'%');
                });
            }
        });

        $imageAttributeIdByFamily = FamilyAttribute::query()
            ->join('attributes', 'attributes.id', '=', 'family_attributes.attribute_id')
            ->where('attributes.type', 'image')
            ->pluck('attributes.id', 'family_attributes.family_id');

        // Completeness = share of every attribute assigned to a product's
        // family (not just the required ones) that already has a value.
        // Grouped by family up front so every product on the page reuses the
        // same lookup instead of re-querying per row.
        $familyIds = $gridData->getCollection()->pluck('family_id')->filter()->unique();
        $familyAttributeIdsByFamily = FamilyAttribute::query()
            ->whereIn('family_id', $familyIds)
            ->get(['family_id', 'attribute_id'])
            ->groupBy('family_id')
            ->map(fn ($rows) => $rows->pluck('attribute_id'));

        $productIds = $gridData->getCollection()->pluck('id');
        $parentIds = $gridData->getCollection()->pluck('parent_id')->filter()->unique();

        $parentSkus = $parentIds->isNotEmpty()
            ? Product::whereIn('id', $parentIds)->pluck('sku', 'id')
            : collect();

        $allAttributes = Attribute::orderBy('code')->get(['id', 'code', 'name', 'type', 'is_filterable']);

        // Locale-based attributes (pname, spec_*, ...) store one ProductValue
        // row per locale, and channel-based ones store one per channel. This
        // grid has no locale/channel picker, so it only ever wants the
        // globally-scoped value (channel_id IS NULL) in the admin's current
        // UI locale — restrict to that up front and order the active
        // locale's row before the locale-less fallback, so the `->first()`
        // lookups below land on it instead of an arbitrary row whichever
        // order the DB happened to return them in (which is what silently
        // ignored the locale switcher before this fix).
        $activeLocaleId = Locale::where('code', app()->getLocale())->value('id');

        $values = ProductValue::whereIn('product_id', $productIds)
            ->whereNull('channel_id')
            ->where(function ($query) use ($activeLocaleId) {
                $query->whereNull('locale_id');
                if ($activeLocaleId) {
                    $query->orWhere('locale_id', $activeLocaleId);
                }
            })
            ->when(
                $activeLocaleId,
                fn ($query) => $query->orderByRaw('CASE WHEN locale_id = ? THEN 0 ELSE 1 END ASC', [$activeLocaleId]),
            )
            ->get(['product_id', 'attribute_id', 'value']);

        $items = $gridData->getCollection()->map(function ($product) use ($values, $nameAttributeId, $imageAttributeIdByFamily, $allAttributes, $parentSkus, $familyAttributeIdsByFamily) {
            $product->family_code = $product->family ? ($product->family->name ?: $product->family->code) : '-';

            $familyAttributeIds = $familyAttributeIdsByFamily->get($product->family_id) ?? collect();
            if ($familyAttributeIds->isEmpty()) {
                // Family has no attributes assigned at all — nothing to
                // measure completeness against, so "N/A" rather than a
                // misleading 100%.
                $product->completeness = null;
            } else {
                $filledCount = $familyAttributeIds->filter(function ($attributeId) use ($product, $values) {
                    $raw = optional($values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $attributeId))->value;
                    return $raw !== null && trim((string) $raw) !== '';
                })->count();
                $product->completeness = (int) round($filledCount / $familyAttributeIds->count() * 100);
            }

            $product->name = $nameAttributeId
                ? optional($values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $nameAttributeId))->value
                : null;

            $imageAttributeId = $imageAttributeIdByFamily->get($product->family_id);
            $imagePath = $imageAttributeId
                ? optional($values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $imageAttributeId))->value
                : null;
            $product->image_url = $imagePath ? Storage::url($imagePath) : null;

            $product->parent_sku = $product->parent_id ? ($parentSkus->get($product->parent_id) ?? null) : null;

            $product->attribute_values = $allAttributes->mapWithKeys(function (Attribute $attribute) use ($product, $values) {
                $rawValue = optional(
                    $values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $attribute->id)
                )->value;

                return [$attribute->id => $this->formatAttributeValue($attribute, $rawValue)];
            });

            return $product;
        });
        $gridData->setCollection($items);

        return Inertia::render('catalog/products/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $gridData,
            // Explicit keys (not $request->only(), which omits absent ones) so this
            // always serializes as a JSON object, never `[]` — an empty array's
            // `.sort` resolves to Array.prototype.sort, which breaks `filters.sort
            // ?? ''` on the frontend (a truthy function slips past `??`, and
            // useState() then calls it unbound as a lazy initializer and throws).
            'filters' => [
                'search' => $request->input('search', ''),
                'sort' => $request->input('sort', ''),
                'dir' => $request->input('dir', ''),
                'filters' => $request->input('filters', []),
                'attribute_filters' => $request->input('attribute_filters', []),
            ],
            'families' => AttributeFamily::select('id', 'code', 'name')->orderBy('name')->get(),
            'attributes' => $allAttributes->map(fn (Attribute $attribute) => [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'is_filterable' => (bool) $attribute->is_filterable,
            ]),
        ]);
    }

    public function summary(): JsonResponse
    {
        $products = Product::with('family:id,code,name')->get([
            'id', 'sku', 'family_id', 'type', 'enabled', 'created_at', 'updated_at',
        ]);

        $allAttributes = Attribute::with('options')->get();

        $attributesByFamily = FamilyAttribute::with('attribute.options')
            ->get()
            ->groupBy('family_id')
            ->map(fn ($rows) => $rows->pluck('attribute')->filter());

        $values = ProductValue::whereIn('product_id', $products->pluck('id'))
            ->get(['product_id', 'attribute_id', 'value']);

        $data = $products->map(function (Product $product) use ($allAttributes, $attributesByFamily, $values) {
            $attributes = $attributesByFamily->get($product->family_id) ?: $allAttributes;

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'type' => $product->type,
                'enabled' => (bool) $product->enabled,
                'family' => $product->family ? [
                    'id' => $product->family->id,
                    'code' => $product->family->code,
                    'name' => $product->family->name,
                ] : null,
                'created_at' => $product->created_at?->toDateTimeString(),
                'updated_at' => $product->updated_at?->toDateTimeString(),
                'attributes' => $attributes->map(function (Attribute $attribute) use ($product, $values) {
                    $rawValue = optional(
                        $values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $attribute->id)
                    )->value;

                    return [
                        'id' => $attribute->id,
                        'code' => $attribute->code,
                        'name' => $attribute->name,
                        'type' => $attribute->type,
                        'value' => $this->formatAttributeValue($attribute, $rawValue),
                    ];
                })->values(),
            ];
        });

        return response()->json([
            'total_products' => $products->count(),
            'products' => $data,
        ]);
    }

    /**
     * Lightweight product search for the "Add related/up-sell/cross-sell
     * product" picker on the edit page — matches by SKU or by the `pname`
     * attribute value, excluding whatever's already picked.
     */
    public function search(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        $excludeIds = array_filter(array_map('intval', (array) $request->query('exclude', [])));

        if ($query === '') {
            return response()->json([]);
        }

        $nameAttributeId = Attribute::where('code', 'pname')->value('id');

        $matchingProductIds = $nameAttributeId
            ? ProductValue::where('attribute_id', $nameAttributeId)->where('value', 'like', "%{$query}%")->pluck('product_id')
            : collect();

        $products = Product::where(function ($q) use ($query, $matchingProductIds) {
                $q->where('sku', 'like', "%{$query}%");
                if ($matchingProductIds->isNotEmpty()) {
                    $q->orWhereIn('id', $matchingProductIds);
                }
            })
            ->when(!empty($excludeIds), fn ($q) => $q->whereNotIn('id', $excludeIds))
            ->limit(20)
            ->get(['id', 'sku']);

        $names = $nameAttributeId
            ? ProductValue::whereIn('product_id', $products->pluck('id'))->where('attribute_id', $nameAttributeId)->pluck('value', 'product_id')
            : collect();

        return response()->json($products->map(fn (Product $product) => [
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => $names->get($product->id) ?: $product->sku,
        ])->values());
    }

    /**
     * Look up which category (or categories) a product belongs to by its
     * (partial) SKU — for every product whose `sku` matches, returns the
     * full root->leaf path for each category it's attached to via
     * `product_category`, not just the top-level parent.
     */
    public function categoryPathBySku(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'min:1'],
        ]);

        $products = Product::where('sku', 'like', '%'.$validated['sku'].'%')->get(['id', 'sku']);

        $nameAttributeId = Attribute::where('code', 'pname')->value('id');

        $names = $nameAttributeId
            ? ProductValue::whereIn('product_id', $products->pluck('id'))->where('attribute_id', $nameAttributeId)->pluck('value', 'product_id')
            : collect();

        $productCategoryIds = DB::table('product_category')
            ->whereIn('product_id', $products->pluck('id'))
            ->get(['product_id', 'category_id'])
            ->groupBy('product_id');

        $categoriesById = Category::all(['id', 'code', 'name', 'parent_id'])->keyBy('id');

        $buildPath = function (int $categoryId) use ($categoriesById): array {
            $path = [];
            $category = $categoriesById->get($categoryId);

            while ($category) {
                array_unshift($path, ['id' => $category->id, 'code' => $category->code, 'name' => $category->name]);
                $category = $category->parent_id ? $categoriesById->get($category->parent_id) : null;
            }

            return $path;
        };

        // A product tagged at multiple levels of the same branch (the category
        // picker auto-checks every ancestor up to the root) would otherwise show
        // one path per level here — growing prefixes of the same path. Only the
        // deepest pick per branch is worth a row; its path already contains
        // every ancestor, so drop any assigned id that's an ancestor of another.
        $ancestorIdsOf = function (int $categoryId) use ($categoriesById): array {
            $ids = [];
            $category = $categoriesById->get($categoryId);
            while ($category?->parent_id) {
                $ids[] = $category->parent_id;
                $category = $categoriesById->get($category->parent_id);
            }
            return $ids;
        };

        $results = $products->map(function (Product $product) use ($names, $productCategoryIds, $buildPath, $ancestorIdsOf) {
            $categoryIds = $productCategoryIds->get($product->id, collect())->pluck('category_id')->map(fn ($id) => (int) $id);
            $allAncestorIds = $categoryIds->flatMap($ancestorIdsOf)->unique();
            $leafCategoryIds = $categoryIds->diff($allAncestorIds);

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $names->get($product->id) ?: $product->sku,
                'categories' => $leafCategoryIds->map(fn ($id) => $buildPath($id))->values(),
            ];
        })->values();

        return response()->json([
            'query' => $validated['sku'],
            'results' => $results,
        ]);
    }

    /**
     * Synchronous "quick export" for the product grid — downloads immediately
     * instead of going through the export-config/job-tracker workflow. Exports
     * the selected rows if any are checked, otherwise the current search filter.
     */
    public function quickExport(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'format' => ['required', 'in:csv,xls,xlsx'],
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer'],
            'search' => ['nullable', 'string'],
        ]);

        $format = $validated['format'];
        $ids = $validated['ids'] ?? [];

        $columns = (new ProductRowExporter($request->user()))->columns();
        $attributeCodes = array_slice($columns, 4);
        $attributesByCode = Attribute::whereIn('code', $attributeCodes)->get()->keyBy('code');

        $query = Product::with('family')->orderBy('id');
        if (!empty($ids)) {
            $query->whereIn('id', $ids);
        } elseif (!empty($validated['search'])) {
            $query->where('sku', 'like', '%'.$validated['search'].'%');
        }

        // Chunked instead of one ProductValue query per product (N+1 that made
        // large exports crawl) — batches the value lookup per 500 products
        // while `cursor()` still keeps the outer product stream memory-bounded.
        $rows = (function () use ($query, $attributesByCode) {
            foreach ($query->cursor()->chunk(500) as $products) {
                $valuesByProduct = ProductValue::whereIn('product_id', $products->pluck('id'))
                    ->whereNull('channel_id')
                    ->whereNull('locale_id')
                    ->get(['product_id', 'attribute_id', 'value'])
                    ->groupBy('product_id');

                foreach ($products as $product) {
                    $values = $valuesByProduct->get($product->id, collect())->pluck('value', 'attribute_id');

                    $row = [
                        'sku' => $product->sku,
                        'family_code' => $product->family?->code ?? '',
                        'type' => $product->type,
                        'enabled' => $product->enabled ? '1' : '0',
                    ];

                    foreach ($attributesByCode as $code => $attribute) {
                        $row[$code] = $values->get($attribute->id, '');
                    }

                    yield $row;
                }
            }
        })();

        Storage::disk('local')->makeDirectory('tmp-exports');
        $tempRelativePath = 'tmp-exports/'.Str::uuid().'.'.$format;
        $tempAbsolutePath = Storage::disk('local')->path($tempRelativePath);

        SpreadsheetWriter::write($tempAbsolutePath, $format, $columns, $rows, ',');

        $downloadName = 'products_'.now()->format('Ymd_His').'.'.$format;

        return response()->download($tempAbsolutePath, $downloadName)->deleteFileAfterSend(true);
    }

    private function formatAttributeValue(Attribute $attribute, ?string $rawValue): mixed
    {
        return AttributeValueFormatter::format($attribute, $rawValue);
    }

    /**
     * Deletes whichever public-disk file(s) a value change actually dropped.
     * Image/file values are a single path string, so any change drops the
     * old one outright. Gallery values are a JSON-encoded array of paths,
     * and the frontend now lets users keep most of the set while adding or
     * removing individual images — so only the paths present in $oldValue
     * but absent from $newValue get deleted, instead of the whole old set.
     */
    private function deleteRemovedAttributeFiles(Attribute $attribute, string $oldValue, ?string $newValue): void
    {
        if ($attribute->type === 'gallery') {
            $oldPaths = json_decode($oldValue, true);
            $newPaths = $newValue !== null ? json_decode($newValue, true) : [];
            $removedPaths = array_diff((array) $oldPaths, (array) $newPaths);

            foreach ($removedPaths as $path) {
                if ($path) {
                    Storage::disk('public')->delete($path);
                }
            }

            return;
        }

        Storage::disk('public')->delete($oldValue);
    }

    /**
     * Attributes eligible to define a configurable product's variant axes
     * (must have selectable options), each carrying family_ids so the
     * Create/Edit variant-attribute picker can restrict itself to whichever
     * attributes are actually assigned to the selected family — otherwise a
     * choice unrelated to the product's family would silently never surface
     * in Edit's family-scoped attribute groups.
     */
    private function configurableAttributeOptions()
    {
        return Attribute::with(['options', 'families:id'])
            ->has('options')
            ->select('id', 'code', 'name', 'type')
            ->get()
            ->map(function (Attribute $attribute) {
                $attribute->family_ids = $attribute->families->pluck('id');

                return $attribute;
            });
    }

    public function create(): Response
    {
        // Ordered most-used family first, so the create form's default
        // selection (families[0]) is the family products are actually
        // assigned to most often, instead of an arbitrary DB-insertion
        // order that happened to come back first.
        $families = AttributeFamily::withCount('products')
            ->orderByDesc('products_count')
            ->orderBy('name')
            ->get(['id', 'code', 'name']);

        $attributes = $this->configurableAttributeOptions();

        return Inertia::render('catalog/products/create', [
            'families' => $families,
            'attributes' => $attributes,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'sku' => ['required', 'string', 'max:100', 'unique:products,sku'],
            'family_id' => ['required', 'exists:attribute_families,id'],
            'type' => ['required', 'in:simple,configurable'],
            'enabled' => ['required', 'boolean'],
            'configurable_attributes' => ['nullable', 'array'],
            'configurable_attributes.*' => ['integer', 'exists:attributes,id'],
            'variants' => ['nullable', 'array'],
            // 'distinct' catches two generated variant rows colliding with each
            // other, and notIn catches a variant SKU colliding with the parent's
            // own SKU — both previously slipped past `unique:products,sku` (which
            // only checks already-persisted rows) and hit the DB's unique
            // constraint directly inside the loop below, raising a raw
            // QueryException (500) instead of a clean validation error.
            'variants.*.sku' => [
                'required_if:type,configurable',
                'string',
                'max:100',
                'distinct',
                'unique:products,sku',
                Rule::notIn([$request->input('sku')]),
            ],
            'variants.*.price' => ['nullable', 'numeric'],
            'variants.*.qty' => ['nullable', 'integer'],
            'variants.*.attributes' => ['nullable', 'array'],
        ]);

        // variants.*.attributes is an associative map keyed by attribute id
        // (`{attributeId: value}`), which Laravel's dot-notation rules can't
        // validate the *keys* of — a bogus attribute id here previously hit
        // product_values.attribute_id's FK constraint and raised a raw 500
        // instead of a validation error.
        $validator->after(function ($validator) use ($request) {
            $validAttributeIds = null;

            foreach ((array) $request->input('variants', []) as $index => $variant) {
                $attributeIds = array_keys((array) ($variant['attributes'] ?? []));
                if (empty($attributeIds)) {
                    continue;
                }

                $validAttributeIds ??= Attribute::pluck('id')->map(fn ($id) => (string) $id)->all();
                $unknown = array_diff(array_map('strval', $attributeIds), $validAttributeIds);

                foreach ($unknown as $badId) {
                    $validator->errors()->add("variants.{$index}.attributes", "Unknown attribute id \"{$badId}\".");
                }
            }
        });

        $validated = $validator->validate();

        $parentProduct = null;

        DB::transaction(function () use ($validated, $request, &$parentProduct) {
            $parentProduct = Product::create([
                'sku' => $validated['sku'],
                'family_id' => $validated['family_id'],
                'type' => $validated['type'],
                'enabled' => $validated['enabled'],
                'configurable_attributes' => $validated['configurable_attributes'] ?? null,
                'created_by' => $request->user()?->id,
                'updated_by' => $request->user()?->id,
            ]);

            $parentProduct->applySmartDefaults();

            if ($validated['type'] === 'configurable' && !empty($validated['variants'])) {
                $priceAttr = Attribute::where('code', 'price')->first();
                $qtyAttr = Attribute::where('code', 'qty')->first();

                foreach ($validated['variants'] as $variantData) {
                    $childProduct = Product::create([
                        'sku' => $variantData['sku'],
                        'parent_id' => $parentProduct->id,
                        'family_id' => $parentProduct->family_id,
                        'type' => 'simple',
                        'enabled' => $parentProduct->enabled,
                        'created_by' => $request->user()?->id,
                        'updated_by' => $request->user()?->id,
                    ]);

                    $childProduct->applySmartDefaults();

                    // Save price
                    if ($priceAttr && isset($variantData['price']) && $variantData['price'] !== '') {
                        ProductValue::create([
                            'product_id' => $childProduct->id,
                            'attribute_id' => $priceAttr->id,
                            'value' => (string) $variantData['price'],
                        ]);
                    }

                    // Save qty
                    if ($qtyAttr && isset($variantData['qty']) && $variantData['qty'] !== '') {
                        ProductValue::create([
                            'product_id' => $childProduct->id,
                            'attribute_id' => $qtyAttr->id,
                            'value' => (string) $variantData['qty'],
                        ]);
                    }

                    // Save combination attributes (e.g. color, size option codes/IDs)
                    if (!empty($variantData['attributes'])) {
                        foreach ($variantData['attributes'] as $attrId => $attrVal) {
                            if ($attrVal !== null && $attrVal !== '') {
                                ProductValue::create([
                                    'product_id' => $childProduct->id,
                                    'attribute_id' => $attrId,
                                    'value' => (string) $attrVal,
                                ]);
                            }
                        }
                    }
                }

                $newVariantValues = $this->variantValueSnapshot($parentProduct);
                $this->recordProductValueChanges($parentProduct, [], $newVariantValues, 'variant_values_updated');
            }
        });

        // Land the user straight in Edit — the Create form only captures
        // SKU/family/type/variants, so without this they'd have to manually
        // find the product they just made in the grid before they could add
        // any real content (name, images, categories, ...). Falls back to the
        // index only for a role that can create but can't edit products.
        $user = $request->user();
        if ($user && $user->hasPermission('products', 'edit_products')) {
            return to_route('catalog.products.edit', $parentProduct)->with('success', 'Product created successfully.');
        }

        return to_route('catalog.products.index')->with('success', 'Product created successfully.');
    }

    /**
     * Seeds a new product from an existing one: same family/type/attribute
     * values/categories, under a fresh, auto-generated SKU. Starts disabled
     * (regardless of the source's status) so a not-yet-reviewed duplicate
     * never accidentally goes live under a second SKU — the user is expected
     * to review/adjust it on the Edit page (where they land next) and enable
     * it themselves. Configurable products bring their variants along too,
     * each duplicated the same way and re-parented to the new product.
     */
    public function duplicate(Request $request, Product $product): RedirectResponse
    {
        $duplicate = DB::transaction(function () use ($product, $request) {
            $newProduct = CodeGenerator::createWithRetry(
                'products',
                $product->sku.'-copy',
                fn ($sku) => Product::create([
                    'sku' => $sku,
                    'family_id' => $product->family_id,
                    'type' => $product->type,
                    'enabled' => false,
                    'configurable_attributes' => $product->configurable_attributes,
                    'created_by' => $request->user()?->id,
                    'updated_by' => $request->user()?->id,
                ]),
                column: 'sku',
            );

            $this->copyProductData($product, $newProduct);

            if (strtolower($product->type) === 'configurable') {
                foreach (Product::where('parent_id', $product->id)->get() as $variant) {
                    $newVariant = CodeGenerator::createWithRetry(
                        'products',
                        $variant->sku.'-copy',
                        fn ($sku) => Product::create([
                            'sku' => $sku,
                            'parent_id' => $newProduct->id,
                            'family_id' => $variant->family_id,
                            'type' => 'simple',
                            'enabled' => false,
                            'created_by' => $request->user()?->id,
                            'updated_by' => $request->user()?->id,
                        ]),
                        column: 'sku',
                    );

                    $this->copyProductData($variant, $newVariant);
                }
            }

            return $newProduct;
        });

        AuditLog::record('duplicated', $duplicate, null, [
            'duplicated_from_id' => $product->id,
            'duplicated_from_sku' => $product->sku,
        ]);

        return to_route('catalog.products.edit', $duplicate)
            ->with('success', "Duplicated as \"{$duplicate->sku}\" (disabled). Review and update before enabling.");
    }

    /**
     * Copies $source's attribute values and category assignments onto
     * $target. `is_unique`-flagged attributes (barcode_*, `pid`, ...) are
     * deliberately skipped — copying them verbatim would give the duplicate
     * the exact same "unique" value as the original, which is either
     * meaningless (two products sharing one barcode) or actively wrong.
     * `pid` self-heals via applySmartDefaults() (called first, so the
     * subsequent copy of non-unique values like `pname` can still overwrite
     * its bootstrap "= SKU" default with the source's real name).
     */
    private function copyProductData(Product $source, Product $target): void
    {
        $target->applySmartDefaults();

        ProductValue::where('product_id', $source->id)
            ->whereHas('attribute', fn ($q) => $q->where('is_unique', false))
            ->get(['attribute_id', 'channel_id', 'locale_id', 'value'])
            ->each(fn (ProductValue $value) => ProductValue::updateOrCreate(
                [
                    'product_id' => $target->id,
                    'attribute_id' => $value->attribute_id,
                    'channel_id' => $value->channel_id,
                    'locale_id' => $value->locale_id,
                ],
                ['value' => $value->value]
            ));

        $categoryIds = $source->categories()->pluck('categories.id');
        if ($categoryIds->isNotEmpty()) {
            $target->categories()->sync($categoryIds);
        }
    }

    public function edit(Product $product): Response
    {
        $families = AttributeFamily::select('id', 'code', 'name')->get();

        // Load pivot family_attributes for this product's family, in the
        // curated order set on the Attribute Family edit page.
        $familyAttributes = FamilyAttribute::with(['attribute.options', 'attributeGroup'])
            ->where('family_id', $product->family_id)
            ->orderBy('sort_order')
            ->get();

        $user = auth()->user();

        // Group attributes dynamically by attributeGroup
        $groupsData = [];
        foreach ($familyAttributes as $fa) {
            $group = $fa->attributeGroup;
            $attr = $fa->attribute;
            if (!$group || !$attr) continue;

            // Check if user has permission to view this attribute group
            if ($user && !$this->canUserViewAttributeGroup($user, $group)) {
                continue;
            }

            // Check if user has permission to view this specific attribute
            if ($user && !$this->canUserViewAttribute($user, $attr)) {
                continue;
            }

            $groupId = $group->id;
            if (!isset($groupsData[$groupId])) {
                $groupsData[$groupId] = [
                    'id' => $group->id,
                    'code' => $group->code,
                    'name' => $group->name ?: ucfirst($group->code),
                    // Every locale's label, so the frontend can switch the
                    // displayed language instantly (picking from this) instead
                    // of waiting on a server round-trip to re-resolve `name`
                    // above for the new locale.
                    'translations' => $group->translations,
                    'attributes' => [],
                ];
            }
            $attr->editable = $this->canUserEditAttributeGroup($user, $group) && $this->canUserEditAttribute($user, $attr);
            $groupsData[$groupId]['attributes'][] = $attr;
        }

        // Remove empty groups (groups with no visible attributes)
        $groupsData = array_filter($groupsData, fn ($group) => !empty($group['attributes']));

        // If product family has no assigned family attributes yet, show all system attributes under General.
        // Note: this must check the family's raw attribute assignments, not $groupsData, so that a family
        // with assigned attributes the user simply lacks permission to view doesn't fall through to showing
        // every system attribute instead of correctly appearing empty.
        if ($familyAttributes->isEmpty()) {
            $allAttributes = Attribute::with('options')->get();

            // Filter by user permissions if applicable
            if ($user) {
                $allAttributes = $allAttributes->filter(fn ($attr) => $this->canUserViewAttribute($user, $attr));
            }

            $allAttributes->each(fn ($attr) => $attr->editable = $this->canUserEditAttribute($user, $attr));

            if ($allAttributes->isNotEmpty()) {
                $groupsData[] = [
                    'id' => 0,
                    'code' => 'general',
                    'name' => 'General',
                    'attributes' => $allAttributes->values()->all(),
                ];
            }
        } else {
            $groupsData = array_values($groupsData);
        }

        // Preload values scoped to no channel (global attributes) plus the default
        // channel, across all locales. Values for other channels are fetched on
        // demand via GET .../attribute-values when the user switches the channel
        // selector, to keep this initial payload bounded.
        $channels = Channel::all()->map(fn (Channel $c) => ['id' => $c->id, 'code' => $c->code, 'name' => $c->name]);
        $defaultChannelId = $channels->first()['id'] ?? null;

        // Groups the flat channel list by sales platform (Lazada, ...) for the
        // Edit Product sidebar's collapsible tree — channels with no linked
        // shop (e.g. the default web channel) fall under a "Website" bucket
        // and carry no shop_id, since there's nothing to publish a checkbox for.
        $shopByChannelId = SalesPlatformShop::with('platform:id,name')
            ->whereNotNull('channel_id')
            ->get()
            ->keyBy('channel_id');

        $channelGroups = $channels
            ->map(function ($channel) use ($shopByChannelId) {
                $shop = $shopByChannelId->get($channel['id']);

                return [
                    'id' => $channel['id'],
                    'code' => $channel['code'],
                    'name' => $channel['name'],
                    'shop_id' => $shop?->id,
                    'platform' => $shop?->platform?->name ?? 'Website',
                ];
            })
            ->groupBy('platform')
            ->map(fn ($group, $platform) => ['platform' => $platform, 'channels' => $group->values()])
            ->values();

        $rawValues = ProductValue::where('product_id', $product->id)
            ->where(function ($q) use ($defaultChannelId) {
                $q->whereNull('channel_id');
                if ($defaultChannelId) {
                    $q->orWhere('channel_id', $defaultChannelId);
                }
            })
            ->get();

        $values = [];
        foreach ($rawValues as $val) {
            $channelKey = $val->channel_id ? (string) $val->channel_id : 'global';
            $localeKey = $val->locale_id ? (string) $val->locale_id : 'default';
            $values[$val->attribute_id][$channelKey][$localeKey] = $val->value;
        }

        $variantsData = [];
        if (strtolower($product->type) === 'configurable') {
            $priceAttrId = Attribute::where('code', 'price')->value('id');
            $qtyAttrId = Attribute::where('code', 'qty')->value('id');

            $variants = Product::where('parent_id', $product->id)->get();
            foreach ($variants as $variant) {
                $rawVals = ProductValue::where('product_id', $variant->id)->get();
                $variantValues = [];
                $price = '';
                $qty = '';

                foreach ($rawVals as $val) {
                    if ($val->attribute_id == $priceAttrId) {
                        $price = $val->value;
                    } elseif ($val->attribute_id == $qtyAttrId) {
                        $qty = $val->value;
                    } else {
                        // Only the combination-defining attributes (color, size, ...)
                        // go here — price/qty are surfaced separately above so the
                        // frontend can match "does this variant's combination match
                        // the regenerated one" purely by comparing this map.
                        $variantValues[$val->attribute_id] = $val->value;
                    }
                }

                $variantsData[] = [
                    'id' => $variant->id,
                    'sku' => $variant->sku,
                    'price' => $price,
                    'qty' => $qty,
                    'attributes' => $variantValues,
                ];
            }
        }

        $family = $product->family;

        // Cheap (a handful of rows, not the ~1,086-node full tree) — lets the
        // Categories panel show what's already assigned immediately, without
        // the picker's full tree fetch (see CategoryController::tree()) ever
        // blocking this page. The tree itself only loads if/when the user
        // opens the picker to change the selection.
        $selectedCategories = $product->categories()->get(['categories.id', 'categories.name'])
            ->map(fn (Category $category) => [
                'id' => $category->id,
                'name' => $category->name,
                'translations' => $category->translations,
            ]);

        return Inertia::render('catalog/products/edit', [
            'product' => [
                'id' => $product->id,
                'sku' => $product->sku,
                'family_id' => $product->family_id,
                'family_code' => $family ? ($family->name ?: ucfirst($family->code)) : 'Default',
                'type' => ucfirst($product->type),
                'enabled' => (bool)$product->enabled,
                'configurable_attributes' => $product->configurable_attributes ?? [],
                // ISO 8601 with an explicit UTC offset so the frontend can
                // localize it, rather than a naive string shown verbatim.
                'created_at' => ($product->created_at ?? now())->toIso8601String(),
                'updated_at' => ($product->updated_at ?? now())->toIso8601String(),
            ],
            'families' => $families,
            'assignedGroups' => $groupsData,
            'productValues' => $values,
            'variants' => $variantsData,
            'configurableAttributes' => $this->configurableAttributeOptions(),
            'channels' => $channels,
            'channelGroups' => $channelGroups,
            'categoryIds' => $selectedCategories->pluck('id')->all(),
            'selectedCategories' => $selectedCategories->values(),
            'publishedShopIds' => $product->platformShops()->pluck('sales_platform_shops.id')->all(),
            'associations' => $this->associationsFor($product),
            'canViewHistory' => auth()->user()?->hasPermission('products', 'view_history') ?? false,
        ]);
    }

    public function history(Product $product): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($product)]);
    }

    /**
     * FIRES A REAL, LIVE WRITE TO LAZADA — creates or updates an actual
     * listing on the seller's storefront. Only reachable for a shop the
     * product is explicitly marked "published" for (see platformShops()),
     * so this can't be triggered for a shop nobody opted into.
     */
    public function pushToLazada(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        $isPublished = $product->platformShops()->where('sales_platform_shops.id', $shop->id)->exists();
        if (!$isPublished) {
            return response()->json([
                'message' => "'{$shop->name}' is not marked as published for this product — check the box next to it first.",
            ], 422);
        }

        try {
            $result = LazadaProductSyncService::forShop($shop)->push($product, $shop);

            AuditLog::record('pushed_to_lazada', $product, null, ['shop_id' => $shop->id, 'shop_name' => $shop->name]);

            return response()->json(['message' => "Pushed to '{$shop->name}' successfully.", 'result' => $result]);
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'sku' => ['required', 'string', 'max:100', 'unique:products,sku,' . $product->id],
            'family_id' => ['required', 'exists:attribute_families,id'],
            'type' => ['required', 'in:simple,configurable,Simple,Configurable'],
            'enabled' => ['required', 'boolean'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['exists:categories,id'],
            'published_shop_ids' => ['nullable', 'array'],
            'published_shop_ids.*' => ['exists:sales_platform_shops,id'],
            'associations' => ['nullable', 'array'],
            'associations.related' => ['nullable', 'array'],
            'associations.related.*' => ['exists:products,id'],
            'associations.up_sell' => ['nullable', 'array'],
            'associations.up_sell.*' => ['exists:products,id'],
            'associations.cross_sell' => ['nullable', 'array'],
            'associations.cross_sell.*' => ['exists:products,id'],
            'values' => ['nullable', 'array'],
            'configurable_attributes' => ['nullable', 'array'],
            'configurable_attributes.*' => ['integer', 'exists:attributes,id'],
            'variants' => ['nullable', 'array'],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.sku' => ['required_if:type,configurable', 'string', 'max:100', 'distinct'],
            'variants.*.price' => ['nullable', 'numeric'],
            'variants.*.qty' => ['nullable', 'integer'],
            'variants.*.attributes' => ['nullable', 'array'],
        ]);

        // Same "unknown attribute id in variants.*.attributes' keys" guard as
        // store() — see the comment there. update() previously had no rule at
        // all for this field, leaving it fully unvalidated.
        $validator->after(function ($validator) use ($request) {
            $validAttributeIds = null;

            foreach ((array) $request->input('variants', []) as $index => $variant) {
                $attributeIds = array_keys((array) ($variant['attributes'] ?? []));
                if (empty($attributeIds)) {
                    continue;
                }

                $validAttributeIds ??= Attribute::pluck('id')->map(fn ($id) => (string) $id)->all();
                $unknown = array_diff(array_map('strval', $attributeIds), $validAttributeIds);

                foreach ($unknown as $badId) {
                    $validator->errors()->add("variants.{$index}.attributes", "Unknown attribute id \"{$badId}\".");
                }
            }
        });

        $validated = $validator->validate();

        DB::transaction(function () use ($validated, $request, $product) {
            $oldCategoryIds = $product->categories()->pluck('categories.id')->map(fn ($id) => (int) $id)->sort()->values()->all();

            $product->update([
                'sku' => $validated['sku'],
                'family_id' => $validated['family_id'],
                'type' => strtolower($validated['type']),
                'enabled' => $validated['enabled'],
                'configurable_attributes' => $validated['configurable_attributes'] ?? $product->configurable_attributes,
                'updated_by' => $request->user()?->id,
            ]);

            $newCategoryIds = collect($validated['category_ids'] ?? [])->map(fn ($id) => (int) $id)->sort()->values()->all();
            $product->categories()->sync($newCategoryIds);
            $categoryChanged = $oldCategoryIds !== $newCategoryIds;

            $oldShopIds = $product->platformShops()->pluck('sales_platform_shops.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            $newShopIds = collect($validated['published_shop_ids'] ?? [])->map(fn ($id) => (int) $id)->sort()->values()->all();
            $product->platformShops()->sync($newShopIds);
            if ($oldShopIds !== $newShopIds) {
                AuditLog::record('published_shops_updated', $product, ['shop_ids' => $oldShopIds], ['shop_ids' => $newShopIds]);
            }

            $this->syncAssociations($product, $validated['associations'] ?? []);

            // $values is nested: attribute_id -> channelKey ('global' or channel id) -> localeKey ('default' or locale id) -> value.
            // The frontend already resolves each attribute's channelKey/localeKey against its
            // is_channel_based/is_locale_based flags, so this loop just needs to translate the
            // sentinel keys back to null for global/default scope.
            $values = $request->input('values', []);

            // Collects "values.{attributeId}" => message. Populated by both the
            // file-upload pass and the required/unique pass below, then thrown
            // together as one ValidationException so the whole save is rejected
            // atomically (the transaction rolls back) instead of partially
            // applying edits around a bad field.
            $valueErrors = [];

            $storeAttributeFile = function (Attribute $attribute, $file) use (&$valueErrors) {
                if (!$file) {
                    return null;
                }

                // Mirrors CategoryController's Image/File field rules (4MB images, 10MB
                // generic files) — this loop previously stored any uploaded file with no
                // mime-type or size restriction at all.
                $rules = in_array($attribute->type, ['image', 'gallery'], true)
                    ? ['image', 'max:4096']
                    : ['file', 'max:10240'];

                $validator = Validator::make(['file' => $file], ['file' => $rules]);

                if ($validator->fails()) {
                    $valueErrors["values.{$attribute->id}"] = "{$attribute->name}: " . $validator->errors()->first('file');

                    return null;
                }

                return $file->store('product-attributes', 'public');
            };

            foreach ($request->file('values', []) as $attributeId => $channelFiles) {
                $attribute = Attribute::find($attributeId);
                if (!$attribute) continue;

                if (is_array($channelFiles)) {
                    foreach ($channelFiles as $channelKey => $localeFiles) {
                        if (is_array($localeFiles)) {
                            foreach ($localeFiles as $localeKey => $file) {
                                if (is_array($file)) {
                                    // Gallery: the frontend now sends kept existing
                                    // paths (strings) mixed with newly picked files
                                    // at the same array indices. Multipart requests
                                    // keep uploads and plain fields separate even
                                    // within one array, so the kept strings already
                                    // survived into $values via the input() read
                                    // above — merge the new uploads' stored paths
                                    // back in instead of discarding them (previously
                                    // any new upload replaced the whole gallery).
                                    $keptPaths = array_values(array_filter(
                                        (array) ($values[$attributeId][$channelKey][$localeKey] ?? []),
                                        fn ($v) => is_string($v) && $v !== ''
                                    ));
                                    $newPaths = array_values(array_filter(array_map(
                                        fn ($f) => $storeAttributeFile($attribute, $f),
                                        array_filter($file)
                                    )));
                                    $values[$attributeId][$channelKey][$localeKey] = json_encode(array_merge($keptPaths, $newPaths));
                                } elseif ($file) {
                                    $path = $storeAttributeFile($attribute, $file);
                                    if ($path) {
                                        $values[$attributeId][$channelKey][$localeKey] = $path;
                                    }
                                }
                            }
                        } elseif ($localeFiles) {
                            $path = $storeAttributeFile($attribute, $localeFiles);
                            if ($path) {
                                $values[$attributeId][$channelKey]['default'] = $path;
                            }
                        }
                    }
                } elseif ($channelFiles) {
                    $path = $storeAttributeFile($attribute, $channelFiles);
                    if ($path) {
                        $values[$attributeId]['global']['default'] = $path;
                    }
                }
            }

            $touchedAttributeIds = collect($values)->keys()->filter(fn ($id) => is_numeric($id))->map(fn ($id) => (int) $id)->unique()->values();
            $oldProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);

            $user = $request->user();

            // Group each touched attribute belongs to, for this product's family —
            // needed so edit permission checks below can enforce the same
            // "read-only group overrides an individually-editable attribute" rule
            // that edit() already applies when rendering (see canUserEditAttributeGroup()
            // docblock). Without this, a request sent directly to this endpoint
            // (bypassing the UI, which does apply that rule) could still write an
            // attribute whose parent group is read-only.
            $attributeGroupsById = FamilyAttribute::with('attributeGroup')
                ->where('family_id', $product->family_id)
                ->whereIn('attribute_id', $touchedAttributeIds)
                ->get()
                ->keyBy('attribute_id')
                ->map(fn ($fa) => $fa->attributeGroup);

            $canEditTouchedAttribute = function ($attribute) use ($user, $attributeGroupsById) {
                if (!$user) return true;
                $group = $attributeGroupsById->get($attribute->id);
                if ($group && !$this->canUserEditAttributeGroup($user, $group)) return false;
                return $this->canUserEditAttribute($user, $attribute);
            };

            // Enforce each attribute's is_required/is_unique flags server-side —
            // previously only rendered as a cosmetic "*" on the frontend, with
            // nothing stopping a blank "required" value or a duplicate "unique"
            // one from being saved. Only checked for scopes actually present in
            // this submission (channels/locales the user hasn't opened yet were
            // never loaded into the form, so they can't be validated here) and
            // skipped for attributes this user has no edit permission for, same
            // as the persistence loop below silently skips those.
            if (is_array($values)) {
                foreach ($values as $attributeId => $channelValues) {
                    $attribute = Attribute::find($attributeId);
                    if (!$attribute || !is_array($channelValues)) continue;
                    if (!$canEditTouchedAttribute($attribute)) continue;

                    foreach ($channelValues as $channelKey => $localeValues) {
                        $channelId = $channelKey === 'global' ? null : $channelKey;
                        if (!is_array($localeValues)) continue;

                        foreach ($localeValues as $localeKey => $val) {
                            $localeId = $localeKey === 'default' ? null : $localeKey;
                            $isEmpty = $val === null || $val === '' || (is_array($val) && empty($val));

                            if ($attribute->is_required && $isEmpty) {
                                $valueErrors["values.{$attributeId}"] = "{$attribute->name} is required.";
                                continue;
                            }

                            if ($attribute->is_unique && !$isEmpty) {
                                $stringVal = is_array($val) ? json_encode($val) : (string) $val;
                                $taken = ProductValue::where('attribute_id', $attributeId)
                                    ->where('channel_id', $channelId)
                                    ->where('locale_id', $localeId)
                                    ->where('value', $stringVal)
                                    ->where('product_id', '!=', $product->id)
                                    ->exists();

                                if ($taken) {
                                    $valueErrors["values.{$attributeId}"] = "{$attribute->name} value \"{$stringVal}\" is already in use.";
                                }
                            }
                        }
                    }
                }
            }

            if (!empty($valueErrors)) {
                throw ValidationException::withMessages($valueErrors);
            }

            if (is_array($values)) {
                foreach ($values as $attributeId => $channelValues) {
                    $attribute = Attribute::find($attributeId);
                    if (!$attribute || !is_array($channelValues)) continue;

                    // Check if user has permission to edit this attribute (and that
                    // its attribute group isn't read-only — see $canEditTouchedAttribute above)
                    if (!$canEditTouchedAttribute($attribute)) {
                        continue;
                    }

                    foreach ($channelValues as $channelKey => $localeValues) {
                        $channelId = $channelKey === 'global' ? null : $channelKey;

                        if (!is_array($localeValues)) continue;

                        foreach ($localeValues as $localeKey => $val) {
                            $localeId = $localeKey === 'default' ? null : $localeKey;

                            // Uploads previously left the file they replaced on disk forever —
                            // grab whatever was stored before this write so it can be cleaned
                            // up below once the new value (or deletion) has been saved.
                            $isFileAttribute = in_array($attribute->type, ['image', 'gallery', 'file'], true);
                            $oldStoredValue = $isFileAttribute
                                ? ProductValue::where('product_id', $product->id)
                                    ->where('attribute_id', $attributeId)
                                    ->where('channel_id', $channelId)
                                    ->where('locale_id', $localeId)
                                    ->value('value')
                                : null;

                            // A gallery cleared down to zero images arrives here as `[]`
                            // (still touched, so still worth diffing/persisting) — treat
                            // that the same as null/'' instead of storing the literal
                            // string "[]", consistent with the is_required check above.
                            $isEmptyVal = $val === null || $val === '' || (is_array($val) && empty($val));

                            if (!$isEmptyVal) {
                                $newStoredValue = is_array($val) ? json_encode($val) : (string) $val;

                                ProductValue::updateOrCreate(
                                    [
                                        'product_id' => $product->id,
                                        'attribute_id' => $attributeId,
                                        'channel_id' => $channelId,
                                        'locale_id' => $localeId,
                                    ],
                                    [
                                        'value' => $newStoredValue,
                                    ]
                                );
                            } else {
                                $newStoredValue = null;

                                ProductValue::where('product_id', $product->id)
                                    ->where('attribute_id', $attributeId)
                                    ->where('channel_id', $channelId)
                                    ->where('locale_id', $localeId)
                                    ->delete();
                            }

                            if ($isFileAttribute && $oldStoredValue && $oldStoredValue !== $newStoredValue) {
                                $this->deleteRemovedAttributeFiles($attribute, $oldStoredValue, $newStoredValue);
                            }
                        }
                    }
                }
            }

            $newProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);
            $valuesChanged = $this->recordProductValueChanges($product, $oldProductValues, $newProductValues);

            if ($valuesChanged || $categoryChanged || $product->wasChanged(['sku', 'family_id', 'type', 'enabled'])) {
                event(new ProductDataChanged($product->id, $product->enabled));
            }

            // Sync Variants (Cartesian Product Children)
            $oldVariantValues = $this->variantValueSnapshot($product);

            // $request->has (not !empty) so that clearing every variant in the
            // Edit UI — submitting `variants: []` after regenerating with no
            // attributes selected — still deletes the now-orphaned children
            // below, instead of the empty array being mistaken for "field not
            // sent, leave variants alone".
            if (strtolower($validated['type']) === 'configurable' && $request->has('variants')) {
                $priceAttr = Attribute::where('code', 'price')->first();
                $qtyAttr = Attribute::where('code', 'qty')->first();
                $existingVariantIds = [];

                foreach ($validated['variants'] ?? [] as $variantData) {
                    $childProduct = null;
                    if (!empty($variantData['id'])) {
                        $childProduct = Product::find($variantData['id']);
                    }

                    if ($childProduct) {
                        // Renaming an existing variant had no uniqueness check at
                        // all — colliding with another product/variant's SKU hit
                        // the DB's unique constraint directly, raising a raw
                        // QueryException (500) instead of a clean validation error.
                        $skuTaken = Product::where('sku', $variantData['sku'])
                            ->where('id', '!=', $childProduct->id)
                            ->exists();

                        if ($skuTaken) {
                            throw ValidationException::withMessages([
                                'variants' => "SKU \"{$variantData['sku']}\" is already in use.",
                            ]);
                        }

                        $childProduct->update([
                            'sku' => $variantData['sku'],
                            'enabled' => $product->enabled,
                            'updated_by' => $request->user()?->id,
                        ]);
                    } else {
                        // Check unique SKU for new variants
                        $request->validate([
                            'variants.*.sku' => ['unique:products,sku'],
                        ]);

                        $childProduct = Product::create([
                            'sku' => $variantData['sku'],
                            'parent_id' => $product->id,
                            'family_id' => $product->family_id,
                            'type' => 'simple',
                            'enabled' => $product->enabled,
                            'created_by' => $request->user()?->id,
                            'updated_by' => $request->user()?->id,
                        ]);

                        $childProduct->applySmartDefaults();
                    }

                    $existingVariantIds[] = $childProduct->id;
                    
                    // Update price
                    if ($priceAttr) {
                        if (isset($variantData['price']) && $variantData['price'] !== '') {
                            ProductValue::updateOrCreate(
                                [
                                    'product_id' => $childProduct->id,
                                    'attribute_id' => $priceAttr->id,
                                ],
                                ['value' => (string) $variantData['price']]
                            );
                        } else {
                            ProductValue::where('product_id', $childProduct->id)->where('attribute_id', $priceAttr->id)->delete();
                        }
                    }

                    // Update qty
                    if ($qtyAttr) {
                        if (isset($variantData['qty']) && $variantData['qty'] !== '') {
                            ProductValue::updateOrCreate(
                                [
                                    'product_id' => $childProduct->id,
                                    'attribute_id' => $qtyAttr->id,
                                ],
                                ['value' => (string) $variantData['qty']]
                            );
                        } else {
                            ProductValue::where('product_id', $childProduct->id)->where('attribute_id', $qtyAttr->id)->delete();
                        }
                    }

                    // Save attribute combinations (new variants)
                    if (!empty($variantData['attributes'])) {
                        foreach ($variantData['attributes'] as $attrId => $attrVal) {
                            if ($attrVal !== null && $attrVal !== '') {
                                ProductValue::updateOrCreate(
                                    [
                                        'product_id' => $childProduct->id,
                                        'attribute_id' => $attrId,
                                    ],
                                    ['value' => (string) $attrVal]
                                );
                            }
                        }
                    }
                }

                // Delete variants removed from frontend. Deleted one-by-one (not a
                // bulk query delete) so Eloquent fires the `deleted` event and
                // Auditable actually records the removal.
                Product::where('parent_id', $product->id)->whereNotIn('id', $existingVariantIds)->get()->each->delete();
            } elseif (strtolower($validated['type']) !== 'configurable') {
                // Product Type was switched away from Configurable (or already
                // was Simple) — a Simple product can't have variant children,
                // so drop any that still exist instead of leaving them orphaned
                // under a parent that no longer presents itself as configurable.
                Product::where('parent_id', $product->id)->get()->each->delete();
            }

            $product->applySmartDefaults();
            foreach ($product->variants as $variant) {
                $variant->applySmartDefaults();
            }

            $newVariantValues = $this->variantValueSnapshot($product);
            $this->recordProductValueChanges($product, $oldVariantValues, $newVariantValues, 'variant_values_updated');
        });


        return to_route('catalog.products.index')->with('success', 'Product updated successfully.');
    }

    public function destroy(Product $product): RedirectResponse
    {
        $productId = $product->id;

        // Delete variant children one-by-one (not relying on the parent_id
        // cascadeOnDelete FK) so Eloquent fires `deleted` and Auditable
        // actually records their removal.
        Product::where('parent_id', $product->id)->get()->each->delete();

        ProductValue::where('product_id', $product->id)->delete();
        $product->delete();

        event(new ProductDataChanged($productId, false));

        return to_route('catalog.products.index')->with('success', 'Product deleted successfully.');
    }

    /**
     * Return the current value of every channel/locale-scopable attribute for
     * the given channel/locale combination. Used by the product edit page to
     * re-fetch just the scopable fields when the channel or locale selector changes.
     */
    public function attributeValues(Request $request, Product $product): JsonResponse
    {
        $channelId = $request->query('channel_id');
        $localeId = $request->query('locale_id');

        $attributes = $this->scopableAttributesFor($product, $request->user());

        $values = [];
        foreach ($attributes as $attribute) {
            $values[$attribute->id] = null;
        }

        // Group attributes by their scoping shape so each group can be fetched with a
        // single batched query instead of one query per attribute (N+1).
        $attributes->groupBy(fn ($attribute) => ($attribute->is_channel_based ? '1' : '0') . ($attribute->is_locale_based ? '1' : '0'))
            ->each(function ($group) use (&$values, $product, $channelId, $localeId) {
                $first = $group->first();

                ProductValue::where('product_id', $product->id)
                    ->whereIn('attribute_id', $group->pluck('id'))
                    ->where('channel_id', $first->is_channel_based ? $channelId : null)
                    ->where('locale_id', $first->is_locale_based ? $localeId : null)
                    ->pluck('value', 'attribute_id')
                    ->each(function ($value, $attributeId) use (&$values) {
                        $values[$attributeId] = $value;
                    });
            });

        return response()->json(['values' => $values]);
    }

    /**
     * Related/Up-sell/Cross-sell products for the edit page's Associations
     * panel, keyed by association type code, each entry {id, sku, name}.
     */
    private function associationsFor(Product $product): array
    {
        $records = $product->associations()->with(['associatedProduct', 'associationType'])->get();

        $nameAttributeId = Attribute::where('code', 'pname')->value('id');
        $names = $nameAttributeId
            ? ProductValue::whereIn('product_id', $records->pluck('associated_product_id'))
                ->where('attribute_id', $nameAttributeId)
                ->pluck('value', 'product_id')
            : collect();

        $grouped = ['related' => [], 'up_sell' => [], 'cross_sell' => []];

        foreach ($records as $record) {
            $code = $record->associationType?->code;
            if (!isset($grouped[$code]) || !$record->associatedProduct) {
                continue;
            }

            $grouped[$code][] = [
                'id' => $record->associatedProduct->id,
                'sku' => $record->associatedProduct->sku,
                'name' => $names->get($record->associatedProduct->id) ?: $record->associatedProduct->sku,
            ];
        }

        return $grouped;
    }

    /**
     * Replace-all-on-save sync for the 3 association types, mirroring the
     * delete-then-recreate pattern already used for variants above.
     */
    private function syncAssociations(Product $product, array $associations): void
    {
        foreach (['related', 'up_sell', 'cross_sell'] as $code) {
            $typeId = AssociationType::where('code', $code)->value('id');
            if (!$typeId) {
                continue;
            }

            ProductAssociation::where('owner_product_id', $product->id)
                ->where('association_type_id', $typeId)
                ->delete();

            $ids = collect($associations[$code] ?? [])->map(fn ($id) => (int) $id)->unique()->values();

            foreach ($ids as $associatedProductId) {
                ProductAssociation::create([
                    'owner_product_id' => $product->id,
                    'associated_product_id' => $associatedProductId,
                    'association_type_id' => $typeId,
                ]);
            }
        }
    }

    /**
     * Current attribute values for a product, restricted to the given
     * attribute ids, keyed by a human-readable "code[channel:x,locale:y]"
     * label so it reads sensibly in the audit diff table.
     */
    private function productValueSnapshot(int $productId, \Illuminate\Support\Collection $attributeIds): array
    {
        if ($attributeIds->isEmpty()) {
            return [];
        }

        $codes = Attribute::whereIn('id', $attributeIds)->pluck('code', 'id');

        return ProductValue::where('product_id', $productId)
            ->whereIn('attribute_id', $attributeIds)
            ->get()
            ->mapWithKeys(function (ProductValue $value) use ($codes) {
                $label = $codes->get($value->attribute_id, "attribute_{$value->attribute_id}");
                $suffix = array_filter([
                    $value->channel_id ? "channel:{$value->channel_id}" : null,
                    $value->locale_id ? "locale:{$value->locale_id}" : null,
                ]);
                $key = $suffix ? "{$label}[" . implode(',', $suffix) . ']' : $label;

                return [$key => $value->value];
            })
            ->all();
    }

    /**
     * Diff two productValueSnapshot() results and, if anything changed,
     * record it against the product's audit trail. Returns whether anything
     * actually changed, so callers can decide whether to notify the storefront.
     */
    private function recordProductValueChanges(Product $product, array $oldValues, array $newValues, string $event = 'attribute_values_updated'): bool
    {
        $changedOld = [];
        $changedNew = [];

        foreach (array_unique(array_merge(array_keys($oldValues), array_keys($newValues))) as $key) {
            $old = $oldValues[$key] ?? null;
            $new = $newValues[$key] ?? null;

            if ($old !== $new) {
                $changedOld[$key] = $old;
                $changedNew[$key] = $new;
            }
        }

        if (empty($changedOld) && empty($changedNew)) {
            return false;
        }

        AuditLog::record($event, $product, $changedOld, $changedNew);

        return true;
    }

    /**
     * Snapshot of every ProductValue row (price, qty, combination attributes)
     * belonging to the parent's current variant children, keyed by
     * "{variant sku}.{attribute code}" so a diff reads naturally against the
     * parent product's own audit trail — variants don't have an edit page of
     * their own, so this is the only place their changes are ever visible.
     */
    private function variantValueSnapshot(Product $product): array
    {
        $variants = Product::where('parent_id', $product->id)->get(['id', 'sku']);

        if ($variants->isEmpty()) {
            return [];
        }

        $codes = Attribute::pluck('code', 'id');

        return ProductValue::whereIn('product_id', $variants->pluck('id'))
            ->get()
            ->mapWithKeys(function (ProductValue $value) use ($variants, $codes) {
                $sku = $variants->firstWhere('id', $value->product_id)?->sku ?? "product#{$value->product_id}";
                $label = $codes->get($value->attribute_id, "attribute_{$value->attribute_id}");

                return ["{$sku}.{$label}" => $value->value];
            })
            ->all();
    }

    /**
     * Attributes assigned to the product's family (or all attributes, if the
     * family has none assigned yet) that vary by channel and/or locale.
     */
    /**
     * Attributes eligible for the channel/locale value refetch, scoped to the
     * product's family and — mirroring edit()'s group/attribute filtering —
     * to what $user is allowed to view, so switching the channel/locale
     * selector can't leak values for attributes the page itself would hide.
     */
    private function scopableAttributesFor(Product $product, $user = null)
    {
        $familyAttributes = FamilyAttribute::with(['attribute', 'attributeGroup'])
            ->where('family_id', $product->family_id)
            ->get();

        if ($familyAttributes->isNotEmpty()) {
            $attributes = $familyAttributes
                ->filter(function ($fa) use ($user) {
                    $group = $fa->attributeGroup;
                    $attr = $fa->attribute;
                    if (!$group || !$attr) {
                        return false;
                    }

                    if ($user && !$this->canUserViewAttributeGroup($user, $group)) {
                        return false;
                    }

                    return !$user || $this->canUserViewAttribute($user, $attr);
                })
                ->map(fn ($fa) => $fa->attribute);
        } else {
            // No family attributes assigned yet — edit() falls back to showing
            // every system attribute under "General", so mirror that here too.
            $attributes = Attribute::all();

            if ($user) {
                $attributes = $attributes->filter(fn ($attr) => $this->canUserViewAttribute($user, $attr));
            }
        }

        return $attributes
            ->filter(fn ($attr) => $attr->is_channel_based || $attr->is_locale_based)
            ->values();
    }

    /**
     * Check if a user has permission to view an attribute group. Thin
     * wrapper kept so every existing call site in this controller doesn't
     * need to change — the actual rule now lives in AttributeAccessPolicy
     * (shared with bulk product import/export column filtering).
     */
    private function canUserViewAttributeGroup($user, $group): bool
    {
        return $this->attributeAccess->canViewGroup($user, $group);
    }

    /**
     * Check if a user has permission to view a specific attribute. See
     * canUserViewAttributeGroup()'s docblock.
     */
    private function canUserViewAttribute($user, $attribute): bool
    {
        return $this->attributeAccess->canViewAttribute($user, $attribute);
    }

    /**
     * Check if a user has permission to *edit* an attribute group's values.
     * See canUserViewAttributeGroup()'s docblock.
     */
    private function canUserEditAttributeGroup($user, $group): bool
    {
        return $this->attributeAccess->canEditGroup($user, $group);
    }

    /**
     * Check if a user has permission to *edit* a specific attribute's value.
     * See canUserViewAttributeGroup()'s docblock.
     */
    private function canUserEditAttribute($user, $attribute): bool
    {
        return $this->attributeAccess->canEditAttribute($user, $attribute);
    }
}
