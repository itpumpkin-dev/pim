<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
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

        $relevantAttributeIds = $imageAttributeIdByFamily->values()->push($nameAttributeId)->filter()->unique();

        $values = ProductValue::whereIn('product_id', $productIds)
            ->whereIn('attribute_id', $relevantAttributeIds)
            ->get(['product_id', 'attribute_id', 'value']);

        $items = $gridData->getCollection()->map(function ($product) use ($values, $nameAttributeId, $imageAttributeIdByFamily) {
            $product->family_code = $product->family ? ($product->family->name ?: $product->family->code) : '-';

            $product->name = $nameAttributeId
                ? optional($values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $nameAttributeId))->value
                : null;

            $imageAttributeId = $imageAttributeIdByFamily->get($product->family_id);
            $imagePath = $imageAttributeId
                ? optional($values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $imageAttributeId))->value
                : null;
            $product->image_url = $imagePath ? Storage::url($imagePath) : null;

            return $product;
        });
        $gridData->setCollection($items);

        return Inertia::render('catalog/products/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $gridData,
            'filters' => $request->only(['search', 'sort', 'dir']),
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
        $attributes = Attribute::select('id', 'code', 'name', 'type')->get();

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
        ]);

        Product::create([
            'sku' => $validated['sku'],
            'family_id' => $validated['family_id'],
            'type' => $validated['type'],
            'enabled' => $validated['enabled'],
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

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

        $rawValues = ProductValue::where('product_id', $product->id)->get();
        $values = [];
        foreach ($rawValues as $val) {
            $key = $val->locale_id ?: 'default';
            $values[$val->attribute_id][$key] = $val->value;
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
        ]);
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'max:100', 'unique:products,sku,' . $product->id],
            'family_id' => ['required', 'exists:attribute_families,id'],
            'type' => ['required', 'in:simple,configurable,Simple,Configurable'],
            'enabled' => ['required', 'boolean'],
            'values' => ['nullable', 'array'],
        ]);

        $product->update([
            'sku' => $validated['sku'],
            'family_id' => $validated['family_id'],
            'type' => strtolower($validated['type']),
            'enabled' => $validated['enabled'],
            'updated_by' => $request->user()?->id,
        ]);

        $values = $request->input('values', []);

        foreach ($request->file('values', []) as $attributeId => $localeFiles) {
            if (is_array($localeFiles)) {
                foreach ($localeFiles as $localeKey => $file) {
                    if (is_array($file)) {
                        $paths = array_map(fn ($f) => $f->store('product-attributes', 'public'), array_filter($file));
                        $values[$attributeId][$localeKey] = json_encode($paths);
                    } elseif ($file) {
                        $values[$attributeId][$localeKey] = $file->store('product-attributes', 'public');
                    }
                }
            } elseif ($localeFiles) {
                $values[$attributeId]['default'] = $localeFiles->store('product-attributes', 'public');
            }
        }

        if (is_array($values)) {
            foreach ($values as $attributeId => $localeValues) {
                $attribute = Attribute::find($attributeId);
                if (!$attribute) continue;

                if (is_array($localeValues)) {
                    foreach ($localeValues as $localeKey => $val) {
                        $localeId = $localeKey === 'default' ? null : $localeKey;

                        if ($val !== null && $val !== '') {
                            ProductValue::updateOrCreate(
                                [
                                    'product_id' => $product->id,
                                    'attribute_id' => $attributeId,
                                    'locale_id' => $localeId,
                                ],
                                [
                                    'value' => is_array($val) ? json_encode($val) : (string)$val,
                                ]
                            );
                        } else {
                            ProductValue::where('product_id', $product->id)
                                ->where('attribute_id', $attributeId)
                                ->where('locale_id', $localeId)
                                ->delete();
                        }
                    }
                } else {
                    if ($localeValues !== null && $localeValues !== '') {
                        ProductValue::updateOrCreate(
                            [
                                'product_id' => $product->id,
                                'attribute_id' => $attributeId,
                                'locale_id' => null,
                            ],
                            [
                                'value' => (string)$localeValues,
                            ]
                        );
                    } else {
                        ProductValue::where('product_id', $product->id)
                            ->where('attribute_id', $attributeId)
                            ->whereNull('locale_id')
                            ->delete();
                    }
                }
            }
        }

        return to_route('catalog.products.index')->with('success', 'Product updated successfully.');
    }

    public function destroy(Product $product): RedirectResponse
    {
        ProductValue::where('product_id', $product->id)->delete();
        $product->delete();

        return to_route('catalog.products.index')->with('success', 'Product deleted successfully.');
    }
}
