<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\LazadaCategory;
use App\Models\LazadaSellerAccount;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductValue;
use App\Services\Catalog\LazadaAttributeFamilyGenerator;
use App\Services\Catalog\LazadaMappedAttributeCreator;
use App\Services\Catalog\LazadaMappingTimelineBuilder;
use App\Services\Lazada\LazadaClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * ให้แอดมินเลือกได้ว่าจะเอา PIM attribute ตัวไหนมาเติมลงฟิลด์ที่จะส่งไป Lazada
 * โดยไม่ต้องแก้โค้ด — ดูที่ LazadaProductSyncService::buildPayload()/
 * resolveMappedField() (สำหรับฟิลด์ที่มีโครงสร้างชัดเจน) และ resolveMappedAttributes()
 * (`lazada_attribute` — คือ payload.attributes ตอน attribute_type=normal /
 * ฟิลด์ SKU ตอน attribute_type=sku ซึ่งเป็นพฤติกรรมเดิม) ซึ่งจะอ่านจากตารางนี้แทนที่
 * จะไป lookup แบบ hardcode เดิมอย่าง pname/price_std/qty/attribute_6/
 * SKU_FIELD_SOURCE
 *
 * v1 รองรับแค่ attribute ที่กรอกค่าอิสระได้ (input_type text/numeric/richText)
 * เท่านั้น — v2 (ตัวนี้) เปิดเพิ่ม 3 กลุ่ม: `date` (ผ่านค่าตรงๆ เหมือน text ไม่มี
 * format transform ใดๆ), `img` (ต้องเป็น PIM attribute type image/file เท่านั้น
 * — ดู update()'s img check ด้านล่าง เหมือนที่ทำกับ video ไว้แล้ว ค่าที่ resolve
 * ได้เป็น URL อยู่แล้วผ่าน AttributeValueFormatter, อัปโหลดเป็น Lazada URL จริง
 * ตอน push ผ่าน LazadaProductSyncService::uploadAttributeImagesToLazada())
 * และ singleSelect/multiSelect/enumInput/multiEnumInput (ต้องมี "ตัวเลือกที่
 * กำหนดไว้ล่วงหน้า" ไม่ใช่ค่าอิสระ — เก็บไว้ที่คอลัมน์ lazada_attributes.options
 * ซึ่งมีอยู่แล้วในตารางนี้ตั้งแต่ก่อนโค้ดชุดนี้ — ยืนยันจริงจากข้อมูลที่ sync ไว้แล้ว
 * ก่อนหน้านี้ว่าแต่ละตัวเลือกเป็น `{name, en_name, id}`, ดู encodeLazadaOptions()
 * — คู่กับตาราง lazada_attribute_option_mappings ที่จับคู่ PIM AttributeOption
 * แต่ละตัวเข้ากับ `id` นั้น ดู updateOptionMappings() ด้านล่าง และ
 * LazadaProductSyncService::resolveMappedAttributes())
 *
 * ยังไม่มี precedent ของการแมประดับตัวเลือกแบบนี้มาก่อนในระบบ (Shopee/TikTok/
 * WooCommerce ก็ตัดสินใจแบบเดียวกันไว้ทั้งหมด — select-type ยังไม่รองรับด้วย
 * เหตุผลเดียวกัน) รูปแบบ value ที่ Lazada ต้องการตอนส่ง multiSelect จริงตอน push
 * (array vs. comma-separated) ยังไม่เคยถูกยืนยันกับบัญชี Lazada จริง (ต่างจาก
 * รูปร่างของ `options` ที่ยืนยันแล้วข้างต้น) — ต้องทดสอบ push จริงก่อนเชื่อ 100%
 *
 * index() แบบ read-only ที่เคยอยู่ในนี้ ตอนนี้ย้ายไปอยู่ที่
 * MarketplaceAttributeMappingController แล้ว (รวมกับของ WooCommerce/Shopee/
 * TikTok ไว้ใน Inertia response เดียวกัน สำหรับหน้าแท็บรวม
 * "จับคู่เนื้อหา Marketplace") — controller นี้เลยเหลือแค่ action ที่เขียนข้อมูลเท่านั้น
 */
class LazadaAttributeMappingController extends Controller
{
    // ใช้แบบ allowlist (ปฏิเสธทุกอย่างที่ยังไม่ได้ยืนยันชัดๆ ว่าปลอดภัย) เป็นค่าเริ่มต้น
    // แบบระมัดระวังแบบเดียวกับที่ใช้ทั่วทั้งแอปในส่วน integration ของ marketplace
    // ฟิลด์ richText (เช่น description/short_description — เช็คจากของจริงแล้วเมื่อ
    // 2026-08-21 ผ่าน category schema ที่ sync มาจริง) รับ HTML จริงๆ ได้
    // เหมือนกับ PIM attribute แบบ `textarea` ของแอปนี้เองที่ตรวจสอบแล้วว่าเก็บได้ —
    // ดู LazadaProductSyncService ซึ่งจะส่งค่าที่แมปไว้ผ่านตรงๆ ทั้งสองแบบอยู่ดี
    //
    // date/img/singleSelect/multiSelect/enumInput/multiEnumInput เปิดเพิ่มแล้ว
    // (ดู docblock ของ class นี้ด้านบน) — img มีเงื่อนไขเพิ่มเติมที่ validator's
    // after() closure ด้านล่าง (ต้องเป็น PIM attribute type image/file เท่านั้น
    // เหมือนที่ video บังคับ type=video)
    private const MAPPABLE_INPUT_TYPES = [
        'text', 'numeric', 'richText', 'date', 'img',
        'singleSelect', 'multiSelect', 'enumInput', 'multiEnumInput',
    ];

    // input_type ที่ต้องมี "ตัวเลือกที่กำหนดไว้ล่วงหน้า" (lazada_attributes.options)
    // แทนค่าอิสระ — ใช้ตัดสินใจว่าจะโชว์/รับ option_mappings ของแถวไหนบ้าง ทั้งใน
    // lazadaAttributesForCategory() (ตอนอ่าน) และ updateOptionMappings() (ตอนเขียน)
    private const SELECT_INPUT_TYPES = ['singleSelect', 'multiSelect', 'enumInput', 'multiEnumInput'];

    // เดิมมีอยู่แล้วก่อนงาน select/img/date นี้ (target_field ของ
    // lazada_attribute_mappings แต่ละแถว — 'lazada_attribute' คือ custom
    // category attribute ผ่าน lazada_attribute_name/resolveMappedAttributes()
    // ส่วนที่เหลือคือฟิลด์ที่มีโครงสร้างชัดเจนของ Lazada เอง ผ่าน
    // resolveMappedField()) หายไปจากไฟล์นี้เฉยๆ (ไม่เกี่ยวกับงานชุดนี้ — เจอตอน
    // debug error 500 "Undefined constant ...::TARGET_FIELDS" ที่ update() บรรทัด
    // ด้านล่างอ้างถึงอยู่แล้วทั้งที่ตัวประกาศหายไป) กู้กลับมาจาก git HEAD ตรงๆ
    private const TARGET_FIELDS = [
        'name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video',
        'lazada_attribute',
    ];

    // ทุกค่าใน TARGET_FIELDS ยกเว้น 'lazada_attribute' — คือฟิลด์ payload ตายตัวของ
    // Lazada เอง (SellerSku/quantity/price/name/video/package_* ใน
    // LazadaProductSyncService::buildPayload()) ใช้กำหนดว่า section "3. Payload
    // Lazada" ของหน้า lazada-products.tsx (Object Page ต่อสินค้า) ต้อง render กี่แถว
    private const STRUCTURED_TARGET_FIELDS = ['name', 'price', 'qty', 'weight', 'length', 'width', 'height', 'video'];

    /**
     * UI สำหรับการไล่ดูและจัดการ Mapping ข้อมูลของสินค้าใน Lazada
     * แสดงตารางสินค้า, Master Category, Lazada Category, Action (จัดการ Mapping)
     */
    public function lazadaProducts(Request $request): Response
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

        $allPimCategories = Category::query()->get(['id', 'parent_id', 'name', 'lazada_category_id'])->keyBy('id');
        $pimCategoryPathOf = function (int $id) use ($allPimCategories): string {
            $names = [];
            $node = $allPimCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allPimCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $allLazadaCategories = LazadaCategory::query()->get(['id', 'parent_id', 'name', 'is_leaf'])->keyBy('id');
        $lazadaCategoryPathOf = function (int $id) use ($allLazadaCategories): string {
            $names = [];
            $node = $allLazadaCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allLazadaCategories->get($node->parent_id) : null;
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
                $q->whereNotNull('lazada_category_id')
                    ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.lazada_category_id'));
            });
        } elseif ($filter === 'unmapped') {
            $query->whereNull('lazada_category_id')
                ->whereDoesntHave('categories', fn ($cq) => $cq->whereNotNull('categories.lazada_category_id'));
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

        $hasCategoryCol = Schema::hasColumn('lazada_attributes', 'category_id');
        $hasMandatoryCol = Schema::hasColumn('lazada_attributes', 'mandatory');

        $mappedAttrNames = LazadaAttributeMapping::whereNotNull('lazada_attribute_name')->pluck('lazada_attribute_name')->unique()->all();
        $lazadaCategoryStats = [];

        if ($hasCategoryCol) {
            $selectCols = ['name', 'category_id'];
            if ($hasMandatoryCol) {
                $selectCols[] = 'mandatory';
            }
            $lzAttrGroup = LazadaAttribute::get($selectCols)->groupBy('category_id');
            foreach ($lzAttrGroup as $lzCatId => $attrs) {
                $totalAttr = $attrs->count();
                $mappedCount = $attrs->filter(fn ($a) => in_array($a->name, $mappedAttrNames, true))->count();
                $lazadaCategoryStats[$lzCatId] = [
                    'total' => $totalAttr,
                    'mapped' => $mappedCount,
                ];
            }
        } else {
            $totalAttr = LazadaAttribute::count();
            $mappedCount = count($mappedAttrNames);
            foreach ($allLazadaCategories as $lzCatId => $lzCat) {
                $lazadaCategoryStats[$lzCatId] = [
                    'total' => $totalAttr,
                    'mapped' => $mappedCount,
                ];
            }
        }

        $rows = $paginated->getCollection()->map(function (Product $product) use ($pnames, $pimCategoryPathOf, $allLazadaCategories, $lazadaCategoryPathOf, $lazadaCategoryStats) {
            $masterCat = $product->categories->first();

            $lazadaCatId = $product->lazada_category_id ?? ($masterCat?->lazada_category_id);
            $lazadaCat = $lazadaCatId ? $allLazadaCategories->get($lazadaCatId) : null;

            $attrStats = $lazadaCatId ? ($lazadaCategoryStats[$lazadaCatId] ?? ['total' => 0, 'mapped' => 0]) : null;

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $pnames[$product->id] ?? $product->sku,
                'variants_count' => $product->variants->count(),
                'master_category' => $masterCat ? [
                    'id' => $masterCat->id,
                    'name' => $masterCat->name,
                    'path' => $pimCategoryPathOf($masterCat->id),
                    'lazada_category_id' => $masterCat->lazada_category_id,
                ] : null,
                'lazada_category' => $lazadaCat ? [
                    'id' => $lazadaCat->id,
                    'name' => $lazadaCat->name,
                    'path' => $lazadaCategoryPathOf($lazadaCat->id),
                ] : null,
                'category_mapped' => (bool) $lazadaCatId,
                'attribute_stats' => $attrStats,
            ];
        });

        $paginated->setCollection($rows);

        $totalProductsCount = Product::query()->whereNull('parent_id')->count();
        $mappedProductsCount = Product::query()->whereNull('parent_id')->where(function ($q) {
            $q->whereNotNull('lazada_category_id')
                ->orWhereHas('categories', fn ($cq) => $cq->whereNotNull('categories.lazada_category_id'));
        })->count();

        return Inertia::render('catalog/marketplace/lazada-products', [
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

            // Lazada จะปฏิเสธ URL วิดีโอจากภายนอกเสมอ (เช็คจากของจริงแล้ว เจอ error
            // BIZ_CHECK_EXTERNAL_VIDEO_IS_FORBIDDEN) — มีแค่ PIM attribute ประเภท
            // `video` เท่านั้น (คือไฟล์ที่อัปโหลดไว้ เช่น attribute_6) ที่จะแมปเข้ากับ
            // target_field='video' ได้ ห้ามแมป attribute ที่เป็นข้อความ/URL ธรรมดา
            // อย่าง youtube_url เด็ดขาด ดูเหตุผลเพิ่มเติมได้ที่ docblock ของ class นี้
            // และ migration ที่เปิดฟิลด์นี้ขึ้นมาใหม่
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

                // เหตุผลเดียวกับ video check ด้านบน — ค่าที่ไม่ใช่ path ไฟล์จริงจะไป
                // ผ่าน AttributeValueFormatter ตรงๆ ไม่ได้ (จะได้ raw string กลับมา
                // ไม่ใช่ URL) แล้วพังตอน uploadAttributeImagesToLazada() พยายาม
                // อัปโหลดมันเป็นรูปที่ LazadaProductSyncService — บังคับ source ต้อง
                // เป็น image/file เท่านั้น เหมือนที่ video บังคับ type=video
                if ($target && $target->input_type === 'img') {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    if ($attribute && !in_array($attribute->type, ['image', 'file'], true)) {
                        $validator->errors()->add(
                            "mappings.{$index}.lazada_attribute_name",
                            'This Lazada field expects an image — only an image/file-type PIM attribute can be mapped here.'
                        );
                    }
                }

                // เหตุผลเดียวกับ img check ด้านบน — resolveSingleSelectOptionValue()/
                // resolveMultiSelectOptionValues() (LazadaProductSyncService) ทำงาน
                // ได้ก็ต่อเมื่อ source attribute มี AttributeOption ให้ resolve จริง
                // (คือต้องเป็น select/multiselect เท่านั้น) ไม่งั้นจะ resolve ไม่เจอ
                // option อะไรเลยเงียบๆ (ไม่ error แต่ก็ไม่มีค่าส่งไปเช่นกัน) ดักไว้ตรงนี้
                // ให้แอดมินรู้ทันทีแทนที่จะงงว่าทำไมค่าไม่ไปถึง Lazada
                if ($target && in_array($target->input_type, self::SELECT_INPUT_TYPES, true)) {
                    $attribute = $attributesById->get($entry['attribute_id'] ?? null);
                    $expectedType = in_array($target->input_type, ['multiSelect', 'multiEnumInput'], true) ? 'multiselect' : 'select';
                    if ($attribute && $attribute->type !== $expectedType) {
                        $validator->errors()->add(
                            "mappings.{$index}.lazada_attribute_name",
                            "This Lazada field needs a predefined choice — only a {$expectedType}-type PIM attribute can be mapped here."
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
                LazadaAttributeMapping::where('attribute_id', $entry['attribute_id'])->get()->each->delete();
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

        // ตัวเลือกรายหมวดหมู่ที่ฝังอยู่ในหน้า categories/lazada-mapping.tsx จะเรียก
        // endpoint นี้ผ่าน fetch ธรรมดา (Accept: application/json) แทนที่จะเป็นการ
        // visit แบบ Inertia — ดูเหตุผลได้ที่ branch แบบเดียวกันใน
        // ShopeeAttributeMappingController::update() ส่วนตัวเรียกอื่นๆ ที่เหลือเป็น
        // Inertia POST จริงๆ ไม่ได้รับผลกระทบ
        if ($request->wantsJson()) {
            return response()->json(['success' => true]);
        }

        return back()->with('success', 'Lazada attribute mapping saved.');
    }

    /**
     * จับคู่ PIM AttributeOption แต่ละตัว (ของ attribute ที่ผูกไว้กับ
     * lazada_attribute_mapping_id นี้แล้วผ่าน update() ด้านบน) เข้ากับตัวเลือก
     * ที่ Lazada กำหนดไว้ล่วงหน้า (lazada_attribute_options.value) — จำเป็นสำหรับ
     * input_type แบบ singleSelect/multiSelect/enumInput/multiEnumInput เท่านั้น
     * (ดู docblock ของ class นี้) เขียนทีละแถวผ่าน model (ไม่ mass-delete) ให้
     * audit_logs บันทึกตามปกติ — `lazada_option_value: null` หมายถึงล้างคู่นั้น
     * ทิ้ง เหมือน convention เดียวกับ update() ด้านบนที่ target_field: null = ลบ
     */
    public function updateOptionMappings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mappings' => ['required', 'array', 'min:1'],
            'mappings.*.lazada_attribute_mapping_id' => ['required', 'integer', 'exists:lazada_attribute_mappings,id'],
            'mappings.*.attribute_option_id' => ['required', 'integer', 'exists:attribute_options,id'],
            'mappings.*.lazada_option_value' => ['nullable', 'string'],
            // ค่า label ของตัวเลือกที่เลือกไว้ ณ ตอนนี้ (frontend มีอยู่แล้วในลิสต์
            // ที่ render dropdown ให้เลือก) เก็บไว้คู่กับ value เพื่อไม่ต้องพึ่ง
            // lazada_attributes.options (global cache ที่ sync ของ category อื่น
            // ทับได้ตลอดเวลา) ตอน resolve ชื่อจริงกลับตอน push — ดู
            // LazadaProductSyncService::resolveMappedAttributes()' บั๊กที่แก้ไปแล้ว
            'mappings.*.lazada_option_label' => ['nullable', 'string'],
        ]);

        foreach ($validated['mappings'] as $entry) {
            $key = [
                'lazada_attribute_mapping_id' => $entry['lazada_attribute_mapping_id'],
                'attribute_option_id' => $entry['attribute_option_id'],
            ];

            if (empty($entry['lazada_option_value'])) {
                LazadaAttributeOptionMapping::where($key)->get()->each->delete();
                continue;
            }

            $mapping = LazadaAttributeOptionMapping::firstOrNew($key);
            if (!$mapping->exists) {
                $mapping->created_by = $request->user()?->id;
            }
            $mapping->lazada_option_value = $entry['lazada_option_value'];
            $mapping->lazada_option_label = $entry['lazada_option_label'] ?? null;
            $mapping->updated_by = $request->user()?->id;
            $mapping->save();
        }

        return response()->json(['success' => true]);
    }

    /**
     * "สร้าง/อัปเดต Attribute Family" ที่ section 2 ของ lazada-products.tsx —
     * auto-generate ตระกูลแอตทริบิวต์จาก PIM attribute ที่แมปไว้แล้วกับ Lazada
     * attribute ของ category นี้ แล้วผูกเข้ากับ PIM Category ที่ระบุ (ผ่าน
     * Category::attributeFamilies() ที่มีอยู่แล้ว) ให้ฟิลด์พวกนี้โผล่ในหน้า Edit
     * Product ของสินค้าที่อยู่ใน category นั้นทันที โดยไม่ต้องแก้อะไรฝั่งนั้นเลย —
     * ดู LazadaAttributeFamilyGenerator::syncForCategory() สำหรับ logic เต็มๆ
     */
    public function syncAttributeFamily(
        Request $request,
        LazadaMappedAttributeCreator $attributeCreator,
        LazadaAttributeFamilyGenerator $familyGenerator,
    ): JsonResponse {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::whereNotNull('lazada_category_id')->find($validated['category_id']);
        if (!$category) {
            return response()->json(['message' => 'This category is not mapped to a Lazada category yet.'], 422);
        }

        try {
            // เรียกก่อน syncForCategory() เสมอ — attribute ที่เพิ่งสร้าง/แมปใหม่
            // ตรงนี้จะได้ถูกดึงเข้า Family ในรอบเดียวกันเลย ไม่ต้องกดปุ่มสองรอบ
            $newlyCreatedCount = $attributeCreator->createMissingForCategory((int) $category->lazada_category_id);
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
     * แท็บ "History" ของหน้า lazada-products.tsx — รวม audit trail ของทุก
     * ขั้นตอนการแมพ Lazada ของ category มาสเตอร์ของสินค้าที่กำลังดูอยู่ (จับคู่
     * category, จับคู่ attribute, จับคู่ตัวเลือก, auto-create attribute ใหม่,
     * sync attribute family) ให้เป็น timeline เดียว เรียงใหม่สุดก่อน — ดู
     * LazadaMappingTimelineBuilder สำหรับขอบเขต/ที่มาของแต่ละแหล่งข้อมูล
     *
     * Reshape ตาม TimelinePanel ต้องการ ({event, created_at, actor, diff,
     * subject_type, subject_id}) — มิเรอร์ UserController::history() เป๊ะ
     * (diff builder เดียวกัน, ตัดสินใจ subject_type/subject_id ด้วยวิธีเดียวกัน
     * ผ่าน class_basename($log->auditable_type))
     */
    public function timeline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:categories,id'],
        ]);

        $category = Category::findOrFail($validated['category_id']);
        $logs = app(LazadaMappingTimelineBuilder::class)->build($category);

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
     * PIM attribute ที่แมปไว้กับแต่ละฟิลด์ payload ตายตัวของ Lazada (name/price/
     * qty/weight/length/width/height/video) ให้ section "3. Payload Lazada"
     * ของหน้า lazada-products.tsx (Object Page ต่อสินค้า) ใช้ prefill ตอนเปิดหน้า
     * — คนละกลุ่มกับ lazadaAttributesForCategory() ด้านล่าง (ตัวนั้นคือ category
     * attribute ที่ผูกกับหมวดหมู่ Lazada หนึ่งๆ ผ่าน target_field='lazada_attribute'
     * ส่วนตรงนี้เป็นฟิลด์ตายตัวของ Lazada เอง ไม่ผูกกับหมวดหมู่ไหนเลย)
     *
     * ถ้ามีหลาย PIM attribute แมปกับฟิลด์เดียวกัน (รองรับได้ตามที่ออกแบบไว้ —
     * "attribute ตัวแรกที่มีค่าจะชนะ" ตาม sort_order ดู resolveMappedField())
     * ส่งกลับแค่ตัวแรกตาม sort_order ให้พอเห็นว่ามีอะไรอยู่บ้าง
     */
    public function payloadFieldMappings(): JsonResponse
    {
        $mappingsByField = LazadaAttributeMapping::whereIn('target_field', self::STRUCTURED_TARGET_FIELDS)
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
     * ดึงโครงสร้าง attribute ของหมวดหมู่จริงจาก Lazada เข้ามา (แค่อ่านอย่างเดียว
     * ไม่ได้เขียนกลับไป) สำหรับทุกหมวดหมู่ PIM ที่แมปกับ lazada_category_id ไว้แล้ว
     * โดยเรียก /category/attributes/get ทีละ 1 ครั้งต่อ 1 หมวดหมู่ (ต่างจาก
     * get_attribute_tree ของ Shopee ตรงที่ endpoint นี้รับ primary_category_id
     * เดียวเท่านั้น ไม่ใช่ list แบบ batch) ตัดตัวซ้ำด้วย `name` ของ attribute รวมทุก
     * หมวดหมู่ มีการหน่วงเวลาสั้นๆ ระหว่างแต่ละ call — rate limit ต่อ account ของ
     * Lazada (error "901: too frequent") เคยเจอมาแล้วจริงๆ ว่าเกิดขึ้นได้แค่จาก
     * การเรียกติดๆ กันไม่กี่ครั้ง (ดูข้อค้นพบเดียวกันที่ docblock ของ
     * LazadaProductSyncService::syncLiveStatus()) และตรงนี้จะเรียก 1 ครั้งต่อ 1
     * หมวดหมู่ที่แมปไว้
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
                    'options' => $this->encodeLazadaOptions($attr),
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
                ['label', 'input_type', 'attribute_type', 'options', 'updated_at']
            );
        }

        LazadaAttribute::bumpListVersion();

        return back()->with('success', 'Synced '.count($rowsByName).' Lazada attributes across '.count($categoryIds).' categories.');
    }

    /**
     * `options` (ตัวเลือกที่ Lazada กำหนดไว้ล่วงหน้าสำหรับ input_type
     * singleSelect/multiSelect/enumInput/multiEnumInput) ของ attribute หนึ่ง
     * ตัวจาก raw schema ที่ syncLazadaAttributes()/syncLazadaAttributesForCategory()
     * อ่านมาจาก Lazada จริง — เข้ารหัสเป็น JSON string ตรงๆ ให้เขียนลงคอลัมน์
     * lazada_attributes.options (คอลัมน์นี้มีอยู่แล้วในทุก environment ที่เช็ค แต่
     * ไม่เคยมีอะไรในโค้ดเขียนลงไปมาก่อน — ยืนยันรูปร่างจริงแล้วจากข้อมูลที่มีอยู่ก่อน
     * หน้านี้: แต่ละตัวเลือกเป็น `{name, en_name, id}` โดย `id` คือค่าที่ Lazada
     * ต้องการกลับไปตอนส่ง payload จริง ส่วน `name`/`en_name` เป็นแค่ label)
     */
    private function encodeLazadaOptions(array $attr): ?string
    {
        $options = $attr['options'] ?? [];
        if (!is_array($options) || $options === []) {
            return null;
        }

        return json_encode(array_values($options));
    }

    /**
     * แนวคิดเดียวกับ syncLazadaAttributes() ด้านบน แต่ทำแค่หมวดหมู่ Lazada เดียว —
     * เป็น action "Sync attributes" บนหน้า categories/lazada-mapping.tsx ที่อยู่ข้างๆ
     * กับตาราง Categories ของหน้านั้น (ดู
     * ShopeeAttributeMappingController::syncShopeeAttributesForCategory()
     * ที่เป็นแบบเดียวกันฝั่ง Shopee ที่ตัวนี้เลียนแบบมา) รันแบบ synchronous — เรียก
     * /category/attributes/get แค่ครั้งเดียว เหมือนกับแต่ละรอบ loop ต่อหมวดหมู่ด้านบน
     * แค่ไม่ต้องหน่วงเวลากันเรียกถี่เกินหลายหมวดหมู่ เพราะตรงนี้เรียกแค่ครั้งเดียว
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
            'options' => $this->encodeLazadaOptions($attr),
            'created_at' => $now,
            'updated_at' => $now,
        ], $schema);

        if ($rows !== []) {
            LazadaAttribute::upsert($rows, ['name'], ['label', 'input_type', 'attribute_type', 'category_id', 'mandatory', 'options', 'updated_at']);
        }

        LazadaAttribute::bumpListVersion();

        return response()->json(['count' => count($rows)]);
    }

    /**
     * Lazada attribute ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุใน migration ที่บอกว่า
     * คอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่ sync ล่าสุด
     * ของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM attribute ไหนแมปอยู่ (ถ้ามี)
     * เป็นข้อมูลหนุนหลังตารางคอลัมน์ "จับคู่แอตทริบิวต์กับ PIM" บนหน้า
     * categories/lazada-mapping.tsx — ทำงานเหมือนกับ
     * ShopeeAttributeMappingController::shopeeAttributesForCategory() เป๊ะๆ
     * แค่ใช้ `name` เป็น key แทนที่จะเป็น id ตัวเลข (ดูเหตุผลได้ที่ docblock ของ
     * LazadaAttribute)
     */
    public function lazadaAttributesForCategory(int $lazadaCategoryId): JsonResponse
    {
        $query = LazadaAttribute::query();
        if (Schema::hasColumn('lazada_attributes', 'category_id')) {
            $query->where('category_id', $lazadaCategoryId);
        }
        $attributes = $query->orderBy('label')->get();
        $hasMandatory = Schema::hasColumn('lazada_attributes', 'mandatory');

        $mappedByLazadaAttributeName = LazadaAttributeMapping::whereIn('lazada_attribute_name', $attributes->pluck('name'))
            ->with(['attribute:id,name', 'optionMappings'])
            ->get()
            ->keyBy('lazada_attribute_name');

        $data = $attributes->map(function (LazadaAttribute $attribute) use ($mappedByLazadaAttributeName, $hasMandatory) {
            $mapping = $mappedByLazadaAttributeName->get($attribute->name);
            $isSelectType = in_array($attribute->input_type, self::SELECT_INPUT_TYPES, true);

            return [
                'name' => $attribute->name,
                'label' => $attribute->label,
                'input_type' => $attribute->input_type,
                'mandatory' => $hasMandatory ? (bool) $attribute->mandatory : false,
                'mapped' => $mapping ? ['id' => $mapping->attribute->id, 'name' => $mapping->attribute->name] : null,
                // `options` cast เป็น array แล้ว (ดู LazadaAttribute::$casts) —
                // แต่ละตัวเลือกจริงเป็น {name, en_name, id}: id คือค่าที่ต้องส่งกลับ
                // ไป Lazada ตอน push จริง, name คือ label ที่โชว์ให้แอดมินเลือก
                'options' => $isSelectType
                    ? collect($attribute->options ?? [])
                        ->filter(fn ($o) => is_array($o) && isset($o['id']))
                        ->map(fn ($o) => ['value' => (string) $o['id'], 'label' => (string) ($o['name'] ?? $o['id'])])
                        ->values()
                    : [],
                // ใช้ตอนเปิด dialog "จับคู่ตัวเลือก" — ต้องมี mapping หลักอยู่แล้ว
                // (เลือก PIM attribute ให้ Lazada attribute ตัวนี้แล้ว) ถึงจะรู้ว่า
                // จะเขียน option-mapping ใหม่ผูกกับ lazada_attribute_mapping_id ไหน
                'lazada_attribute_mapping_id' => $mapping?->id,
                'option_mappings' => $mapping
                    ? $mapping->optionMappings->map(fn (LazadaAttributeOptionMapping $m) => [
                        'attribute_option_id' => $m->attribute_option_id,
                        'lazada_option_value' => $m->lazada_option_value,
                    ])->values()
                    : [],
            ];
        });

        return response()->json(['data' => $data->values()]);
    }
}
