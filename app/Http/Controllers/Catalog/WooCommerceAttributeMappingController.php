<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use App\Services\WooCommerce\WooCommerceClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา attribute ไหนของ PIM ไปใส่ในแต่ละฟิลด์ที่ส่งไป
 * WooCommerce ตอน push โดยไม่ต้องแก้โค้ด — ดูที่ WooCommerceProductSyncService::buildPayload()
 * ที่อ่านตารางนี้ไปใช้ ทั้งฟิลด์เนื้อหาที่เอามาต่อกัน (description/short_description
 * เอา attribute ที่ map ไว้ทุกตัวมาต่อกัน), ฟิลด์แบบมีโครงสร้าง (name/price/
 * image/qty/weight/length/width/height เอา attribute ตัวแรกที่มีค่ามาใช้)
 * และ Product Attributes ของ WooCommerce เอง (`wc_attribute` ที่ชี้ไปยังแถวใน
 * woocommerce_attributes โดยตรง — ดู syncWoocommerceAttributes() ด้านล่างว่า
 * ลิสต์นั้นถูกดึงมายังไง)
 *
 * ส่วน index() แบบ read-only ที่เคยอยู่ในคลาสนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ Shopee/Lazada/TikTok
 * เป็น Inertia response เดียวสำหรับหน้า "จับคู่เนื้อหา Marketplace" แบบแท็บ)
 * — คลาสนี้เหลือแค่ action ที่เขียนข้อมูลเท่านั้น
 */
class WooCommerceAttributeMappingController extends Controller
{
    private const TARGET_FIELDS = [
        'description', 'short_description',
        'name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height', 'video',
        'wc_attribute',
    ];

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

        WooCommerceAttributeMapping::bumpListVersion();

        return back()->with('success', 'WooCommerce content mapping saved.');
    }

    /**
     * ดึงลิสต์ Product Attributes ตัวจริงของ WooCommerce เข้ามา (อ่านอย่างเดียว
     * ไม่มีการเขียนอะไรกลับไปที่ WooCommerce เลย) เพื่อให้หน้า mapping ด้านบนมี
     * ตัวเลือกจริงๆ ให้เลือก ไม่ใช่เดาเอาเอง โครงสร้างเหมือนกับ
     * BrandController::syncWoocommerceBrands() เป๊ะ แค่เปลี่ยนไปใช้
     * WooCommerceAttribute/WooCommerceClient::getAttributes() แทน
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

        WooCommerceAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rows).' WooCommerce attributes.');
    }
}
