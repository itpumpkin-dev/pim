<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Single entry point ("จับคู่เนื้อหา Marketplace") bundling all four
 * platform attribute-mapping datasets into one Inertia response, rendered
 * as tabs by resources/js/pages/catalog/attributes/marketplace-mapping.tsx
 * — replaces what used to be four separate hub tiles/pages/controllers'
 * own index() actions (WooCommerceAttributeMappingController,
 * ShopeeAttributeMappingController, LazadaAttributeMappingController,
 * TikTokAttributeMappingController — each still owns its own update()/
 * syncXAttributes() write actions, called from within its tab's panel;
 * only the four read-only index() actions were consolidated here).
 */
class MarketplaceAttributeMappingController extends Controller
{
    // Every fixed payload target_field each platform's sync service reads
    // via resolveMappedField()/buildContentFields() — mirrors each
    // *AttributeMappingController::TARGET_FIELDS minus the custom-attribute
    // bucket ('wc_attribute'/'shopee_attribute'/'lazada_attribute'/
    // 'tiktok_attribute'), which is covered separately by
    // platformAttributeCoverage() below. Used to report which payload
    // fields no PIM attribute currently feeds at all.
    private const PAYLOAD_FIELDS = [
        'woocommerce' => ['description', 'short_description', 'name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height', 'video'],
        'shopee' => ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'],
        'lazada' => ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video'],
        'tiktok' => ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'],
    ];

    // Lazada's live category-attribute schema (lazada_attributes) can
    // contain entries with these exact names — they're always already
    // covered by the fixed payload fields above (see
    // LazadaProductSyncService::buildPayload()'s SellerSku/quantity/price/
    // name/video/package_* fields), so counting them again as "unmapped
    // Lazada attributes" would double-count a gap that doesn't actually
    // exist and isn't fillable through the lazada_attribute bucket anyway.
    private const LAZADA_RESERVED_ATTRIBUTE_NAMES = [
        'SellerSku', 'name', 'price', 'quantity', 'video',
        'package_weight', 'package_length', 'package_width', 'package_height',
    ];

    public function index(): Response
    {
        $pimAttributes = Attribute::cachedList();

        $wooMappings = WooCommerceAttributeMapping::cachedList();
        $shopeeMappings = ShopeeAttributeMapping::cachedList();
        $lazadaMappings = LazadaAttributeMapping::cachedList();
        $tiktokMappings = TikTokAttributeMapping::cachedList();

        $wooCommerceAttributes = WooCommerceAttribute::cachedList();
        $shopeeAttributes = ShopeeAttribute::cachedList();
        $lazadaAttributes = LazadaAttribute::cachedList();
        $tiktokAttributes = TikTokAttribute::cachedList();

        return Inertia::render('catalog/attributes/marketplace-mapping', [
            'woocommerce' => [
                'attributes' => $this->woocommerceAttributeRows($pimAttributes, $wooMappings),
                'wooCommerceAttributes' => $wooCommerceAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($wooMappings, self::PAYLOAD_FIELDS['woocommerce']),
                    // No input_type restriction on wc_attribute (see
                    // WooCommerceAttributeMappingController) — every synced
                    // WooCommerce attribute is a valid mapping target.
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $wooCommerceAttributes,
                        $wooMappings->where('target_field', 'wc_attribute')->pluck('woocommerce_attribute_id')->all(),
                    ),
                ],
            ],
            'shopee' => [
                'attributes' => $this->shopeeAttributeRows($pimAttributes, $shopeeMappings),
                'shopeeAttributes' => $shopeeAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($shopeeMappings, self::PAYLOAD_FIELDS['shopee']),
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $shopeeAttributes->where('input_type', 3), // FREE_TEXT_FILED — the only mappable kind
                        $shopeeMappings->where('target_field', 'shopee_attribute')->pluck('shopee_attribute_id')->all(),
                    ),
                ],
            ],
            'lazada' => [
                'attributes' => $this->lazadaAttributeRows($pimAttributes, $lazadaMappings),
                'lazadaAttributes' => $lazadaAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($lazadaMappings, self::PAYLOAD_FIELDS['lazada']),
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $lazadaAttributes
                            ->whereIn('input_type', ['text', 'numeric', 'richText'])
                            ->reject(fn ($a) => in_array($a->name, self::LAZADA_RESERVED_ATTRIBUTE_NAMES, true)),
                        $lazadaMappings->where('target_field', 'lazada_attribute')->pluck('lazada_attribute_name')->all(),
                        idKey: 'name',
                        labelKey: 'label',
                    ),
                ],
            ],
            'tiktok' => [
                'attributes' => $this->tiktokAttributeRows($pimAttributes, $tiktokMappings),
                'tiktokAttributes' => $tiktokAttributes,
                'coverage' => [
                    'payloadFields' => $this->payloadFieldCoverage($tiktokMappings, self::PAYLOAD_FIELDS['tiktok']),
                    'platformAttributes' => $this->platformAttributeCoverage(
                        $tiktokAttributes->where('is_customizable', true),
                        $tiktokMappings->where('target_field', 'tiktok_attribute')->pluck('tiktok_attribute_id')->all(),
                    ),
                ],
            ],
        ]);
    }

    /**
     * Which of a platform's fixed payload target fields (self::PAYLOAD_FIELDS)
     * have zero PIM attributes mapped to them — e.g. WooCommerce's
     * short_description, if nothing feeds it, the composed HTML sent on
     * push is empty. `missing` is a list of raw target_field keys; the
     * frontend translates each into a label via its own FIELD_LABEL_KEYS.
     */
    private function payloadFieldCoverage(\Illuminate\Support\Collection $mappings, array $fields): array
    {
        $mappedFields = $mappings->pluck('target_field')->unique()->all();
        $missing = array_values(array_diff($fields, $mappedFields));

        return [
            'total' => count($fields),
            'mapped' => count($fields) - count($missing),
            'missing' => $missing,
        ];
    }

    /**
     * Which of a marketplace's own native attributes (the ones an admin
     * could map a PIM attribute into via the custom-attribute bucket —
     * already filtered to only mappable ones, e.g. free-text/customizable)
     * currently have no PIM attribute feeding them at all.
     */
    private function platformAttributeCoverage(\Illuminate\Support\Collection $allMappable, array $mappedIdentifiers, string $idKey = 'id', string $labelKey = 'name'): array
    {
        $missing = $allMappable
            ->reject(fn ($a) => in_array($a->{$idKey}, $mappedIdentifiers, true))
            ->map(fn ($a) => $a->{$labelKey} ?? $a->{$idKey})
            ->values();

        return [
            'total' => $allMappable->count(),
            'mapped' => $allMappable->count() - $missing->count(),
            'missing' => $missing,
        ];
    }

    private function woocommerceAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
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
    }

    private function shopeeAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'shopee_attribute_id' => $mapping->shopee_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }

    private function lazadaAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'lazada_attribute_name' => $mapping->lazada_attribute_name ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }

    private function tiktokAttributeRows($pimAttributes, \Illuminate\Support\Collection $mappings)
    {
        $mappingsByAttributeId = $mappings->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'target_field' => $mapping->target_field ?? null,
                'tiktok_attribute_id' => $mapping->tiktok_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }
}
