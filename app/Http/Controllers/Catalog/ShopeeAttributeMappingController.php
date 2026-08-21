<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeSellerAccount;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Lets an admin pick which PIM attribute feeds each Shopee attribute_list
 * entry, without a code change — see ShopeeProductSyncService::
 * resolveAttributes(), which reads this table instead of the old hardcoded
 * SHOPEE_ATTRIBUTE_SOURCE const. v1 only supports free-text Shopee
 * attributes (input_type FREE_TEXT_FILED = 3) — select/dropdown attributes
 * need a specific value_id, not free text, so they're synced for visibility
 * but rejected as a mapping target here.
 */
class ShopeeAttributeMappingController extends Controller
{
    private const MAPPABLE_INPUT_TYPE = 3; // FREE_TEXT_FILED

    public function index(): Response
    {
        $mappingsByAttributeId = ShopeeAttributeMapping::all()->keyBy('attribute_id');

        $attributes = Attribute::cachedList()->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'shopee_attribute_id' => $mapping->shopee_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();

        return Inertia::render('catalog/attributes/shopee-mapping', [
            'attributes' => $attributes,
            'shopeeAttributes' => ShopeeAttribute::orderBy('name')->get(['id', 'name', 'input_type']),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.shopee_attribute_id' => ['nullable', 'integer', 'exists:shopee_attributes,id'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $shopeeAttributesById = ShopeeAttribute::whereIn(
                'id',
                collect($request->input('mappings', []))->pluck('shopee_attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ((array) $request->input('mappings', []) as $index => $entry) {
                $shopeeAttributeId = $entry['shopee_attribute_id'] ?? null;
                if (!$shopeeAttributeId) {
                    continue;
                }

                $target = $shopeeAttributesById->get($shopeeAttributeId);
                if ($target && (int) $target->input_type !== self::MAPPABLE_INPUT_TYPE) {
                    $validator->errors()->add(
                        "mappings.{$index}.shopee_attribute_id",
                        'Only free-text Shopee attributes can be mapped yet.'
                    );
                }
            }
        });

        $validated = $validator->validate();

        foreach ($validated['mappings'] as $entry) {
            if (empty($entry['shopee_attribute_id'])) {
                ShopeeAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = ShopeeAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->shopee_attribute_id = $entry['shopee_attribute_id'];
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        return back()->with('success', 'Shopee attribute mapping saved.');
    }

    /**
     * Pulls Shopee's real attribute schema in (read-only against Shopee)
     * for every PIM category currently mapped to a shopee_category_id,
     * batched 20 at a time per get_attribute_tree's documented max, deduped
     * globally by attribute_id (confirmed live 2026-08-14 to be stable
     * across categories). Mirrors CategoryController::syncShopeeCategories()
     * for account resolution.
     */
    public function syncShopeeAttributes(): RedirectResponse
    {
        $account = ShopeeSellerAccount::first();
        if (!$account) {
            return back()->with('error', 'No Shopee seller account found to authenticate the sync.');
        }

        $categoryIds = Category::whereNotNull('shopee_category_id')
            ->distinct()
            ->pluck('shopee_category_id')
            ->all();

        if (empty($categoryIds)) {
            return back()->with('error', 'No PIM category is mapped to a Shopee category yet — nothing to sync attributes for.');
        }

        $client = new ShopeeClient($account);
        $rowsById = [];

        foreach (array_chunk($categoryIds, 20) as $chunk) {
            $response = $client->getAttributeTree($chunk);

            foreach ($response['response']['list'] ?? [] as $categoryResult) {
                foreach ($categoryResult['attribute_tree'] ?? [] as $attr) {
                    $rowsById[$attr['attribute_id']] = [
                        'id' => $attr['attribute_id'],
                        'name' => $attr['name'],
                        'input_type' => $attr['attribute_info']['input_type'] ?? null,
                    ];
                }
            }
        }

        $now = now();
        foreach (array_chunk(array_values($rowsById), 500) as $chunk) {
            ShopeeAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['name', 'input_type', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($rowsById).' Shopee attributes.');
    }
}
