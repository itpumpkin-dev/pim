<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\ResolvesMarketplaceMasterCategory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use App\Models\ShopeeCategory;
use App\Models\ShopeeSellerAccount;
use App\Services\Catalog\ShopeeAttributeFamilyGenerator;
use App\Services\Catalog\ShopeeMappedAttributeCreator;
use App\Services\Catalog\ShopeeMappingTimelineBuilder;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา PIM attribute ตัวไหนมาเติมลงฟิลด์ที่จะส่งไป Shopee
 * โดยไม่ต้องแก้โค้ด — ดูที่ ShopeeProductSyncService::buildPayload()/
 * resolveMappedField() (สำหรับฟิลด์ที่มีโครงสร้างชัดเจน) และ resolveAttributes()
 * (`shopee_attribute` พฤติกรรมเดิมแบบใช้ attribute_list อย่างเดียว) ซึ่งจะอ่านจาก
 * ตารางนี้แทนที่จะไป lookup แบบ hardcode เดิมอย่าง pname/price_std/qty/weight_pcs/
 * product_details_features/attribute_6/length_pcs/width_pcs/height_pcs
 * v1 (เดิม) รองรับแค่ Shopee attribute แบบพิมพ์ข้อความอิสระ (input_type
 * FREE_TEXT_FILED = 3) สำหรับ target แบบ `shopee_attribute` เท่านั้น — v2
 * (ตัวนี้, mirror ของ LazadaAttributeMappingController's select/img/date
 * ที่เพิ่งเปิดฝั่ง Lazada) เปิดเพิ่ม dropdown/combo-box (input_type 1/2/4/5)
 * ให้แมปได้ด้วย ต้องมี "ตัวเลือกที่กำหนดไว้ล่วงหน้า" (เก็บไว้ที่
 * shopee_attributes.options — ดู ShopeeAttribute's docblock) จับคู่ผ่านตาราง
 * shopee_attribute_option_mappings (ดู updateOptionMappings() ด้านล่าง) —
 * ถูกส่งไป Shopee จริงตอน push แล้ว เป็น `value_id` (ดู
 * ShopeeProductSyncService::resolveAttributes()'s docblock สำหรับ shape
 * เต็มๆ และหมายเหตุยืนยัน live 2026-09-08)
 *
 * index() แบบ read-only ที่เคยอยู่ในนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ WooCommerce/Lazada/
 * TikTok ไว้ใน Inertia response เดียวกัน สำหรับหน้าแท็บรวม
 * "จับคู่เนื้อหา Marketplace") ส่วน shopeeProducts() ด้านล่าง (mirror ของ
 * LazadaAttributeMappingController::lazadaProducts()) เป็นคนละหน้ากัน — หน้า
 * Object Page ต่อสินค้า (shopee-products.tsx) ที่ไล่แมพ Category → Attribute
 * → Payload ตั้งแต่ตัวสินค้าเลย
 */
class ShopeeAttributeMappingController extends Controller
{
    use ResolvesMarketplaceMasterCategory;

    // ใช้แบบ allowlist เหมือน LazadaAttributeMappingController::MAPPABLE_INPUT_TYPES
    // 1=SINGLE_DROP_DOWN, 2=SINGLE_COMBO_BOX, 3=FREE_TEXT_FILED,
    // 4=MULTI_DROP_DOWN, 5=MULTI_COMBO_BOX (ดู shopee_attributes migration)
    private const MAPPABLE_INPUT_TYPES = [1, 2, 3, 4, 5];

    // input_type ที่ต้องมี "ตัวเลือกที่กำหนดไว้ล่วงหน้า" แทนค่าอิสระ — ใช้
    // ตัดสินใจว่าจะโชว์/รับ option_mappings ของแถวไหนบ้าง เหมือน
    // LazadaAttributeMappingController::SELECT_INPUT_TYPES
    private const SELECT_INPUT_TYPES = [1, 2, 4, 5];

    // 1/2 = single-choice (ต้องแมปกับ PIM attribute type 'select'),
    // 4/5 = multi-choice (ต้องแมปกับ 'multiselect') — ใช้ตอน validate ว่า
    // PIM attribute ที่เลือกมาเป็น type ที่ resolve ตัวเลือกได้จริง
    private const MULTI_SELECT_INPUT_TYPES = [4, 5];

    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video',
        'shopee_attribute',
    ];

    // ทุกค่าใน TARGET_FIELDS ยกเว้น 'shopee_attribute' — ใช้กำหนดว่า section
    // "3. Payload Shopee" ของหน้า shopee-products.tsx ต้อง render กี่แถว
    // (mirror ของ LazadaAttributeMappingController::STRUCTURED_TARGET_FIELDS)
    private const STRUCTURED_TARGET_FIELDS = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'];

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

            // video_upload_id ของ Shopee ต้องการไฟล์วิดีโอที่อัปโหลดจริงๆ
            // (ดูที่ ShopeeClient::uploadVideo() ซึ่งจะโหลด URL ที่แมปไว้ตรงนี้มา
            // แล้วอัปโหลดขึ้นไปใหม่เป็นไฟล์วิดีโอ) — ข้อจำกัดเดียวกับที่ฟิลด์วิดีโอของ
            // Lazada/TikTok บังคับใช้ หลังจากเคยมีปัญหาตอน push จริงเพราะดันแมป
            // attribute ที่เป็นข้อความ/URL ธรรมดา (เช่น youtube_url) แทนที่จะเป็นไฟล์
            // ที่อัปโหลดไว้
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
                if ($target && !in_array((int) $target->input_type, self::MAPPABLE_INPUT_TYPES, true)) {
                    $validator->errors()->add(
                        "mappings.{$index}.shopee_attribute_id",
                        'Only free-text or dropdown/combo-box Shopee attributes can be mapped yet.'
                    );
                }

                // เหตุผลเดียวกับ LazadaAttributeMappingController::update()'s
                // select-type check — resolveAttributes() (ยังไม่รองรับ
                // select-type ตอน push จริงก็ตาม) และ createOptionsAndMappings()
                // ทำงานได้ก็ต่อเมื่อ source attribute มี AttributeOption ให้
                // resolve จริง (คือต้องเป็น select/multiselect เท่านั้น)
                if ($target && in_array((int) $target->input_type, self::SELECT_INPUT_TYPES, true)) {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    $expectedType = in_array((int) $target->input_type, self::MULTI_SELECT_INPUT_TYPES, true) ? 'multiselect' : 'select';
                    if ($attribute && $attribute->type !== $expectedType) {
                        $validator->errors()->add(
                            "mappings.{$index}.shopee_attribute_id",
                            "This Shopee field needs a predefined choice — only a {$expectedType}-type PIM attribute can be mapped here."
                        );
                    }
                }
            }
        });

        $validated = $validator->validate();

        foreach ($validated['mappings'] as $entry) {
            if (empty($entry['target_field'])) {
                // ลบทีละแถวผ่าน model ให้ event `deleted` ของ Auditable ทำงาน —
                // `->where()->delete()` แบบ mass delete จะข้าม event ทำให้การ
                // ยกเลิกการแมปไม่ถูกบันทึกลง audit_logs
                ShopeeAttributeMapping::where('attribute_id', $entry['attribute_id'])->get()->each->delete();
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

        // ตัวเลือกรายหมวดหมู่ที่ฝังอยู่ในหน้า categories/shopee-mapping.tsx จะเรียก
        // endpoint นี้ผ่าน fetch ธรรมดา (Accept: application/json) แทนที่จะเป็นการ
        // visit แบบ Inertia — ดูเหตุผลได้ที่ branch แบบเดียวกันใน
        // BrandController::bulkMapMarketplaceBrand() ส่วนตัวเรียกอื่นๆ ที่เหลือเป็น
        // Inertia POST จริงๆ ไม่ได้รับผลกระทบ
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'Shopee attribute mapping saved.');
    }

    /**
     * UI สำหรับการไล่ดูและจัดการ Mapping ข้อมูลของสินค้าใน Shopee — mirror ของ
     * LazadaAttributeMappingController::lazadaProducts() เป๊ะ (query/
     * pagination/search/filter/stats เหมือนกันทุกประการ) ต่างกันแค่จุดเดียว:
     * "mapped attribute count" ต้องเทียบด้วย ShopeeAttribute.id (ตัวเลข) ไม่ใช่
     * เทียบด้วยชื่อแบบ Lazada
     */
    public function shopeeProducts(Request $request): Response
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

        $allPimCategories = Category::query()->get(['id', 'parent_id', 'name', 'shopee_category_id'])->keyBy('id');
        $pimCategoryPathOf = function (int $id) use ($allPimCategories): string {
            $names = [];
            $node = $allPimCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allPimCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $allShopeeCategories = ShopeeCategory::query()->get(['id', 'parent_id', 'name', 'is_leaf'])->keyBy('id');
        $shopeeCategoryPathOf = function (int $id) use ($allShopeeCategories): string {
            $names = [];
            $node = $allShopeeCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allShopeeCategories->get($node->parent_id) : null;
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
                $q->whereNotNull('shopee_category_id')
                    ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.shopee_category_id'));
            });
        } elseif ($filter === 'unmapped') {
            $query->whereNull('shopee_category_id')
                ->whereDoesntHave('categories', fn ($cq) => $cq->whereNotNull('categories.shopee_category_id'));
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

        $mappedAttrIds = ShopeeAttributeMapping::whereNotNull('shopee_attribute_id')->pluck('shopee_attribute_id')->unique()->all();
        $shopeeCategoryStats = [];

        $spAttrGroup = ShopeeAttribute::get(['id', 'category_id', 'mandatory'])->groupBy('category_id');
        foreach ($spAttrGroup as $spCatId => $attrs) {
            $totalAttr = $attrs->count();
            $mappedCount = $attrs->filter(fn ($a) => in_array($a->id, $mappedAttrIds, true))->count();
            $shopeeCategoryStats[$spCatId] = [
                'total' => $totalAttr,
                'mapped' => $mappedCount,
            ];
        }

        $rows = $paginated->getCollection()->map(function (Product $product) use ($pnames, $pimCategoryPathOf, $allShopeeCategories, $shopeeCategoryPathOf, $shopeeCategoryStats, $allPimCategories) {
            $masterCat = $this->resolveMasterCategory($product, $allPimCategories, 'shopee_category_id');

            // เหตุผลเดียวกับ LazadaAttributeMappingController — $masterCat คือ
            // หมวดหมู่ที่ลึกที่สุดสำหรับแสดงผล ตัวที่ผูก shopee_category_id
            // ไว้จริงอาจเป็นหมวดแม่ของมันแทนก็ได้ ต้องไล่หาในทุกหมวดหมู่ของ
            // สินค้า ไม่ใช่แค่ $masterCat ตัวเดียว
            $mappedCategory = $this->resolveMappedCategory($product, $allPimCategories, 'shopee_category_id') ?? $masterCat;

            $shopeeCatId = $product->shopee_category_id ?? ($mappedCategory?->shopee_category_id);
            $shopeeCat = $shopeeCatId ? $allShopeeCategories->get($shopeeCatId) : null;

            $attrStats = $shopeeCatId ? ($shopeeCategoryStats[$shopeeCatId] ?? ['total' => 0, 'mapped' => 0]) : null;

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $pnames[$product->id] ?? $product->sku,
                'variants_count' => $product->variants->count(),
                'master_category' => $masterCat ? [
                    'id' => $masterCat->id,
                    'name' => $masterCat->name,
                    'path' => $pimCategoryPathOf($masterCat->id),
                    'shopee_category_id' => $masterCat->shopee_category_id,
                ] : null,
                'shopee_category' => $shopeeCat ? [
                    'id' => $shopeeCat->id,
                    'name' => $shopeeCat->name,
                    'path' => $shopeeCategoryPathOf($shopeeCat->id),
                ] : null,
                'category_mapped' => (bool) $shopeeCatId,
                'attribute_stats' => $attrStats,
            ];
        });

        $paginated->setCollection($rows);

        $totalProductsCount = Product::query()->whereNull('parent_id')->count();
        $mappedProductsCount = Product::query()->whereNull('parent_id')->where(function ($q) {
            $q->whereNotNull('shopee_category_id')
                ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.shopee_category_id'));
        })->count();

        return Inertia::render('catalog/marketplace/shopee-products', [
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
     * จับคู่ PIM AttributeOption แต่ละตัว เข้ากับตัวเลือกที่ Shopee กำหนดไว้
     * ล่วงหน้า (shopee_attributes.options) — mirror ของ
     * LazadaAttributeMappingController::updateOptionMappings() เป๊ะ
     */
    public function updateOptionMappings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.shopee_attribute_mapping_id' => ['required', 'integer', 'exists:shopee_attribute_mappings,id'],
            'mappings.*.attribute_option_id' => ['required', 'integer', 'exists:attribute_options,id'],
            'mappings.*.shopee_option_value' => ['nullable', 'string'],
            'mappings.*.shopee_option_label' => ['nullable', 'string'],
        ]);

        foreach ($validated['mappings'] as $entry) {
            $key = [
                'shopee_attribute_mapping_id' => $entry['shopee_attribute_mapping_id'],
                'attribute_option_id' => $entry['attribute_option_id'],
            ];

            if (empty($entry['shopee_option_value'])) {
                ShopeeAttributeOptionMapping::where($key)->get()->each->delete();
                continue;
            }

            $mapping = ShopeeAttributeOptionMapping::firstOrNew($key);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->shopee_option_value = $entry['shopee_option_value'];
            $mapping->shopee_option_label = $entry['shopee_option_label'] ?? null;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        return response()->json(['success' => true]);
    }

    /**
     * "สร้าง/อัปเดต Attribute Family" ที่ section 2 ของ shopee-products.tsx —
     * mirror ของ LazadaAttributeMappingController::syncAttributeFamily() เป๊ะ
     */
    public function syncAttributeFamily(
        Request $request,
        ShopeeMappedAttributeCreator $attributeCreator,
        ShopeeAttributeFamilyGenerator $familyGenerator,
    ): JsonResponse {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::whereNotNull('shopee_category_id')->find($validated['category_id']);
        if (!$category) {
            return response()->json(['message' => 'This category is not mapped to a Shopee category yet.'], 422);
        }

        try {
            $newlyCreatedCount = $attributeCreator->createMissingForCategory((int) $category->shopee_category_id);
            $result = $familyGenerator->syncForCategory($category);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'family' => ['id' => $result['family']->id, 'name' => $result['family']->name],
            'attribute_count' => $result['attribute_count'],
            'newly_created_count' => $newlyCreatedCount,
            'edit_url' => "/catalog/attributeFamilies/{$result['family']->id}/edit",
        ]);
    }

    /**
     * แท็บ "History" ของหน้า shopee-products.tsx — mirror ของ
     * LazadaAttributeMappingController::timeline() เป๊ะ
     */
    public function timeline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::findOrFail($validated['category_id']);
        $logs = app(ShopeeMappingTimelineBuilder::class)->build($category);

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
     * PIM attribute ที่แมปไว้กับแต่ละฟิลด์ payload ตายตัวของ Shopee (name/price/
     * qty/weight/length/width/height/description/video) ให้ section
     * "3. Payload Shopee" ของหน้า shopee-products.tsx ใช้ prefill ตอนเปิดหน้า
     * — mirror ของ LazadaAttributeMappingController::payloadFieldMappings()
     */
    public function payloadFieldMappings(): JsonResponse
    {
        $mappingsByField = ShopeeAttributeMapping::whereIn('target_field', self::STRUCTURED_TARGET_FIELDS)
            ->with('attribute:id,name')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('target_field');

        $data = collect(self::STRUCTURED_TARGET_FIELDS)->map(function ($field) use ($mappingsByField) {
            $first = $mappingsByField->get($field)?->first();

            return [
                'target_field' => $field,
                'mapped' => $first && $first->attribute ? ['id' => $first->attribute->id, 'name' => $first->attribute->name] : null,
            ];
        });

        return response()->json(['data' => $data->values()]);
    }

    /**
     * ดึงโครงสร้าง attribute จริงจาก Shopee เข้ามา (แค่อ่านอย่างเดียว ไม่ได้เขียนกลับไป)
     * สำหรับทุกหมวดหมู่ PIM ที่แมปกับ shopee_category_id ไว้แล้ว โดยแบ่งดึงทีละ 20
     * ตามค่า max ที่ get_attribute_tree รองรับตามเอกสาร แล้วตัดตัวซ้ำด้วย attribute_id
     * รวมทุกหมวดหมู่ (เทสจริงเมื่อ 2026-08-14 แล้วยืนยันว่า id เดียวกันข้ามหมวดหมู่ได้
     * ค่าเดิมเสมอ) ส่วนการหา account ใช้ตามแบบ
     * CategoryController::syncShopeeCategories()
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
                        'options' => $this->encodeShopeeOptions($attr),
                    ];
                }
            }
        }

        $now = now();
        foreach (array_chunk(array_values($rowsById), 500) as $chunk) {
            ShopeeAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['name', 'input_type', 'options', 'updated_at']
            );
        }

        ShopeeAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsById).' Shopee attributes.');
    }

    /**
     * แนวคิดเดียวกับ syncShopeeAttributes() ด้านบน แต่ทำแค่หมวดหมู่ Shopee เดียว —
     * เป็น action "Sync Attributes" บนหน้า categories/shopee-mapping.tsx ที่อยู่ข้างๆ
     * กับ action แถว "Sync brand" แบบเดียวกันของหน้านั้น (ดู
     * BrandController::syncShopeeBrandsForCategory()) ต่างจากแบรนด์ตรงที่
     * get_attribute_tree ไม่มี pagination และโครงสร้างของแต่ละหมวดหมู่ก็เล็ก
     * (แค่หลักหน่วยถึงหลักสิบกว่าแถว ไม่ใช่หลักพัน) เลยรันแบบ synchronous
     * ในตัว request เลยได้ ไม่ต้องใช้ JobTracker/queue
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
            'options' => $this->encodeShopeeOptions($attr),
            'created_at' => $now,
            'updated_at' => $now,
        ], $tree);

        if ($rows !== []) {
            ShopeeAttribute::upsert($rows, ['id'], ['name', 'input_type', 'category_id', 'mandatory', 'options', 'updated_at']);
        }

        ShopeeAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * `options` (ตัวเลือกที่ Shopee กำหนดไว้ล่วงหน้าสำหรับ input_type
     * dropdown/combo-box 1/2/4/5) จาก raw schema ที่
     * syncShopeeAttributes()/syncShopeeAttributesForCategory() อ่านมาจาก
     * Shopee จริง — mirror ของ
     * LazadaAttributeMappingController::encodeLazadaOptions()
     *
     * shape ยืนยันแล้วจากข้อมูลจริงที่ sync มาจาก sandbox จริง (2026-09-08,
     * category 101192 "Water Pumps, Parts & Accessories"): แต่ละตัวเลือกเป็น
     * `{value_id, name, multi_lang: [{language, value}]}` — ต่างจากที่เอกสาร
     * Shopee ระบุไว้เล็กน้อย (`original_value_name` ไม่ใช่ `name`) โค้ดนี้เขียน
     * แบบ defensive รองรับทั้งคู่อยู่แล้ว (ดู createOptionsAndMappings()/
     * shopeeAttributesForCategory() ที่ fallback `$o['name'] ?? ...`) —
     * สังเกตด้วยว่า input_type แบบ MULTI_COMBO_BOX (5) ที่เจอจริงไม่มี
     * attribute_value_list ติดมาเลย (ต่างจาก 1/2 ที่มี) ต้องรองรับกรณีนี้ไว้
     * (คือ `options` เป็น null ถึงแม้ input_type จะอยู่ใน
     * SELECT_INPUT_TYPES ก็ตาม)
     */
    private function encodeShopeeOptions(array $attr): ?string
    {
        $options = $attr['attribute_value_list'] ?? [];
        if (!is_array($options) || $options === []) {
            return null;
        }

        return json_encode(array_values($options));
    }

    /**
     * Shopee attribute ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุใน migration ที่บอกว่า
     * คอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่ sync ล่าสุด
     * ของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM attribute ไหนแมปอยู่ (ถ้ามี)
     * เป็นข้อมูลหนุนหลังตารางคอลัมน์แบบเดียวกับ "จับคู่แบรนด์กับ PIM" บนหน้า
     * categories/shopee-mapping.tsx — ทำงานเหมือนกับ
     * BrandController::shopeeBrandsForCategory() เป๊ะๆ
     *
     * เพิ่ม `options`/`shopee_attribute_mapping_id`/`option_mappings` เข้ามา
     * (mirror ของ LazadaAttributeMappingController::lazadaAttributesForCategory())
     * ให้หน้า shopee-products.tsx เปิด dialog "จับคู่ตัวเลือก" ได้
     */
    public function shopeeAttributesForCategory(int $shopeeCategoryId): JsonResponse
    {
        $attributes = ShopeeAttribute::where('category_id', $shopeeCategoryId)->orderBy('name')->get();

        $mappedByShopeeAttributeId = ShopeeAttributeMapping::whereIn('shopee_attribute_id', $attributes->pluck('id'))
            ->with(['attribute:id,name', 'optionMappings'])
            ->get()
            ->keyBy('shopee_attribute_id');

        $data = $attributes->map(function (ShopeeAttribute $attribute) use ($mappedByShopeeAttributeId) {
            $mapping = $mappedByShopeeAttributeId->get($attribute->id);
            $isSelectType = in_array($attribute->input_type, self::SELECT_INPUT_TYPES, true);

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'input_type' => $attribute->input_type,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
                // `options` cast เป็น array แล้ว (ดู ShopeeAttribute::$casts)
                // — shape ยืนยันแล้วจากข้อมูลจริง (ดู encodeShopeeOptions()'s
                // docblock) แต่ยังเขียนแบบ defensive ไว้ (ข้ามตัวเลือกที่ไม่มี
                // value_id/id แทนที่จะ error) เผื่อ category อื่นให้ shape
                // ต่างออกไปเล็กน้อย
                'options' => $isSelectType
                    ? collect($attribute->options ?? [])
                        ->filter(fn ($o) => is_array($o) && (isset($o['value_id']) || isset($o['id'])))
                        ->map(fn ($o) => [
                            'value' => (string) ($o['value_id'] ?? $o['id']),
                            'label' => (string) ($o['original_value_name'] ?? $o['name'] ?? ($o['value_id'] ?? $o['id'])),
                        ])
                        ->values()
                    : [],
                'shopee_attribute_mapping_id' => $mapping?->id,
                'option_mappings' => $mapping
                    ? $mapping->optionMappings->map(fn (ShopeeAttributeOptionMapping $m) => [
                        'attribute_option_id' => $m->attribute_option_id,
                        'shopee_option_value' => $m->shopee_option_value,
                    ])->values()
                    : [],
            ];
        });

        return response()->json(['data' => $data->values()]);
    }

    /**
     * endpoint สำหรับค้นหาที่หนุนหลัง Autocomplete ของ PIM attribute ในตารางเดียวกันนี้
     * — เป็นภาพสะท้อนกลับด้านของ BrandController::searchPimBrands() คือตัวนั้น
     * ค้นหาตัวเลือกแบรนด์ของ PIM ส่วนตัวนี้ค้นหา PIM attribute จาก label เพราะที่นี่
     * การแมปก็เริ่มจากฝั่ง Shopee เหมือนกัน (เลือก PIM attribute ให้กับแถว Shopee
     * attribute หนึ่งๆ) ไม่ใช่เลือกกลับด้าน
     */
    public function searchPimAttributes(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        // Comma-separated PIM attribute type allowlist — added for Lazada's
        // `img`-type category attributes (LazadaAttributeMappingController's
        // update() only accepts a source of type image/file for those), same
        // shape PimAttributePicker already passes through for that case.
        // Optional and additive: every existing caller that never sends
        // `type` keeps searching across all types, unchanged.
        $types = array_filter(explode(',', (string) $request->query('type', '')));

        $attributes = Attribute::query()
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($q2) use ($query) {
                    $q2->where('name', 'like', "%{$query}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$query}%"));
                });
            })
            ->when($types !== [], fn ($q) => $q->whereIn('type', $types))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name']);

        return response()->json(['data' => $attributes->map(fn (Attribute $a) => ['id' => $a->id, 'name' => $a->name])]);
    }
}
