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
    public function index(): Response
    {
        $pimAttributes = Attribute::cachedList();

        return Inertia::render('catalog/attributes/marketplace-mapping', [
            'woocommerce' => [
                'attributes' => $this->woocommerceAttributeRows($pimAttributes),
                'wooCommerceAttributes' => WooCommerceAttribute::cachedList(),
            ],
            'shopee' => [
                'attributes' => $this->shopeeAttributeRows($pimAttributes),
                'shopeeAttributes' => ShopeeAttribute::cachedList(),
            ],
            'lazada' => [
                'attributes' => $this->lazadaAttributeRows($pimAttributes),
                'lazadaAttributes' => LazadaAttribute::cachedList(),
            ],
            'tiktok' => [
                'attributes' => $this->tiktokAttributeRows($pimAttributes),
                'tiktokAttributes' => TikTokAttribute::cachedList(),
            ],
        ]);
    }

    private function woocommerceAttributeRows($pimAttributes)
    {
        $mappingsByAttributeId = WooCommerceAttributeMapping::cachedList()->keyBy('attribute_id');

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

    private function shopeeAttributeRows($pimAttributes)
    {
        $mappingsByAttributeId = ShopeeAttributeMapping::cachedList()->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
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
    }

    private function lazadaAttributeRows($pimAttributes)
    {
        $mappingsByAttributeId = LazadaAttributeMapping::cachedList()->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'lazada_attribute_name' => $mapping->lazada_attribute_name ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }

    private function tiktokAttributeRows($pimAttributes)
    {
        $mappingsByAttributeId = TikTokAttributeMapping::cachedList()->keyBy('attribute_id');

        return $pimAttributes->map(function (Attribute $attribute) use ($mappingsByAttributeId) {
            $mapping = $mappingsByAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'tiktok_attribute_id' => $mapping->tiktok_attribute_id ?? null,
                'sort_order' => $mapping->sort_order ?? 0,
            ];
        })->values();
    }
}
