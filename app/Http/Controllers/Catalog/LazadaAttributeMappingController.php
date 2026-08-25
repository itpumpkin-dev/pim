<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaSellerAccount;
use App\Services\Lazada\LazadaClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Lets an admin pick which PIM attribute feeds each Lazada push field,
 * without a code change — see LazadaProductSyncService::buildPayload()/
 * resolveMappedField() (structured fields) and resolveMappedAttributes()
 * (`lazada_attribute` — payload.attributes when attribute_type=normal / the
 * SKU fields when attribute_type=sku, the old behavior), which read this
 * table instead of the old hardcoded pname/price_std/qty/attribute_6/
 * SKU_FIELD_SOURCE lookups. v1 only supports free-value attributes
 * (input_type text/numeric) for the `lazada_attribute` target —
 * singleSelect/multiSelect need a specific predefined option, not an
 * arbitrary value, so they're synced for visibility but rejected as a
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

    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video',
        'lazada_attribute',
    ];

    public function update(Request $request): RedirectResponse|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.target_field' => ['nullable', Rule::in(self::TARGET_FIELDS)],
            'mappings.*.lazada_attribute_name' => ['nullable', 'string', 'exists:lazada_attributes,name'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            $entries = (array) $request->input('mappings', []);

            $lazadaAttributesByName = LazadaAttribute::whereIn(
                'name',
                collect($entries)->pluck('lazada_attribute_name')->filter()
            )->get()->keyBy('name');

            // Lazada rejects any external video URL (confirmed live,
            // BIZ_CHECK_EXTERNAL_VIDEO_IS_FORBIDDEN) — only a PIM attribute
            // of type `video` (an uploaded file, e.g. attribute_6) may ever
            // be mapped to target_field='video', never a plain-text/URL
            // attribute like youtube_url. See this controller's class
            // docblock and the migration that reopened this field for why.
            $attributesById = Attribute::whereIn(
                'id',
                collect($entries)->pluck('attribute_id')->filter()
            )->get()->keyBy('id');

            foreach ($entries as $index => $entry) {
                $isLazadaAttribute = ($entry['target_field'] ?? null) === 'lazada_attribute';
                $lazadaAttributeName = $entry['lazada_attribute_name'] ?? null;

                if ($isLazadaAttribute && !$lazadaAttributeName) {
                    $validator->errors()->add("mappings.{$index}.lazada_attribute_name", 'A Lazada attribute must be chosen for this mapping.');
                    continue;
                }
                if (!$isLazadaAttribute && $lazadaAttributeName) {
                    $validator->errors()->add("mappings.{$index}.lazada_attribute_name", 'Only valid when target_field is lazada_attribute.');
                    continue;
                }

                if (($entry['target_field'] ?? null) === 'video') {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    if ($attribute && $attribute->type !== 'video') {
                        $validator->errors()->add(
                            "mappings.{$index}.target_field",
                            'Lazada rejects external video URLs — only a video-type PIM attribute can be mapped here.'
                        );
                    }
                }

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
            if (empty($entry['target_field'])) {
                LazadaAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = LazadaAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->target_field = $entry['target_field'];
            $mapping->lazada_attribute_name = $entry['lazada_attribute_name'] ?? null;
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        LazadaAttributeMapping::bumpListVersion();

        // The embedded per-category picker on categories/lazada-mapping.tsx
        // calls this same endpoint via plain fetch (Accept: application/json)
        // instead of an Inertia visit — see
        // ShopeeAttributeMappingController::update()'s identical branch for
        // why. Every other caller is a real Inertia POST, unaffected.
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

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

    /**
     * Same idea as syncLazadaAttributes() above, but scoped to exactly one
     * Lazada category — the "Sync attributes" action on
     * categories/lazada-mapping.tsx, next to that page's Categories table
     * (see ShopeeAttributeMappingController::syncShopeeAttributesForCategory()
     * for the Shopee equivalent this mirrors). Runs synchronously — a single
     * /category/attributes/get call, same as the per-category loop iteration
     * above, just without the multi-category rate-limit pacing since there's
     * only one call here.
     */
    public function syncLazadaAttributesForCategory(Request $request): JsonResponse
    {
        $account = LazadaSellerAccount::active()->first();
        if (! $account) {
            return response()->json(['message' => 'No active Lazada seller account found to authenticate the sync.'], 422);
        }

        $validated = $request->validate([
            'lazada_category_id' => ['required', 'integer', 'exists:lazada_categories,id'],
        ]);
        $categoryId = $validated['lazada_category_id'];

        $client = new LazadaClient($account);
        $response = $client->getCategoryAttributes($categoryId);
        $schema = $response['data'] ?? [];

        $now = now();
        $rows = array_map(fn (array $attr) => [
            'name' => $attr['name'],
            'label' => $attr['label'] ?? $attr['name'],
            'input_type' => $attr['input_type'] ?? null,
            'attribute_type' => $attr['attribute_type'] ?? null,
            'category_id' => $categoryId,
            'mandatory' => (bool) ($attr['is_mandatory'] ?? false),
            'created_at' => $now,
            'updated_at' => $now,
        ], $schema);

        if ($rows !== []) {
            LazadaAttribute::upsert($rows, ['name'], ['label', 'input_type', 'attribute_type', 'category_id', 'mandatory', 'updated_at']);
        }

        LazadaAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * Lazada attributes cached for one category (see the migration's
     * "informational, not a real FK" caveat on that column — this lists
     * whatever the most recent sync for that category actually saw), each
     * annotated with whichever PIM attribute currently maps to it, if any.
     * Backs the "จับคู่แอตทริบิวต์กับ PIM" column's table on
     * categories/lazada-mapping.tsx — mirrors
     * ShopeeAttributeMappingController::shopeeAttributesForCategory()
     * exactly, keyed by `name` instead of a numeric id (see LazadaAttribute's
     * docblock for why).
     */
    public function lazadaAttributesForCategory(int $lazadaCategoryId): JsonResponse
    {
        $attributes = LazadaAttribute::where('category_id', $lazadaCategoryId)->orderBy('label')->get();

        $mappedByLazadaAttributeName = LazadaAttributeMapping::whereIn('lazada_attribute_name', $attributes->pluck('name'))
            ->with('attribute:id,name')
            ->get()
            ->keyBy('lazada_attribute_name');

        $data = $attributes->map(function (LazadaAttribute $attribute) use ($mappedByLazadaAttributeName) {
            $mapping = $mappedByLazadaAttributeName->get($attribute->name);

            return [
                'name' => $attribute->name,
                'label' => $attribute->label,
                'input_type' => $attribute->input_type,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }
}
