<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Events\ProductDataChanged;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Channel;
use App\Models\FamilyAttribute;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\GridManager;
use App\Services\ImportExport\Importers\ProductRowImporter;
use App\Services\ImportExport\SpreadsheetWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ProductController extends Controller
{
    use HasVersionHistory;


    public function index(Request $request): Response
    {
        $grid = new GridManager('product_grid');

        $gridData = $grid->getData($request);

        $nameAttributeId = Attribute::where('code', 'name')->value('id');

        $imageAttributeIdByFamily = FamilyAttribute::query()
            ->join('attributes', 'attributes.id', '=', 'family_attributes.attribute_id')
            ->where('attributes.type', 'image')
            ->pluck('attributes.id', 'family_attributes.family_id');

        $productIds = $gridData->getCollection()->pluck('id');
        $parentIds = $gridData->getCollection()->pluck('parent_id')->filter()->unique();

        $parentSkus = $parentIds->isNotEmpty()
            ? Product::whereIn('id', $parentIds)->pluck('sku', 'id')
            : collect();

        $allAttributes = Attribute::orderBy('code')->get(['id', 'code', 'name', 'type']);

        $values = ProductValue::whereIn('product_id', $productIds)
            ->get(['product_id', 'attribute_id', 'value']);

        $items = $gridData->getCollection()->map(function ($product) use ($values, $nameAttributeId, $imageAttributeIdByFamily, $allAttributes, $parentSkus) {
            $product->family_code = $product->family ? ($product->family->name ?: $product->family->code) : '-';

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
            'filters' => $request->only(['search', 'sort', 'dir']),
            'attributes' => $allAttributes->map(fn (Attribute $attribute) => [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
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

        $columns = (new ProductRowImporter())->columns();
        $attributeCodes = array_slice($columns, 4);
        $attributesByCode = Attribute::whereIn('code', $attributeCodes)->get()->keyBy('code');

        $query = Product::with('family')->orderBy('id');
        if (!empty($ids)) {
            $query->whereIn('id', $ids);
        } elseif (!empty($validated['search'])) {
            $query->where('sku', 'like', '%'.$validated['search'].'%');
        }

        $rows = (function () use ($query, $attributesByCode) {
            foreach ($query->cursor() as $product) {
                $values = ProductValue::where('product_id', $product->id)
                    ->whereNull('channel_id')
                    ->whereNull('locale_id')
                    ->pluck('value', 'attribute_id');

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
        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        if ($attribute->type === 'gallery') {
            $paths = json_decode($rawValue, true) ?: [];

            return array_map(fn ($path) => Storage::url($path), $paths);
        }

        if (in_array($attribute->type, ['image', 'file'], true)) {
            return Storage::url($rawValue);
        }

        return $rawValue;
    }

    public function create(): Response
    {
        $families = AttributeFamily::select('id', 'code', 'name')->get();
        $attributes = Attribute::with('options')->select('id', 'code', 'name', 'type')->get();

        return Inertia::render('catalog/products/create', [
            'families' => $families,
            'attributes' => $attributes,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'max:100', 'unique:products,sku'],
            'family_id' => ['required', 'exists:attribute_families,id'],
            'type' => ['required', 'in:simple,configurable'],
            'enabled' => ['required', 'boolean'],
            'variants' => ['nullable', 'array'],
            'variants.*.sku' => ['required_if:type,configurable', 'string', 'max:100', 'unique:products,sku'],
            'variants.*.price' => ['nullable', 'numeric'],
            'variants.*.qty' => ['nullable', 'integer'],
            'variants.*.attributes' => ['nullable', 'array'],
        ]);

        DB::transaction(function () use ($validated, $request) {
            $parentProduct = Product::create([
                'sku' => $validated['sku'],
                'family_id' => $validated['family_id'],
                'type' => $validated['type'],
                'enabled' => $validated['enabled'],
                'created_by' => $request->user()?->id,
                'updated_by' => $request->user()?->id,
            ]);

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
            }
        });

        return to_route('catalog.products.index')->with('success', 'Product created successfully.');
    }

    public function edit(Product $product): Response
    {
        $families = AttributeFamily::select('id', 'code', 'name')->get();

        // Load pivot family_attributes for this product's family
        $familyAttributes = FamilyAttribute::with(['attribute.options', 'attributeGroup'])
            ->where('family_id', $product->family_id)
            ->get();

        // Group attributes dynamically by attributeGroup
        $groupsData = [];
        foreach ($familyAttributes as $fa) {
            $group = $fa->attributeGroup;
            $attr = $fa->attribute;
            if (!$group || !$attr) continue;

            $groupId = $group->id;
            if (!isset($groupsData[$groupId])) {
                $groupsData[$groupId] = [
                    'id' => $group->id,
                    'code' => $group->code,
                    'name' => $group->name ?: ucfirst($group->code),
                    'attributes' => [],
                ];
            }
            $groupsData[$groupId]['attributes'][] = $attr;
        }

        // If product family has no assigned family attributes yet, show all system attributes under General
        if (empty($groupsData)) {
            $allAttributes = Attribute::with('options')->get();
            $groupsData[] = [
                'id' => 0,
                'code' => 'general',
                'name' => 'General',
                'attributes' => $allAttributes,
            ];
        } else {
            $groupsData = array_values($groupsData);
        }

        // Preload values scoped to no channel (global attributes) plus the default
        // channel, across all locales. Values for other channels are fetched on
        // demand via GET .../attribute-values when the user switches the channel
        // selector, to keep this initial payload bounded.
        $channels = Channel::all()->map(fn (Channel $c) => ['id' => $c->id, 'code' => $c->code, 'name' => $c->name]);
        $defaultChannelId = $channels->first()['id'] ?? null;

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
                    }
                    $variantValues[$val->attribute_id] = $val->value;
                }

                $variantsData[] = [
                    'id' => $variant->id,
                    'sku' => $variant->sku,
                    'price' => $price,
                    'qty' => $qty,
                    'values' => $variantValues,
                ];
            }
        }

        $family = $product->family;

        return Inertia::render('catalog/products/edit', [
            'product' => [
                'id' => $product->id,
                'sku' => $product->sku,
                'family_id' => $product->family_id,
                'family_code' => $family ? ($family->name ?: ucfirst($family->code)) : 'Default',
                'type' => ucfirst($product->type),
                'enabled' => (bool)$product->enabled,
                'created_at' => $product->created_at ? $product->created_at->format('Y-m-d H:i:s') : now()->format('Y-m-d H:i:s'),
                'updated_at' => $product->updated_at ? $product->updated_at->format('Y-m-d H:i:s') : now()->format('Y-m-d H:i:s'),
            ],
            'families' => $families,
            'assignedGroups' => $groupsData,
            'productValues' => $values,
            'variants' => $variantsData,
            'channels' => $channels,
            'canViewHistory' => auth()->user()?->hasPermission('products', 'view_history') ?? false,
        ]);
    }

    public function history(Product $product): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($product)]);
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'max:100', 'unique:products,sku,' . $product->id],
            'family_id' => ['required', 'exists:attribute_families,id'],
            'type' => ['required', 'in:simple,configurable,Simple,Configurable'],
            'enabled' => ['required', 'boolean'],
            'values' => ['nullable', 'array'],
            'variants' => ['nullable', 'array'],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.sku' => ['required_if:type,configurable', 'string', 'max:100'],
            'variants.*.price' => ['nullable', 'numeric'],
            'variants.*.qty' => ['nullable', 'integer'],
        ]);

        DB::transaction(function () use ($validated, $request, $product) {
            $product->update([
                'sku' => $validated['sku'],
                'family_id' => $validated['family_id'],
                'type' => strtolower($validated['type']),
                'enabled' => $validated['enabled'],
                'updated_by' => $request->user()?->id,
            ]);

            // $values is nested: attribute_id -> channelKey ('global' or channel id) -> localeKey ('default' or locale id) -> value.
            // The frontend already resolves each attribute's channelKey/localeKey against its
            // is_channel_based/is_locale_based flags, so this loop just needs to translate the
            // sentinel keys back to null for global/default scope.
            $values = $request->input('values', []);

            foreach ($request->file('values', []) as $attributeId => $channelFiles) {
                if (is_array($channelFiles)) {
                    foreach ($channelFiles as $channelKey => $localeFiles) {
                        if (is_array($localeFiles)) {
                            foreach ($localeFiles as $localeKey => $file) {
                                if (is_array($file)) {
                                    $paths = array_map(fn ($f) => $f->store('product-attributes', 'public'), array_filter($file));
                                    $values[$attributeId][$channelKey][$localeKey] = json_encode($paths);
                                } elseif ($file) {
                                    $values[$attributeId][$channelKey][$localeKey] = $file->store('product-attributes', 'public');
                                }
                            }
                        } elseif ($localeFiles) {
                            $values[$attributeId][$channelKey]['default'] = $localeFiles->store('product-attributes', 'public');
                        }
                    }
                } elseif ($channelFiles) {
                    $values[$attributeId]['global']['default'] = $channelFiles->store('product-attributes', 'public');
                }
            }

            $touchedAttributeIds = collect($values)->keys()->filter(fn ($id) => is_numeric($id))->map(fn ($id) => (int) $id)->unique()->values();
            $oldProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);

            if (is_array($values)) {
                foreach ($values as $attributeId => $channelValues) {
                    $attribute = Attribute::find($attributeId);
                    if (!$attribute || !is_array($channelValues)) continue;

                    foreach ($channelValues as $channelKey => $localeValues) {
                        $channelId = $channelKey === 'global' ? null : $channelKey;

                        if (!is_array($localeValues)) continue;

                        foreach ($localeValues as $localeKey => $val) {
                            $localeId = $localeKey === 'default' ? null : $localeKey;

                            if ($val !== null && $val !== '') {
                                ProductValue::updateOrCreate(
                                    [
                                        'product_id' => $product->id,
                                        'attribute_id' => $attributeId,
                                        'channel_id' => $channelId,
                                        'locale_id' => $localeId,
                                    ],
                                    [
                                        'value' => is_array($val) ? json_encode($val) : (string)$val,
                                    ]
                                );
                            } else {
                                ProductValue::where('product_id', $product->id)
                                    ->where('attribute_id', $attributeId)
                                    ->where('channel_id', $channelId)
                                    ->where('locale_id', $localeId)
                                    ->delete();
                            }
                        }
                    }
                }
            }

            $newProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);
            $valuesChanged = $this->recordProductValueChanges($product, $oldProductValues, $newProductValues);

            if ($valuesChanged || $product->wasChanged(['sku', 'family_id', 'type', 'enabled'])) {
                event(new ProductDataChanged($product->id, $product->enabled));
            }

            // Sync Variants (Cartesian Product Children)
            if (strtolower($validated['type']) === 'configurable' && !empty($validated['variants'])) {
                $priceAttr = Attribute::where('code', 'price')->first();
                $qtyAttr = Attribute::where('code', 'qty')->first();
                $existingVariantIds = [];

                foreach ($validated['variants'] as $variantData) {
                    $childProduct = null;
                    if (!empty($variantData['id'])) {
                        $childProduct = Product::find($variantData['id']);
                    }

                    if ($childProduct) {
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

                // Delete variants removed from frontend
                Product::where('parent_id', $product->id)->whereNotIn('id', $existingVariantIds)->delete();
            }
        });

        return to_route('catalog.products.index')->with('success', 'Product updated successfully.');
    }

    public function destroy(Product $product): RedirectResponse
    {
        $productId = $product->id;

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

        $values = [];
        foreach ($this->scopableAttributesFor($product) as $attribute) {
            $values[$attribute->id] = ProductValue::where('product_id', $product->id)
                ->where('attribute_id', $attribute->id)
                ->where('channel_id', $attribute->is_channel_based ? $channelId : null)
                ->where('locale_id', $attribute->is_locale_based ? $localeId : null)
                ->value('value');
        }

        return response()->json(['values' => $values]);
    }

    /**
     * Standalone API to set a batch of attribute values for one channel/locale
     * combination, applying each attribute's own scoping rule server-side.
     */
    public function updateAttributeValue(Request $request, Product $product): JsonResponse
    {
        $validated = $request->validate([
            'channel_id' => ['nullable', 'exists:channels,id'],
            'locale_id' => ['nullable', 'exists:locales,id'],
            'values' => ['required', 'array'],
        ]);

        $touchedAttributeIds = collect($validated['values'])->keys()->map(fn ($id) => (int) $id)->unique()->values();
        $oldProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);

        foreach ($validated['values'] as $attributeId => $val) {
            $attribute = Attribute::find($attributeId);
            if (!$attribute) continue;

            $channelId = $attribute->is_channel_based ? ($validated['channel_id'] ?? null) : null;
            $localeId = $attribute->is_locale_based ? ($validated['locale_id'] ?? null) : null;

            if ($val !== null && $val !== '') {
                ProductValue::updateOrCreate(
                    [
                        'product_id' => $product->id,
                        'attribute_id' => $attributeId,
                        'channel_id' => $channelId,
                        'locale_id' => $localeId,
                    ],
                    ['value' => is_array($val) ? json_encode($val) : (string) $val]
                );
            } else {
                ProductValue::where('product_id', $product->id)
                    ->where('attribute_id', $attributeId)
                    ->where('channel_id', $channelId)
                    ->where('locale_id', $localeId)
                    ->delete();
            }
        }

        $newProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);
        $valuesChanged = $this->recordProductValueChanges($product, $oldProductValues, $newProductValues);

        if ($valuesChanged) {
            event(new ProductDataChanged($product->id, $product->enabled));
        }

        return response()->json(['success' => true]);
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
    private function recordProductValueChanges(Product $product, array $oldValues, array $newValues): bool
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

        AuditLog::record('attribute_values_updated', $product, $changedOld, $changedNew);

        return true;
    }

    /**
     * Attributes assigned to the product's family (or all attributes, if the
     * family has none assigned yet) that vary by channel and/or locale.
     */
    private function scopableAttributesFor(Product $product)
    {
        $familyAttributeIds = FamilyAttribute::where('family_id', $product->family_id)->pluck('attribute_id');

        return Attribute::when($familyAttributeIds->isNotEmpty(), fn ($q) => $q->whereIn('id', $familyAttributeIds))
            ->where(function ($q) {
                $q->where('is_channel_based', true)->orWhere('is_locale_based', true);
            })
            ->get(['id', 'is_channel_based', 'is_locale_based']);
    }
}
