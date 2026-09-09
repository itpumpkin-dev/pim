<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\ResolvesMarketplaceMasterCategory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\WooCommerceAttribute;
use App\Models\WooCommerceAttributeMapping;
use App\Models\WooCommerceCategory;
use App\Services\Catalog\WooCommerceMappingTimelineBuilder;
use App\Services\WooCommerce\WooCommerceClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
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
    use ResolvesMarketplaceMasterCategory;

    private const TARGET_FIELDS = [
        'description', 'short_description',
        'name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height', 'video',
        'wc_attribute',
    ];

    // ทุกค่าใน TARGET_FIELDS ยกเว้น 'wc_attribute' — ใช้กำหนดว่า section
    // "3. Payload WooCommerce" ของหน้า woocommerce-products.tsx ต้อง render
    // กี่แถว (mirror ของ ShopeeAttributeMappingController::STRUCTURED_TARGET_FIELDS
    // — ต่างกันตรงที่ WooCommerce มี `image`/`short_description` เพิ่ม เพราะ
    // schema จริงต่างจาก platform อื่น)
    private const STRUCTURED_TARGET_FIELDS = [
        'description', 'short_description',
        'name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height', 'video',
    ];

    // 'description'/'short_description' เป็นข้อยกเว้นเดียวใน STRUCTURED_TARGET_FIELDS
    // ที่รับ PIM attribute ได้หลายตัวพร้อมกัน — WooCommerceProductSyncService::
    // buildContentFields() ประกอบทุก attribute ที่แมปไว้กับ 2 ฟิลด์นี้เป็น
    // <h4>label</h4> section ต่อกัน (ดู docblock ของมัน) ไม่ใช่แค่ตัวแรกแบบฟิลด์
    // อื่น (resolveMappedField() ที่ใช้ตัวแรกที่มีค่าเท่านั้น) — payloadFieldMappings()
    // ด้านล่างต้องคืนทุกตัวสำหรับ 2 ฟิลด์นี้ ไม่ใช่แค่ ->first() เหมือนที่เขียนพลาด
    // ไปตอนแรก (มิเรอร์ ShopeeAttributeMappingController มาตรงๆ โดยไม่ทันสังเกตว่า
    // WooCommerce มี behavior นี้ต่างจาก Shopee/Lazada/TikTok) ไม่งั้น admin ที่เลือก
    // attribute ใหม่ให้ฟิลด์นี้ในหน้า UI จะเห็นแค่ 1 ใน N ตัวที่แมปไว้จริง และการ
    // เปลี่ยนค่าจะทิ้งตัวเก่าๆ ที่ UI ไม่รู้จักไว้เฉยๆ (ยังถูกดึงไปรวมในหน้าเว็บจริงต่อ)
    private const MULTI_VALUE_TARGET_FIELDS = ['description', 'short_description'];

    public function update(Request $request): RedirectResponse|JsonResponse
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
                // ลบทีละแถวผ่าน model ให้ event `deleted` ของ Auditable ทำงาน —
                // `->where()->delete()` แบบ mass delete จะข้าม event ทำให้การ
                // ยกเลิกการแมปไม่ถูกบันทึกลง audit_logs
                WooCommerceAttributeMapping::where('attribute_id', $entry['attribute_id'])->get()->each->delete();
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

        // รองรับทั้ง Inertia POST เดิม และ fetch ธรรมดา (Section 2 ของ
        // woocommerce-products.tsx Object Page — ดูเหตุผลเดียวกันที่
        // ShopeeAttributeMappingController::update() ใช้)
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'WooCommerce content mapping saved.');
    }

    /**
     * UI สำหรับการไล่ดูและจัดการ Mapping ข้อมูลของสินค้าใน WooCommerce — mirror
     * ของ ShopeeAttributeMappingController::shopeeProducts() แต่ `attribute_stats`
     * เป็น null เสมอ เพราะ WooCommerce attribute เป็น global ทั้งหมด ไม่ผูกกับ
     * category เหมือน Lazada/Shopee/TikTok เลย (ไม่มี category-attribute schema
     * tree ให้นับ total/mapped ต่อหมวดหมู่ — ดู docblock ของ class นี้)
     */
    public function woocommerceProducts(Request $request): Response
    {
        $filter = $request->input('filter', 'all');
        if (! in_array($filter, ['all', 'mapped', 'unmapped'], true)) {
            $filter = 'all';
        }

        $search = trim((string) $request->input('search', ''));
        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $nameAttrId = Attribute::idForCode('pname');
        $activeLocaleId = Locale::idForCode(app()->getLocale());

        $allPimCategories = Category::query()->get(['id', 'parent_id', 'name', 'woocommerce_category_id'])->keyBy('id');
        $pimCategoryPathOf = function (int $id) use ($allPimCategories): string {
            $names = [];
            $node = $allPimCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allPimCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $allWooCategories = WooCommerceCategory::query()->get(['id', 'parent_id', 'name', 'is_leaf'])->keyBy('id');
        $wooCategoryPathOf = function (int $id) use ($allWooCategories): string {
            $names = [];
            $node = $allWooCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allWooCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $query = Product::query()->whereNull('parent_id')->with(['categories', 'variants:id,parent_id']);

        if ($search !== '') {
            $query->where(function ($q) use ($search, $nameAttrId) {
                $q->where('sku', 'like', "%{$search}%");
                if ($nameAttrId) {
                    $q->orWhereHas('values', function ($vq) use ($nameAttrId, $search) {
                        $vq->where('attribute_id', $nameAttrId)
                            ->where('value', 'like', "%{$search}%");
                    });
                }
            });
        }

        if ($filter === 'mapped') {
            $query->where(function ($q) {
                $q->whereNotNull('woocommerce_category_id')
                    ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.woocommerce_category_id'));
            });
        } elseif ($filter === 'unmapped') {
            $query->whereNull('woocommerce_category_id')
                ->whereDoesntHave('categories', fn ($cq) => $cq->whereNotNull('categories.woocommerce_category_id'));
        }

        $paginated = $query->orderBy('id', 'desc')->paginate($perPage)->withQueryString();

        $pageProductIds = $paginated->getCollection()->pluck('id');

        $pnames = [];
        if ($nameAttrId && $pageProductIds->isNotEmpty()) {
            $values = ProductValue::whereIn('product_id', $pageProductIds)
                ->where('attribute_id', $nameAttrId)
                ->whereNull('channel_id')
                ->where(function ($q) use ($activeLocaleId) {
                    $q->whereNull('locale_id');
                    if ($activeLocaleId) {
                        $q->orWhere('locale_id', $activeLocaleId);
                    }
                })
                ->get();
            foreach ($values as $v) {
                if (! isset($pnames[$v->product_id]) || $v->locale_id === $activeLocaleId) {
                    $pnames[$v->product_id] = $v->value;
                }
            }
        }

        $rows = $paginated->getCollection()->map(function (Product $product) use ($pnames, $pimCategoryPathOf, $allWooCategories, $wooCategoryPathOf, $allPimCategories) {
            $masterCat = $this->resolveMasterCategory($product, $allPimCategories, 'woocommerce_category_id');
            $mappedCategory = $this->resolveMappedCategory($product, $allPimCategories, 'woocommerce_category_id') ?? $masterCat;

            $wooCatId = $product->woocommerce_category_id ?? ($mappedCategory?->woocommerce_category_id);
            $wooCat = $wooCatId ? $allWooCategories->get($wooCatId) : null;

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $pnames[$product->id] ?? $product->sku,
                'variants_count' => $product->variants->count(),
                'master_category' => $masterCat ? [
                    'id' => $masterCat->id,
                    'name' => $masterCat->name,
                    'path' => $pimCategoryPathOf($masterCat->id),
                    'woocommerce_category_id' => $masterCat->woocommerce_category_id,
                ] : null,
                'woocommerce_category' => $wooCat ? [
                    'id' => $wooCat->id,
                    'name' => $wooCat->name,
                    'path' => $wooCategoryPathOf($wooCat->id),
                ] : null,
                'category_mapped' => (bool) $wooCatId,
                // ไม่มีความหมายแบบ per-category สำหรับ WooCommerce (ดู
                // docblock ของ method นี้) — ปล่อย null เสมอ ต่างจาก
                // Lazada/Shopee/TikTok ที่มี category-attribute schema จริง
                'attribute_stats' => null,
            ];
        });

        $paginated->setCollection($rows);

        $totalProductsCount = Product::query()->whereNull('parent_id')->count();
        $mappedProductsCount = Product::query()->whereNull('parent_id')->where(function ($q) {
            $q->whereNotNull('woocommerce_category_id')
                ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.woocommerce_category_id'));
        })->count();

        return Inertia::render('catalog/marketplace/woocommerce-products', [
            'products' => $paginated,
            'stats' => [
                'total' => $totalProductsCount,
                'mapped' => $mappedProductsCount,
                'unmapped' => $totalProductsCount - $mappedProductsCount,
            ],
            'filters' => [
                'search' => $search,
                'filter' => $filter,
                'per_page' => $perPage,
            ],
        ]);
    }

    /**
     * List กลางของ **ทุก** WooCommerceAttribute (ไม่มี category param เลย —
     * ต่างจาก shopeeAttributesForCategory()/tiktokAttributesForCategory()
     * เพราะ WooCommerce attribute ไม่ผูก category) แนบมาด้วยว่า PIM attribute
     * ไหนแมปอยู่ (ถ้ามี) — ให้ section "2. Attribute Mapping" ของหน้า
     * woocommerce-products.tsx โหลดทันทีตอนเปิดสินค้า ไม่ต้องรอ Category
     * Mapping (section 1) เสร็จก่อนแบบ 3 platform อื่น
     */
    public function woocommerceAttributesList(): JsonResponse
    {
        $attributes = WooCommerceAttribute::orderBy('name')->get();

        $mappedByWooAttributeId = WooCommerceAttributeMapping::whereIn('woocommerce_attribute_id', $attributes->pluck('id'))
            ->with('attribute:id,name')
            ->get()
            ->keyBy('woocommerce_attribute_id');

        $data = $attributes->map(function (WooCommerceAttribute $attribute) use ($mappedByWooAttributeId) {
            $mapping = $mappedByWooAttributeId->get($attribute->id);

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }

    /**
     * PIM attribute ที่แมปไว้กับแต่ละฟิลด์ payload ตายตัวของ WooCommerce
     * (description/short_description/name/price/image/qty/weight/length/
     * width/height/video) ให้ section "3. Payload WooCommerce" ของหน้า
     * woocommerce-products.tsx ใช้ prefill ตอนเปิดหน้า — mirror ของ
     * ShopeeAttributeMappingController::payloadFieldMappings()
     */
    public function payloadFieldMappings(): JsonResponse
    {
        $mappingsByField = WooCommerceAttributeMapping::whereIn('target_field', self::STRUCTURED_TARGET_FIELDS)
            ->with('attribute:id,name')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('target_field');

        $data = collect(self::STRUCTURED_TARGET_FIELDS)->map(function ($field) use ($mappingsByField) {
            $rows = ($mappingsByField->get($field) ?? collect())->filter(fn ($m) => $m->attribute);

            // description/short_description รับได้หลาย attribute พร้อมกัน (ดู
            // MULTI_VALUE_TARGET_FIELDS ด้านบน) — คืนทุกแถว ไม่ใช่แค่ตัวแรก
            return [
                'target_field' => $field,
                'multi' => in_array($field, self::MULTI_VALUE_TARGET_FIELDS, true),
                'mapped' => $rows->map(fn ($m) => ['id' => $m->attribute->id, 'name' => $m->attribute->name])->values(),
            ];
        });

        return response()->json(['data' => $data->values()]);
    }

    /**
     * แท็บ "History" ของหน้า woocommerce-products.tsx — mirror ของ
     * ShopeeAttributeMappingController::timeline() แต่ scope แคบกว่า (ดู
     * WooCommerceMappingTimelineBuilder's docblock — ไม่มี AttributeFamily/
     * attribute-ระดับ-category ให้ join เลย เพราะ WooCommerce attribute เป็น
     * global ทั้งหมด)
     */
    public function timeline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::findOrFail($validated['category_id']);
        $logs = app(WooCommerceMappingTimelineBuilder::class)->build($category);

        return response()->json([
            'timeline' => $logs->map(function ($log) {
                $old = $log->old_values ?? [];
                $new = $log->new_values ?? [];
                $keys = array_unique(array_merge(array_keys($old), array_keys($new)));

                $diff = collect($keys)->map(fn ($key) => [
                    'key' => $key,
                    'old' => $old[$key] ?? null,
                    'new' => $new[$key] ?? null,
                ])->values();

                return [
                    'event' => $log->event,
                    'subject_type' => $log->auditable_type ? class_basename($log->auditable_type) : null,
                    'subject_id' => $log->auditable_id,
                    'created_at' => $log->created_at?->toIso8601String(),
                    'actor' => $log->user ? ($log->user->name ?: $log->user->email) : 'System',
                    'diff' => $diff,
                ];
            })->values(),
        ]);
    }

    /**
     * ดึงลิสต์ Product Attributes ตัวจริงของ WooCommerce เข้ามา (อ่านอย่างเดียว
     * ไม่มีการเขียนอะไรกลับไปที่ WooCommerce เลย) เพื่อให้หน้า mapping ด้านบนมี
     * ตัวเลือกจริงๆ ให้เลือก ไม่ใช่เดาเอาเอง โครงสร้างเหมือนกับ
     * BrandController::syncWoocommerceBrands() เป๊ะ แค่เปลี่ยนไปใช้
     * WooCommerceAttribute/WooCommerceClient::getAttributes() แทน
     */
    public function syncWoocommerceAttributes(Request $request): RedirectResponse|JsonResponse
    {
        try {
            $client = new WooCommerceClient();
        } catch (RuntimeException $e) {
            return $request->wantsJson() ? response()->json(['message' => $e->getMessage()], 422) : back()->with('error', $e->getMessage());
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

        // รองรับทั้ง Inertia POST เดิม และ fetch ธรรมดา (ปุ่ม "Sync Attributes"
        // บน Section 2 ของ woocommerce-products.tsx Object Page — global sync
        // ไม่มี category_id ให้ส่งเหมือน 3 platform อื่น)
        if ($request->wantsJson()) {
            return response()->json(['count' => count($rows)]);
        }

        return back()->with('success', 'Synced '.count($rows).' WooCommerce attributes.');
    }
}
