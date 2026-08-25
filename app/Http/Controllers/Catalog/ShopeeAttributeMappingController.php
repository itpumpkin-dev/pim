<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeSellerAccount;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Lets an admin pick which PIM attribute feeds each Shopee push field,
 * without a code change — see ShopeeProductSyncService::buildPayload()/
 * resolveMappedField() (structured fields) and resolveAttributes()
 * (`shopee_attribute`, the old attribute_list-only behavior), which read
 * this table instead of the old hardcoded pname/price_std/qty/weight_pcs/
 * product_details_features/attribute_6/length_pcs/width_pcs/height_pcs
 * lookups. v1 only supports free-text Shopee attributes (input_type
 * FREE_TEXT_FILED = 3) for the `shopee_attribute` target — select/dropdown
 * attributes need a specific value_id, not free text, so they're synced for
 * visibility but rejected as a mapping target here.
 *
 * The read-only index() this used to own now lives in
 * MarketplaceAttributeMappingController (bundled with WooCommerce/Lazada/
 * TikTok's equivalents into one Inertia response for the combined
 * "จับคู่เนื้อหา Marketplace" tabbed page) — this controller keeps only the
 * write actions.
 */
class ShopeeAttributeMappingController extends Controller
{
    private const MAPPABLE_INPUT_TYPE = 3; // FREE_TEXT_FILED

    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video',
        'shopee_attribute',
    ];

    public function update(Request $request): RedirectResponse|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.target_field' => ['nullable', Rule::in(self::TARGET_FIELDS)],
            'mappings.*.shopee_attribute_id' => ['nullable', 'integer', 'exists:shopee_attributes,id'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $entries = (array) $request->input('mappings', []);

            $shopeeAttributesById = ShopeeAttribute::whereIn(
                'id',
                collect($entries)->pluck('shopee_attribute_id')->filter()
            )->get()->keyBy('id');

            // Shopee's video_upload_id expects a real uploaded video file
            // (see ShopeeClient::uploadVideo(), which downloads whatever URL
            // is mapped here and re-uploads it as video bytes) — same
            // restriction Lazada/TikTok's video fields both enforce after a
            // real push broke there when a plain-text/URL attribute (e.g.
            // youtube_url) got mapped instead of an uploaded-file one.
            $attributesById = Attribute::whereIn(
                'id',
                collect($entries)->pluck('attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ($entries as $index => $entry) {
                $isShopeeAttribute = ($entry['target_field'] ?? null) === 'shopee_attribute';
                $shopeeAttributeId = $entry['shopee_attribute_id'] ?? null;

                if ($isShopeeAttribute && !$shopeeAttributeId) {
                    $validator->errors()->add("mappings.{$index}.shopee_attribute_id", 'A Shopee attribute must be chosen for this mapping.');
                    continue;
                }
                if (!$isShopeeAttribute && $shopeeAttributeId) {
                    $validator->errors()->add("mappings.{$index}.shopee_attribute_id", 'Only valid when target_field is shopee_attribute.');
                    continue;
                }

                if (($entry['target_field'] ?? null) === 'video') {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    if ($attribute && $attribute->type !== 'video') {
                        $validator->errors()->add(
                            "mappings.{$index}.target_field",
                            "Shopee's video field expects an uploaded file, not an external URL — only a video-type PIM attribute can be mapped here."
                        );
                    }
                }

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
            if (empty($entry['target_field'])) {
                ShopeeAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = ShopeeAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->target_field = $entry['target_field'];
            $mapping->shopee_attribute_id = $entry['shopee_attribute_id'] ?? null;
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        ShopeeAttributeMapping::bumpListVersion();

        // The embedded per-category picker on categories/shopee-mapping.tsx
        // calls this same endpoint via plain fetch (Accept: application/json)
        // instead of an Inertia visit — see
        // BrandController::bulkMapMarketplaceBrand()'s identical branch for
        // why. Every other caller is a real Inertia POST, unaffected.
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
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

        ShopeeAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsById).' Shopee attributes.');
    }

    /**
     * Same idea as syncShopeeAttributes() above, but scoped to exactly one
     * Shopee category — the "Sync Attributes" action on
     * categories/shopee-mapping.tsx, next to that page's identical "Sync
     * brand" row action (see BrandController::syncShopeeBrandsForCategory()).
     * Unlike brands, get_attribute_tree has no pagination and a category's
     * schema is small (single digits to a few dozen rows, not thousands), so
     * this runs synchronously in the request — no JobTracker/queue needed.
     */
    public function syncShopeeAttributesForCategory(Request $request): JsonResponse
    {
        $account = ShopeeSellerAccount::first();
        if (! $account) {
            return response()->json(['message' => 'No Shopee seller account found to authenticate the sync.'], 422);
        }

        $validated = $request->validate([
            'shopee_category_id' => ['required', 'integer', 'exists:shopee_categories,id'],
        ]);
        $categoryId = $validated['shopee_category_id'];

        $client = new ShopeeClient($account);
        $response = $client->getAttributeTree([$categoryId]);
        $tree = $response['response']['list'][0]['attribute_tree'] ?? [];

        $now = now();
        $rows = array_map(fn (array $attr) => [
            'id' => $attr['attribute_id'],
            'name' => $attr['name'],
            'input_type' => $attr['attribute_info']['input_type'] ?? null,
            'category_id' => $categoryId,
            'mandatory' => (bool) ($attr['mandatory'] ?? false),
            'created_at' => $now,
            'updated_at' => $now,
        ], $tree);

        if ($rows !== []) {
            ShopeeAttribute::upsert($rows, ['id'], ['name', 'input_type', 'category_id', 'mandatory', 'updated_at']);
        }

        ShopeeAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * Shopee attributes cached for one category (see the migration's
     * "informational, not a real FK" caveat on that column — this lists
     * whatever the most recent sync for that category actually saw), each
     * annotated with whichever PIM attribute currently maps to it, if any.
     * Backs the "จับคู่แบรนด์กับ PIM"-equivalent column's table on
     * categories/shopee-mapping.tsx — mirrors
     * BrandController::shopeeBrandsForCategory() exactly.
     */
    public function shopeeAttributesForCategory(int $shopeeCategoryId): JsonResponse
    {
        $attributes = ShopeeAttribute::where('category_id', $shopeeCategoryId)->orderBy('name')->get();

        $mappedByShopeeAttributeId = ShopeeAttributeMapping::whereIn('shopee_attribute_id', $attributes->pluck('id'))
            ->with('attribute:id,name')
            ->get()
            ->keyBy('shopee_attribute_id');

        $data = $attributes->map(function (ShopeeAttribute $attribute) use ($mappedByShopeeAttributeId) {
            $mapping = $mappedByShopeeAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'input_type' => $attribute->input_type,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }

    /**
     * Search endpoint backing the PIM attribute Autocomplete inside that
     * same table — the mirror image of BrandController::searchPimBrands():
     * that one searches PIM brand options, this searches PIM attributes by
     * label, since here too mapping starts from the Shopee side (pick a PIM
     * attribute for a given Shopee attribute row) rather than the other way
     * around.
     */
    public function searchPimAttributes(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $attributes = Attribute::query()
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($q2) use ($query) {
                    $q2->where('name', 'like', "%{$query}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$query}%"));
                });
            })
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name']);

        return response()->json(['data' => $attributes->map(fn (Attribute $a) => ['id' => $a->id, 'name' => $a->name])]);
    }
}
