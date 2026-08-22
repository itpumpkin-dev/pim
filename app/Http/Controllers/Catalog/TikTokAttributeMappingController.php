<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokSellerAccount;
use App\Services\TikTok\TikTokClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Lets an admin pick which PIM attribute feeds each TikTok product
 * attribute, without a code change — see TikTokProductSyncService::
 * resolveProductAttributes(), which reads this table instead of the
 * previously-empty hardcoded TIKTOK_ATTRIBUTE_SOURCE const. v1 only
 * supports attributes TikTok itself marks `is_customizable` (the seller may
 * type a free value) — attributes without that flag need a specific
 * predefined value from TikTok's own `values[]` list, not an arbitrary one,
 * so they're synced for visibility but rejected as a mapping target here
 * (same scope decision already made for Shopee/Lazada's equivalent pages).
 *
 * The read-only index() this used to own now lives in
 * MarketplaceAttributeMappingController (bundled with WooCommerce/Shopee/
 * Lazada's equivalents into one Inertia response for the combined
 * "จับคู่แอตทริบิวต์ Marketplace" tabbed page) — this controller keeps only the
 * write actions.
 */
class TikTokAttributeMappingController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.tiktok_attribute_id' => ['nullable', 'string', 'exists:tiktok_attributes,id'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $tiktokAttributesById = TikTokAttribute::whereIn(
                'id',
                collect($request->input('mappings', []))->pluck('tiktok_attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ((array) $request->input('mappings', []) as $index => $entry) {
                $tiktokAttributeId = $entry['tiktok_attribute_id'] ?? null;
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
            if (empty($entry['tiktok_attribute_id'])) {
                TikTokAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = TikTokAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->tiktok_attribute_id = $entry['tiktok_attribute_id'];
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        TikTokAttributeMapping::bumpListVersion();

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
}
