<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokSellerAccount;
use App\Services\TikTok\TikTokClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Lets an admin pick which PIM attribute feeds each TikTok push field,
 * without a code change — see TikTokProductSyncService::buildPayload()/
 * resolveMappedField() (structured fields) and resolveProductAttributes()
 * (`tiktok_attribute`, the old behavior), which read this table instead of
 * the old hardcoded pname/price_std/qty/weight_pcs/product_details_features/
 * attribute_6/DIMENSION_FIELD_SOURCE lookups. v1 only supports attributes
 * TikTok itself marks `is_customizable` (the seller may type a free value)
 * for the `tiktok_attribute` target — attributes without that flag need a
 * specific predefined value from TikTok's own `values[]` list, not an
 * arbitrary one, so they're synced for visibility but rejected as a mapping
 * target here (same scope decision already made for Shopee/Lazada's
 * equivalent pages).
 *
 * The read-only index() this used to own now lives in
 * MarketplaceAttributeMappingController (bundled with WooCommerce/Shopee/
 * Lazada's equivalents into one Inertia response for the combined
 * "จับคู่แอตทริบิวต์ Marketplace" tabbed page) — this controller keeps only the
 * write actions.
 */
class TikTokAttributeMappingController extends Controller
{
    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video',
        'tiktok_attribute',
    ];

    public function update(Request $request): RedirectResponse|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.target_field' => ['nullable', Rule::in(self::TARGET_FIELDS)],
            'mappings.*.tiktok_attribute_id' => ['nullable', 'string', 'exists:tiktok_attributes,id'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $entries = (array) $request->input('mappings', []);

            $tiktokAttributesById = TikTokAttribute::whereIn(
                'id',
                collect($entries)->pluck('tiktok_attribute_id')->filter()
            )->get()->keyBy('id');

            // Same external-video restriction as Lazada's video field (see
            // LazadaAttributeMappingController's docblock for the live
            // incident this prevents a repeat of) — only a PIM attribute of
            // type `video` may ever be mapped to target_field='video'.
            $attributesById = Attribute::whereIn(
                'id',
                collect($entries)->pluck('attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ($entries as $index => $entry) {
                $isTiktokAttribute = ($entry['target_field'] ?? null) === 'tiktok_attribute';
                $tiktokAttributeId = $entry['tiktok_attribute_id'] ?? null;

                if ($isTiktokAttribute && !$tiktokAttributeId) {
                    $validator->errors()->add("mappings.{$index}.tiktok_attribute_id", 'A TikTok attribute must be chosen for this mapping.');
                    continue;
                }
                if (!$isTiktokAttribute && $tiktokAttributeId) {
                    $validator->errors()->add("mappings.{$index}.tiktok_attribute_id", 'Only valid when target_field is tiktok_attribute.');
                    continue;
                }

                if (($entry['target_field'] ?? null) === 'video') {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    if ($attribute && $attribute->type !== 'video') {
                        $validator->errors()->add(
                            "mappings.{$index}.target_field",
                            "TikTok's video field expects an uploaded file, not an external URL — only a video-type PIM attribute can be mapped here."
                        );
                    }
                }

                if (!$tiktokAttributeId) {
                    continue;
                }

                $target = $tiktokAttributesById->get($tiktokAttributeId);
                if ($target && !$target->is_customizable) {
                    $validator->errors()->add(
                        "mappings.{$index}.tiktok_attribute_id",
                        'Only customizable (free-value) TikTok attributes can be mapped yet.'
                    );
                }
            }
        });

        $validated = $validator->validate();

        foreach ($validated['mappings'] as $entry) {
            if (empty($entry['target_field'])) {
                TikTokAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = TikTokAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->target_field = $entry['target_field'];
            $mapping->tiktok_attribute_id = $entry['tiktok_attribute_id'] ?? null;
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        TikTokAttributeMapping::bumpListVersion();

        // The embedded per-category picker on categories/tiktok-mapping.tsx
        // calls this same endpoint via plain fetch (Accept: application/json)
        // instead of an Inertia visit — see
        // ShopeeAttributeMappingController::update()'s identical branch for
        // why. Every other caller is a real Inertia POST, unaffected.
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'TikTok attribute mapping saved.');
    }

    /**
     * Pulls TikTok's real category attribute schema in (read-only against
     * TikTok) for every PIM category currently mapped to a
     * tiktok_category_id, one getAttributes() call per distinct category
     * (TikTok's endpoint takes a single category_id, not a batch list, same
     * as Lazada's /category/attributes/get). Deduped globally by attribute
     * `id` — see the migration's docblock for the caveat on that. Paced
     * with a short sleep between calls, same defensive precaution as
     * LazadaAttributeMappingController::syncLazadaAttributes().
     */
    public function syncTikTokAttributes(): RedirectResponse
    {
        $account = TikTokSellerAccount::first();
        if (!$account) {
            return back()->with('error', 'No TikTok seller account found to authenticate the sync.');
        }

        $categoryIds = Category::whereNotNull('tiktok_category_id')
            ->distinct()
            ->pluck('tiktok_category_id')
            ->all();

        if (empty($categoryIds)) {
            return back()->with('error', 'No PIM category is mapped to a TikTok category yet — nothing to sync attributes for.');
        }

        $client = new TikTokClient($account);
        $rowsById = [];

        foreach ($categoryIds as $index => $categoryId) {
            $response = $client->getAttributes((string) $categoryId);

            foreach ($response['data']['attributes'] ?? [] as $attr) {
                if (($attr['type'] ?? null) !== 'PRODUCT_PROPERTY') {
                    continue;
                }

                $rowsById[$attr['id']] = [
                    'id' => $attr['id'],
                    'name' => $attr['name'],
                    'is_customizable' => (bool) ($attr['is_customizable'] ?? false),
                    'is_multiple_selection' => (bool) ($attr['is_multiple_selection'] ?? false),
                ];
            }

            if ($index < count($categoryIds) - 1) {
                usleep(300_000);
            }
        }

        $now = now();
        foreach (array_chunk(array_values($rowsById), 500) as $chunk) {
            TikTokAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['name', 'is_customizable', 'is_multiple_selection', 'updated_at']
            );
        }

        TikTokAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsById).' TikTok attributes across '.count($categoryIds).' categories.');
    }

    /**
     * Same idea as syncTikTokAttributes() above, but scoped to exactly one
     * TikTok category — the "Sync attributes" action on
     * categories/tiktok-mapping.tsx, mirroring
     * ShopeeAttributeMappingController::syncShopeeAttributesForCategory()/
     * LazadaAttributeMappingController::syncLazadaAttributesForCategory().
     * Runs synchronously — a single getAttributes() call, same as the
     * multi-category loop iteration above, just without the rate-limit
     * pacing since there's only one call here.
     */
    public function syncTikTokAttributesForCategory(Request $request): JsonResponse
    {
        $account = TikTokSellerAccount::first();
        if (! $account) {
            return response()->json(['message' => 'No TikTok seller account found to authenticate the sync.'], 422);
        }

        $validated = $request->validate([
            'tiktok_category_id' => ['required', 'integer', 'exists:tiktok_categories,id'],
        ]);
        $categoryId = $validated['tiktok_category_id'];

        $client = new TikTokClient($account);
        $response = $client->getAttributes((string) $categoryId);
        $schema = $response['data']['attributes'] ?? [];

        $now = now();
        $rows = [];
        foreach ($schema as $attr) {
            if (($attr['type'] ?? null) !== 'PRODUCT_PROPERTY') {
                continue;
            }

            $rows[] = [
                'id' => $attr['id'],
                'name' => $attr['name'],
                'is_customizable' => (bool) ($attr['is_customizable'] ?? false),
                'is_multiple_selection' => (bool) ($attr['is_multiple_selection'] ?? false),
                'category_id' => $categoryId,
                'mandatory' => (bool) ($attr['is_requried'] ?? false),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            TikTokAttribute::upsert($rows, ['id'], ['name', 'is_customizable', 'is_multiple_selection', 'category_id', 'mandatory', 'updated_at']);
        }

        TikTokAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * TikTok attributes cached for one category (see the migration's
     * "informational, not a real FK" caveat on that column — this lists
     * whatever the most recent sync for that category actually saw), each
     * annotated with whichever PIM attribute currently maps to it, if any.
     * Backs the "จับคู่ Attribute กับ PIM" column's table on
     * categories/tiktok-mapping.tsx — mirrors
     * ShopeeAttributeMappingController::shopeeAttributesForCategory()
     * exactly, keyed by `id` (a string, per TikTokAttribute's own PK type).
     */
    public function tiktokAttributesForCategory(int $tiktokCategoryId): JsonResponse
    {
        $attributes = TikTokAttribute::where('category_id', $tiktokCategoryId)->orderBy('name')->get();

        $mappedByTikTokAttributeId = TikTokAttributeMapping::whereIn('tiktok_attribute_id', $attributes->pluck('id'))
            ->with('attribute:id,name')
            ->get()
            ->keyBy('tiktok_attribute_id');

        $data = $attributes->map(function (TikTokAttribute $attribute) use ($mappedByTikTokAttributeId) {
            $mapping = $mappedByTikTokAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'is_customizable' => (bool) $attribute->is_customizable,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }
}
