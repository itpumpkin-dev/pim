<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\ResolvesMarketplaceMasterCategory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\TikTokAttribute;
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokAttributeOptionMapping;
use App\Models\TikTokCategory;
use App\Models\TikTokSellerAccount;
use App\Services\Catalog\TikTokAttributeFamilyGenerator;
use App\Services\Catalog\TikTokMappedAttributeCreator;
use App\Services\Catalog\TikTokMappingTimelineBuilder;
use App\Services\TikTok\TikTokClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา PIM attribute ตัวไหนมาเติมลงฟิลด์ที่จะส่งไป TikTok
 * โดยไม่ต้องแก้โค้ด — ดูที่ TikTokProductSyncService::buildPayload()/
 * resolveMappedField() (สำหรับฟิลด์ที่มีโครงสร้างชัดเจน) และ resolveProductAttributes()
 * (`tiktok_attribute` พฤติกรรมเดิม) ซึ่งจะอ่านจากตารางนี้แทนที่จะไป lookup แบบ
 * hardcode เดิมอย่าง pname/price_std/qty/weight_pcs/product_details_features/
 * attribute_6/DIMENSION_FIELD_SOURCE
 *
 * v1 (เดิม) รองรับแค่ attribute ที่ TikTok เองติดแฟล็ก `is_customizable` ไว้
 * (คือผู้ขายพิมพ์ค่าเองได้อิสระ) — v2 (ตัวนี้, mirror ของ
 * ShopeeAttributeMappingController's select/dropdown ที่เพิ่งเปิดฝั่ง Shopee)
 * เปิดเพิ่ม attribute ที่ `is_customizable=false` ให้แมปได้ด้วย ต้องเลือกจาก
 * "ตัวเลือกที่กำหนดไว้ล่วงหน้า" (เก็บไว้ที่ tiktok_attributes.options — ดู
 * TikTokAttribute's docblock) จับคู่ผ่านตาราง tiktok_attribute_option_mappings
 * (ดู updateOptionMappings() ด้านล่าง) — ถูกส่งไป TikTok จริงตอน push แล้ว
 * เป็น `{id: value_id}` (ดู TikTokProductSyncService::resolveProductAttributes()'s
 * docblock) ต่างจาก Shopee ตอนเริ่มงานนั้นตรงที่ shape ของ `values[]` และการ
 * push จริงยืนยัน live มาก่อนงานนี้แล้วทั้งคู่ (ดู TikTokClient::getAttributes()'s
 * docblock) เลยรวมการส่งจริงไว้ตั้งแต่ v1 นี้เลย ไม่ต้องแยก decision ทีหลัง
 *
 * index() แบบ read-only ที่เคยอยู่ในนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ WooCommerce/Shopee/
 * Lazada ไว้ใน Inertia response เดียวกัน สำหรับหน้าแท็บรวม
 * "จับคู่แอตทริบิวต์ Marketplace") ส่วน tiktokProducts() ด้านล่าง (mirror ของ
 * ShopeeAttributeMappingController::shopeeProducts()) เป็นคนละหน้ากัน — หน้า
 * Object Page ต่อสินค้า (tiktok-products.tsx) ที่ไล่แมพ Category → Attribute
 * → Payload ตั้งแต่ตัวสินค้าเลย
 */
class TikTokAttributeMappingController extends Controller
{
    use ResolvesMarketplaceMasterCategory;

    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video',
        'tiktok_attribute',
    ];

    // ทุกค่าใน TARGET_FIELDS ยกเว้น 'tiktok_attribute' — ใช้กำหนดว่า section
    // "3. Payload TikTok" ของหน้า tiktok-products.tsx ต้อง render กี่แถว
    private const STRUCTURED_TARGET_FIELDS = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'description', 'video'];

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

            // ข้อจำกัดเรื่อง URL วิดีโอจากภายนอกแบบเดียวกับฟิลด์วิดีโอของ Lazada
            // (ดู docblock ของ LazadaAttributeMappingController สำหรับเหตุการณ์จริง
            // ที่ตรงนี้ป้องกันไม่ให้เกิดซ้ำ) — มีแค่ PIM attribute ประเภท `video`
            // เท่านั้นที่จะแมปเข้ากับ target_field='video' ได้
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
                if (!$target) {
                    continue;
                }

                // เหตุผลเดียวกับ ShopeeAttributeMappingController::update()'s
                // select-type check — resolveProductAttributes() ทำงานได้ก็
                // ต่อเมื่อ source attribute มี AttributeOption ให้ resolve
                // จริง (คือต้องเป็น select/multiselect เท่านั้น) ไม่งั้นจะ
                // resolve ไม่เจอ option อะไรเลยเงียบๆ
                if (!$target->is_customizable) {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    $expectedType = $target->is_multiple_selection ? 'multiselect' : 'select';
                    if ($attribute && $attribute->type !== $expectedType) {
                        $validator->errors()->add(
                            "mappings.{$index}.tiktok_attribute_id",
                            "This TikTok field needs a predefined choice — only a {$expectedType}-type PIM attribute can be mapped here."
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
                TikTokAttributeMapping::where('attribute_id', $entry['attribute_id'])->get()->each->delete();
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

        // ตัวเลือกรายหมวดหมู่ที่ฝังอยู่ในหน้า categories/tiktok-mapping.tsx จะเรียก
        // endpoint นี้ผ่าน fetch ธรรมดา (Accept: application/json) แทนที่จะเป็นการ
        // visit แบบ Inertia — ดูเหตุผลได้ที่ branch แบบเดียวกันใน
        // ShopeeAttributeMappingController::update() ส่วนตัวเรียกอื่นๆ ที่เหลือเป็น
        // Inertia POST จริงๆ ไม่ได้รับผลกระทบ
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'TikTok attribute mapping saved.');
    }

    /**
     * UI สำหรับการไล่ดูและจัดการ Mapping ข้อมูลของสินค้าใน TikTok — mirror ของ
     * ShopeeAttributeMappingController::shopeeProducts() เป๊ะ ใช้
     * ResolvesMarketplaceMasterCategory trait ตัวเดียวกัน (ไม่ต้อง duplicate
     * โค้ด resolveMasterCategory()/resolveMappedCategory() ซ้ำแบบตอน
     * Shopee/Lazada รอบแรกที่ยังไม่มี trait นี้)
     */
    public function tiktokProducts(Request $request): Response
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

        $allPimCategories = Category::query()->get(['id', 'parent_id', 'name', 'tiktok_category_id'])->keyBy('id');
        $pimCategoryPathOf = function (int $id) use ($allPimCategories): string {
            $names = [];
            $node = $allPimCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allPimCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $allTikTokCategories = TikTokCategory::query()->get(['id', 'parent_id', 'name', 'is_leaf'])->keyBy('id');
        $tiktokCategoryPathOf = function (int $id) use ($allTikTokCategories): string {
            $names = [];
            $node = $allTikTokCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allTikTokCategories->get($node->parent_id) : null;
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
                $q->whereNotNull('tiktok_category_id')
                    ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.tiktok_category_id'));
            });
        } elseif ($filter === 'unmapped') {
            $query->whereNull('tiktok_category_id')
                ->whereDoesntHave('categories', fn ($cq) => $cq->whereNotNull('categories.tiktok_category_id'));
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

        $mappedAttrIds = TikTokAttributeMapping::whereNotNull('tiktok_attribute_id')->pluck('tiktok_attribute_id')->unique()->all();
        $tiktokCategoryStats = [];

        $ttAttrGroup = TikTokAttribute::get(['id', 'category_id', 'mandatory'])->groupBy('category_id');
        foreach ($ttAttrGroup as $ttCatId => $attrs) {
            $totalAttr = $attrs->count();
            $mappedCount = $attrs->filter(fn ($a) => in_array($a->id, $mappedAttrIds, true))->count();
            $tiktokCategoryStats[$ttCatId] = [
                'total' => $totalAttr,
                'mapped' => $mappedCount,
            ];
        }

        $rows = $paginated->getCollection()->map(function (Product $product) use ($pnames, $pimCategoryPathOf, $allTikTokCategories, $tiktokCategoryPathOf, $tiktokCategoryStats, $allPimCategories) {
            $masterCat = $this->resolveMasterCategory($product, $allPimCategories, 'tiktok_category_id');

            // เหตุผลเดียวกับ ShopeeAttributeMappingController — $masterCat คือ
            // หมวดหมู่ที่ลึกที่สุดสำหรับแสดงผล ตัวที่ผูก tiktok_category_id
            // ไว้จริงอาจเป็นหมวดแม่ของมันแทนก็ได้ ต้องไล่หาในทุกหมวดหมู่ของ
            // สินค้า ไม่ใช่แค่ $masterCat ตัวเดียว
            $mappedCategory = $this->resolveMappedCategory($product, $allPimCategories, 'tiktok_category_id') ?? $masterCat;

            $tiktokCatId = $product->tiktok_category_id ?? ($mappedCategory?->tiktok_category_id);
            $tiktokCat = $tiktokCatId ? $allTikTokCategories->get($tiktokCatId) : null;

            $attrStats = $tiktokCatId ? ($tiktokCategoryStats[$tiktokCatId] ?? ['total' => 0, 'mapped' => 0]) : null;

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $pnames[$product->id] ?? $product->sku,
                'variants_count' => $product->variants->count(),
                'master_category' => $masterCat ? [
                    'id' => $masterCat->id,
                    'name' => $masterCat->name,
                    'path' => $pimCategoryPathOf($masterCat->id),
                    'tiktok_category_id' => $masterCat->tiktok_category_id,
                ] : null,
                'tiktok_category' => $tiktokCat ? [
                    'id' => $tiktokCat->id,
                    'name' => $tiktokCat->name,
                    'path' => $tiktokCategoryPathOf($tiktokCat->id),
                ] : null,
                'category_mapped' => (bool) $tiktokCatId,
                'attribute_stats' => $attrStats,
            ];
        });

        $paginated->setCollection($rows);

        $totalProductsCount = Product::query()->whereNull('parent_id')->count();
        $mappedProductsCount = Product::query()->whereNull('parent_id')->where(function ($q) {
            $q->whereNotNull('tiktok_category_id')
                ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.tiktok_category_id'));
        })->count();

        return Inertia::render('catalog/marketplace/tiktok-products', [
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
     * จับคู่ PIM AttributeOption แต่ละตัว เข้ากับตัวเลือกที่ TikTok กำหนดไว้
     * ล่วงหน้า (tiktok_attributes.options) — mirror ของ
     * ShopeeAttributeMappingController::updateOptionMappings() เป๊ะ
     */
    public function updateOptionMappings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.tiktok_attribute_mapping_id' => ['required', 'integer', 'exists:tiktok_attribute_mappings,id'],
            'mappings.*.attribute_option_id' => ['required', 'integer', 'exists:attribute_options,id'],
            'mappings.*.tiktok_option_value' => ['nullable', 'string'],
            'mappings.*.tiktok_option_label' => ['nullable', 'string'],
        ]);

        foreach ($validated['mappings'] as $entry) {
            $key = [
                'tiktok_attribute_mapping_id' => $entry['tiktok_attribute_mapping_id'],
                'attribute_option_id' => $entry['attribute_option_id'],
            ];

            if (empty($entry['tiktok_option_value'])) {
                TikTokAttributeOptionMapping::where($key)->get()->each->delete();
                continue;
            }

            $mapping = TikTokAttributeOptionMapping::firstOrNew($key);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->tiktok_option_value = $entry['tiktok_option_value'];
            $mapping->tiktok_option_label = $entry['tiktok_option_label'] ?? null;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        return response()->json(['success' => true]);
    }

    /**
     * "สร้าง/อัปเดต Attribute Family" ที่ section 2 ของ tiktok-products.tsx —
     * mirror ของ ShopeeAttributeMappingController::syncAttributeFamily() เป๊ะ
     */
    public function syncAttributeFamily(
        Request $request,
        TikTokMappedAttributeCreator $attributeCreator,
        TikTokAttributeFamilyGenerator $familyGenerator,
    ): JsonResponse {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::whereNotNull('tiktok_category_id')->find($validated['category_id']);
        if (!$category) {
            return response()->json(['message' => 'This category is not mapped to a TikTok category yet.'], 422);
        }

        try {
            $newlyCreatedCount = $attributeCreator->createMissingForCategory((int) $category->tiktok_category_id);
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
     * แท็บ "History" ของหน้า tiktok-products.tsx — mirror ของ
     * ShopeeAttributeMappingController::timeline() เป๊ะ
     */
    public function timeline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::findOrFail($validated['category_id']);
        $logs = app(TikTokMappingTimelineBuilder::class)->build($category);

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
     * PIM attribute ที่แมปไว้กับแต่ละฟิลด์ payload ตายตัวของ TikTok (name/price/
     * qty/weight/length/width/height/description/video) ให้ section
     * "3. Payload TikTok" ของหน้า tiktok-products.tsx ใช้ prefill ตอนเปิดหน้า
     * — mirror ของ ShopeeAttributeMappingController::payloadFieldMappings()
     */
    public function payloadFieldMappings(): JsonResponse
    {
        $mappingsByField = TikTokAttributeMapping::whereIn('target_field', self::STRUCTURED_TARGET_FIELDS)
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
     * ดึงโครงสร้าง attribute ของหมวดหมู่จริงจาก TikTok เข้ามา (แค่อ่านอย่างเดียว
     * ไม่ได้เขียนกลับไป) สำหรับทุกหมวดหมู่ PIM ที่แมปกับ tiktok_category_id ไว้แล้ว
     * โดยเรียก getAttributes() ทีละ 1 ครั้งต่อ 1 หมวดหมู่ (endpoint ของ TikTok รับ
     * category_id เดียวเท่านั้น ไม่ใช่ list แบบ batch เหมือนกับ /category/attributes/get
     * ของ Lazada) ตัดตัวซ้ำด้วย `id` ของ attribute รวมทุกหมวดหมู่ — ดูข้อควรระวัง
     * เรื่องนี้ได้ที่ docblock ของ migration มีการหน่วงเวลาสั้นๆ ระหว่างแต่ละ call
     * เป็นมาตรการป้องกันแบบเดียวกับ
     * LazadaAttributeMappingController::syncLazadaAttributes()
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
                    'options' => $this->encodeTikTokOptions($attr),
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
                ['name', 'is_customizable', 'is_multiple_selection', 'options', 'updated_at']
            );
        }

        TikTokAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsById).' TikTok attributes across '.count($categoryIds).' categories.');
    }

    /**
     * แนวคิดเดียวกับ syncTikTokAttributes() ด้านบน แต่ทำแค่หมวดหมู่ TikTok เดียว —
     * เป็น action "Sync attributes" บนหน้า categories/tiktok-mapping.tsx เลียนแบบ
     * ShopeeAttributeMappingController::syncShopeeAttributesForCategory()/
     * LazadaAttributeMappingController::syncLazadaAttributesForCategory()
     * รันแบบ synchronous — เรียก getAttributes() แค่ครั้งเดียว เหมือนกับแต่ละรอบ
     * loop ต่อหมวดหมู่ด้านบน แค่ไม่ต้องหน่วงเวลากันเรียกถี่เกิน เพราะตรงนี้เรียกแค่
     * ครั้งเดียว
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
                'options' => $this->encodeTikTokOptions($attr),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows !== []) {
            TikTokAttribute::upsert($rows, ['id'], ['name', 'is_customizable', 'is_multiple_selection', 'category_id', 'mandatory', 'options', 'updated_at']);
        }

        TikTokAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * `options` (ตัวเลือกที่ TikTok กำหนดไว้ล่วงหน้าสำหรับ attribute ที่
     * `is_customizable=false`) จาก raw schema ที่
     * syncTikTokAttributes()/syncTikTokAttributesForCategory() อ่านมาจาก
     * TikTok จริง — shape ยืนยันแล้วจากของจริงตั้งแต่ก่อนงานนี้ (ดู
     * TikTokClient::getAttributes()'s docblock, live 2026-08-17): `values[]`
     * เป็น `[{id, name}]`
     */
    private function encodeTikTokOptions(array $attr): ?string
    {
        $options = $attr['values'] ?? [];
        if (!is_array($options) || $options === []) {
            return null;
        }

        return json_encode(array_values($options));
    }

    /**
     * TikTok attribute ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุใน migration ที่บอกว่า
     * คอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่ sync ล่าสุด
     * ของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM attribute ไหนแมปอยู่ (ถ้ามี)
     * เป็นข้อมูลหนุนหลังตารางคอลัมน์ "จับคู่ Attribute กับ PIM" บนหน้า
     * categories/tiktok-mapping.tsx — ทำงานเหมือนกับ
     * ShopeeAttributeMappingController::shopeeAttributesForCategory() เป๊ะๆ
     * แค่ใช้ `id` เป็น key (เป็น string ตามชนิด PK ของ TikTokAttribute เอง)
     *
     * เพิ่ม `options`/`tiktok_attribute_mapping_id`/`option_mappings` เข้ามา
     * (mirror ของ ShopeeAttributeMappingController::shopeeAttributesForCategory())
     * ให้หน้า tiktok-products.tsx เปิด dialog "จับคู่ตัวเลือก" ได้
     */
    public function tiktokAttributesForCategory(int $tiktokCategoryId): JsonResponse
    {
        $attributes = TikTokAttribute::where('category_id', $tiktokCategoryId)->orderBy('name')->get();

        $mappedByTikTokAttributeId = TikTokAttributeMapping::whereIn('tiktok_attribute_id', $attributes->pluck('id'))
            ->with(['attribute:id,name', 'optionMappings'])
            ->get()
            ->keyBy('tiktok_attribute_id');

        $data = $attributes->map(function (TikTokAttribute $attribute) use ($mappedByTikTokAttributeId) {
            $mapping = $mappedByTikTokAttributeId->get($attribute->id);
            $isSelectType = !$attribute->is_customizable;

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'is_customizable' => (bool) $attribute->is_customizable,
                'is_multiple_selection' => (bool) $attribute->is_multiple_selection,
                'mandatory' => (bool) $attribute->mandatory,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
                // `options` cast เป็น array แล้ว (ดู TikTokAttribute::$casts)
                'options' => $isSelectType
                    ? collect($attribute->options ?? [])
                        ->filter(fn ($o) => is_array($o) && isset($o['id']))
                        ->map(fn ($o) => ['value' => (string) $o['id'], 'label' => (string) ($o['name'] ?? $o['id'])])
                        ->values()
                    : [],
                'tiktok_attribute_mapping_id' => $mapping?->id,
                'option_mappings' => $mapping
                    ? $mapping->optionMappings->map(fn (TikTokAttributeOptionMapping $m) => [
                        'attribute_option_id' => $m->attribute_option_id,
                        'tiktok_option_value' => $m->tiktok_option_value,
                    ])->values()
                    : [],
            ];
        });

        return response()->json(['data' => $data->values()]);
    }
}
