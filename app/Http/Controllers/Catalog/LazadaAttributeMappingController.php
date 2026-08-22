<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaSellerAccount;
use App\Services\Lazada\LazadaClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Lets an admin pick which PIM attribute feeds each Lazada category
 * attribute, without a code change — see
 * LazadaProductSyncService::buildPayload(), which reads this table to fill
 * payload.attributes (attribute_type=normal) / the SKU fields
 * (attribute_type=sku) beyond the fixed name/short_description/brand set it
 * already sends. v1 only supports free-value attributes (input_type text/
 * numeric) — singleSelect/multiSelect need a specific predefined option, not
 * an arbitrary value, so they're synced for visibility but rejected as a
 * mapping target here (same scope decision already made for Shopee's
 * equivalent page).
 *
 * The read-only index() this used to own now lives in
 * MarketplaceAttributeMappingController (bundled with WooCommerce/Shopee/
 * TikTok's equivalents into one Inertia response for the combined
 * "จับคู่เนื้อหา Marketplace" tabbed page) — this controller keeps only the
 * write actions.
 */
class LazadaAttributeMappingController extends Controller
{
    // Allowlist (reject anything not explicitly known-safe), same
    // conservative default used throughout this app's marketplace
    // integrations. richText fields (e.g. description/short_description —
    // confirmed live, 2026-08-21, via a real synced category schema) accept
    // real HTML, same as this app's own `textarea` PIM attributes already
    // verified to store — see LazadaProductSyncService, which passes a
    // mapped value straight through either way. enumInput/singleSelect/
    // multiSelect/multiEnumInput/img/date remain unmappable: they need a
    // specific predefined option or a non-string shape this page doesn't
    // support yet.
    private const MAPPABLE_INPUT_TYPES = ['text', 'numeric', 'richText'];

    public function update(Request $request): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.lazada_attribute_name' => ['nullable', 'string', 'exists:lazada_attributes,name'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $lazadaAttributesByName = LazadaAttribute::whereIn(
                'name',
                collect($request->input('mappings', []))->pluck('lazada_attribute_name')->filter()
            )->get()->keyBy('name');

            foreach ((array) $request->input('mappings', []) as $index => $entry) {
                $lazadaAttributeName = $entry['lazada_attribute_name'] ?? null;
                if (!$lazadaAttributeName) {
                    continue;
                }

                $target = $lazadaAttributesByName->get($lazadaAttributeName);
                if ($target && !in_array($target->input_type, self::MAPPABLE_INPUT_TYPES, true)) {
                    $validator->errors()->add(
                        "mappings.{$index}.lazada_attribute_name",
                        'Only free-text/numeric Lazada attributes can be mapped yet.'
                    );
                }
            }
        });

        $validated = $validator->validate();

        foreach ($validated['mappings'] as $entry) {
            if (empty($entry['lazada_attribute_name'])) {
                LazadaAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = LazadaAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->lazada_attribute_name = $entry['lazada_attribute_name'];
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        LazadaAttributeMapping::bumpListVersion();

        return back()->with('success', 'Lazada attribute mapping saved.');
    }

    /**
     * Pulls Lazada's real category attribute schema in (read-only against
     * Lazada) for every PIM category currently mapped to a
     * lazada_category_id, one /category/attributes/get call per distinct
     * category (unlike Shopee's get_attribute_tree, this endpoint takes a
     * single primary_category_id, not a batch list). Deduped globally by
     * attribute `name`. Paced with a short sleep between calls — Lazada's
     * per-account rate limit ("901: too frequent") was confirmed live to
     * trigger from a handful of back-to-back calls (see
     * LazadaProductSyncService::syncLiveStatus()'s docblock for that same
     * finding), and this can call once per mapped category.
     */
    public function syncLazadaAttributes(): RedirectResponse
    {
        $account = LazadaSellerAccount::active()->first();
        if (!$account) {
            return back()->with('error', 'No active Lazada seller account found to authenticate the sync.');
        }

        $categoryIds = Category::whereNotNull('lazada_category_id')
            ->distinct()
            ->pluck('lazada_category_id')
            ->all();

        if (empty($categoryIds)) {
            return back()->with('error', 'No PIM category is mapped to a Lazada category yet — nothing to sync attributes for.');
        }

        $client = new LazadaClient($account);
        $rowsByName = [];

        foreach ($categoryIds as $index => $categoryId) {
            $response = $client->getCategoryAttributes((int) $categoryId);

            foreach ($response['data'] ?? [] as $attr) {
                $rowsByName[$attr['name']] = [
                    'name' => $attr['name'],
                    'label' => $attr['label'] ?? $attr['name'],
                    'input_type' => $attr['input_type'] ?? null,
                    'attribute_type' => $attr['attribute_type'] ?? null,
                ];
            }

            if ($index < count($categoryIds) - 1) {
                usleep(300_000);
            }
        }

        $now = now();
        foreach (array_chunk(array_values($rowsByName), 500) as $chunk) {
            LazadaAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['name'],
                ['label', 'input_type', 'attribute_type', 'updated_at']
            );
        }

        LazadaAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsByName).' Lazada attributes across '.count($categoryIds).' categories.');
    }
}
