<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use App\Services\WooCommerce\WooCommerceClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use RuntimeException;

/**
 * Lets an admin pick which PIM attributes feed into every field
 * WooCommerce push sends, in what order, without a code change — see
 * WooCommerceProductSyncService::buildPayload(), which reads this table
 * for the composed content fields (description/short_description, every
 * mapped attribute concatenated), the structured fields (name/price/
 * image/qty/weight/length/width/height, first mapped attribute with a
 * value wins), and WooCommerce's own Product Attributes (`wc_attribute`,
 * targeting a specific woocommerce_attributes row — see
 * syncWoocommerceAttributes() below for how that list gets populated).
 */
class WooCommerceAttributeMappingController extends Controller
{
    private const TARGET_FIELDS = [
        'description', 'short_description',
        'name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height',
        'wc_attribute',
    ];

    public function index(): Response
    {
        $mappingsByAttributeId = WooCommerceAttributeMapping::all()->keyBy('attribute_id');

        $attributes = Attribute::cachedList()->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'woocommerce_attribute_id' => $mapping->woocommerce_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();

        return Inertia::render('catalog/attributes/woocommerce-mapping', [
            'attributes' => $attributes,
            'wooCommerceAttributes' => WooCommerceAttribute::orderBy('name')->get(['id', 'name', 'slug']),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'mappings.*.target_field' => ['nullable', Rule::in(self::TARGET_FIELDS)],
            'mappings.*.woocommerce_attribute_id' => ['nullable', 'integer', 'exists:woocommerce_attributes,id'],
            'mappings.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $validator->after(function ($validator) use ($request) {
            foreach ((array) $request->input('mappings', []) as $index => $entry) {
                $isWcAttribute = ($entry['target_field'] ?? null) === 'wc_attribute';
                $hasWcAttributeId = !empty($entry['woocommerce_attribute_id']);

                if ($isWcAttribute && !$hasWcAttributeId) {
                    $validator->errors()->add("mappings.{$index}.woocommerce_attribute_id", 'A WooCommerce attribute must be chosen for this mapping.');
                }
                if (!$isWcAttribute && $hasWcAttributeId) {
                    $validator->errors()->add("mappings.{$index}.woocommerce_attribute_id", 'Only valid when target_field is wc_attribute.');
                }
            }
        });

        $validated = $validator->validate();

        foreach ($validated['mappings'] as $entry) {
            if (empty($entry['target_field'])) {
                WooCommerceAttributeMapping::where('attribute_id', $entry['attribute_id'])->delete();
                continue;
            }

            $mapping = WooCommerceAttributeMapping::firstOrNew(['attribute_id' => $entry['attribute_id']]);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->target_field = $entry['target_field'];
            $mapping->woocommerce_attribute_id = $entry['woocommerce_attribute_id'] ?? null;
            $mapping->sort_order = $entry['sort_order'] ?? 0;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        return back()->with('success', 'WooCommerce content mapping saved.');
    }

    /**
     * Pulls WooCommerce's real global Product Attributes list in (read-only
     * against WooCommerce — this never writes anything there) so the
     * mapping page above has real targets to pick from instead of guessed
     * ones. Mirrors BrandController::syncWoocommerceBrands() exactly,
     * swapped to WooCommerceAttribute/WooCommerceClient::getAttributes().
     */
    public function syncWoocommerceAttributes(): RedirectResponse
    {
        try {
            $client = new WooCommerceClient();
        } catch (RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        $rows = [];
        $page = 1;
        do {
            $fetched = $client->getAttributes($page);
            foreach ($fetched as $node) {
                $rows[] = [
                    'id' => $node['id'],
                    'name' => $node['name'],
                    'slug' => $node['slug'] ?? null,
                    'type' => $node['type'] ?? null,
                ];
            }
            $page++;
        } while (count($fetched) === 100);

        $now = now();
        foreach (array_chunk($rows, 500) as $chunk) {
            WooCommerceAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['name', 'slug', 'type', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($rows).' WooCommerce attributes.');
    }
}
