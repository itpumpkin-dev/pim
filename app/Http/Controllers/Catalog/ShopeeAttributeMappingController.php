<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\ResolvesMarketplaceMasterCategory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\ProductValue;
use App\Models\ShopeeAttribute;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeAttributeOptionMapping;
use App\Models\ShopeeBrand;
use App\Models\ShopeeCategory;
use App\Models\ShopeeCategoryAttribute;
use App\Models\ShopeeSellerAccount;
use App\Services\Catalog\ShopeeAttributeFamilyGenerator;
use App\Services\Catalog\ShopeeMappedAttributeCreator;
use App\Services\Catalog\ShopeeMappingTimelineBuilder;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use App\Services\Shopee\ShopeeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
    // resolveMappedField()/resolveProductImageUrls() ด้านล่าง (ใช้ใน
    // productDetail()'s "ข้อมูลสินค้า (Platform)" tab) — ตัวเดียวกันเป๊ะกับที่
    // ShopeeProductSyncService::buildPayload() ใช้ resolve ค่าจริงตอน push ไม่ใช่
    // เขียน logic ซ้ำเอง กันไม่ให้ preview กับของจริงเพี้ยนไปคนละทาง — mirror ของ
    // LazadaAttributeMappingController
    use ResolvesProductAttributeValues;

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

        // "N/M attr แมปแล้ว" ต่อหมวดหมู่ — มาจาก shopee_category_attributes
        // เสมอตอนนี้ (ไม่ใช่ shopee_attributes.category_id ที่ deprecated แล้ว
        // ดู ShopeeCategoryAttribute's docblock) แต่ละหมวดหมู่มีชุด attribute
        // เป็นของตัวเองจริงๆ ไม่ทับกันข้ามหมวดหมู่อีกต่อไป
        $catAttrGroup = ShopeeCategoryAttribute::get(['category_id', 'shopee_attribute_id'])->groupBy('category_id');
        foreach ($catAttrGroup as $spCatId => $attrs) {
            $totalAttr = $attrs->count();
            $mappedCount = $attrs->filter(fn ($a) => in_array($a->shopee_attribute_id, $mappedAttrIds, true))->count();
            $shopeeCategoryStats[$spCatId] = [
                'total' => $totalAttr,
                'mapped' => $mappedCount,
            ];
        }

        // สถานะ "sync ไป Shopee แล้วหรือยัง" ต่อสินค้า — คนละเรื่องกับ
        // category_mapped/attribute_stats ด้านบน (นั่นคือ "ตั้งค่า mapping
        // ไว้ครบหรือยัง" ส่วนนี้คือ "เคย push แล้วยืนยันว่า live จริงบน Shopee
        // หรือยัง") อ่านจาก product_platform_shops.status ตัวเดียวกับที่
        // Sales Channels panel ของหน้า Edit Product ใช้โชว์ badge "Live"
        // (เขียนโดย ShopeeProductSyncService::checkLiveStatus() ตอนเปิด
        // dialog Push/Deactivate หรือ syncLiveStatus() แบบ bulk) — ไม่ได้
        // เขียนโดย push() เอง เลยอาจไม่ทันสมัยเป๊ะๆ ถ้ายังไม่มีใครเปิด dialog
        // เช็คสถานะของสินค้านั้นเลยหลัง push ล่าสุด — mirror ของ
        // LazadaAttributeMappingController::lazadaProducts() เป๊ะ
        $shopeeShopSyncByProduct = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('sales_platforms.code', 'shopee')
            ->where('product_platform_shops.status', 'live')
            ->whereIn('product_platform_shops.product_id', $pageProductIds)
            ->orderBy('sales_platform_shops.name')
            ->get([
                'product_platform_shops.product_id',
                'sales_platform_shops.name as shop_name',
                'product_platform_shops.last_synced_at',
            ])
            ->groupBy('product_id');

        $rows = $paginated->getCollection()->map(function (Product $product) use ($pnames, $pimCategoryPathOf, $allShopeeCategories, $shopeeCategoryPathOf, $shopeeCategoryStats, $allPimCategories, $shopeeShopSyncByProduct) {
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
                'shopee_sync' => [
                    'synced' => $shopeeShopSyncByProduct->has($product->id),
                    'shops' => $shopeeShopSyncByProduct->get($product->id, collect())
                        ->map(fn ($row) => ['name' => $row->shop_name, 'last_synced_at' => $row->last_synced_at])
                        ->values()->all(),
                ],
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
     * รายละเอียดของสินค้าหนึ่งตัวสำหรับ sidebar ด้านขวาของหน้ารายการสินค้า
     * (shopee-products.tsx) — เบากว่า shopeeProducts() ด้านบนมาก เพราะดึงแค่
     * สินค้าเดียวตอนผู้ใช้กด arrow เปิดดู ไม่ต้อง preload ทั้งหน้า — mirror ของ
     * LazadaAttributeMappingController::productDetail() เป๊ะ ต่างกันแค่จุดที่
     * schema ของ Shopee ต่างจาก Lazada จริงๆ:
     *
     *  - Shopee ยืนยันตัวตน attribute ด้วย `shopee_attribute_id` ตัวเลข ไม่ใช่
     *    ชื่อ string — ดึงชุด attribute ของหมวดหมู่ผ่าน ShopeeCategoryAttribute
     *    เหมือนที่ shopeeAttributesForCategory() ทำ
     *  - ไม่ต้องมี $skipRawNames เหมือนของ Lazada เลย เพราะ schema ของ Shopee
     *    ที่ sync มาจาก get_attribute_tree (shopee_attributes/
     *    shopee_category_attributes) เป็นคนละชุดข้อมูลกับฟิลด์ payload ตายตัว
     *    (name/price/qty/weight/length/width/height/description/video) โดย
     *    สิ้นเชิง — ไม่มี raw name ซ้อนทับกันแบบ "package_weight" ของ Lazada
     *    ที่ต้องกรองออกจากรายการ custom attribute
     *  - แบรนด์ไม่ได้เป็นส่วนหนึ่งของ schema นี้เลย (คนละ API กัน — ดู
     *    resolveBrandDisplayValue() ด้านล่าง) เลยโชว์เป็นแถวแยกต่างหากเสมอ
     *    (ไม่ได้ผสมอยู่ในลูป custom attribute แบบที่ Lazada ทำกับ 'brand')
     */
    public function productDetail(Product $product): JsonResponse
    {
        $product->load(['variants:id,parent_id']);

        $shopeeCategoryId = $product->shopee_category_id
            ?: $product->categories()->whereNotNull('shopee_category_id')->value('shopee_category_id');

        $nameAttrId = Attribute::idForCode('pname');
        $activeLocaleId = Locale::idForCode(app()->getLocale());
        $pname = null;
        if ($nameAttrId) {
            $pname = ProductValue::where('product_id', $product->id)
                ->where('attribute_id', $nameAttrId)
                ->whereNull('channel_id')
                ->where(function ($q) use ($activeLocaleId) {
                    $q->where('locale_id', $activeLocaleId)->orWhereNull('locale_id');
                })
                ->orderByRaw('locale_id IS NULL') // ตัวที่ตรง locale ปัจจุบันมาก่อน ตัว global (locale_id null) เป็น fallback
                ->value('value');
        }

        $mappings = ShopeeAttributeMapping::with('attribute')->get();

        $attributeRows = [];

        $nameMapping = $mappings->first(fn ($m) => $m->target_field === 'name' && $m->attribute);
        $resolvedName = $nameMapping ? $this->resolveAttributeDisplayValue($product, $nameMapping->attribute, $activeLocaleId) : $pname;
        $attributeRows[] = [
            'label' => 'ชื่อสินค้า',
            'mandatory' => true,
            'value' => $resolvedName,
        ];

        // แบรนด์ของ Shopee ไม่ได้มาจาก get_attribute_tree เลย (คนละ API กัน —
        // get_brand_list) จึงไม่มีอยู่ใน shopee_attributes/
        // shopee_category_attributes ให้ลูปเจอแบบ custom attribute ตัวอื่นๆ
        // ด้านล่าง — และไม่มีแนวคิด "บังคับเฉพาะบางหมวดหมู่" แบบ field อื่น
        // เพราะ ShopeeProductSyncService::resolveShopeeBrandId() throw ทุกครั้ง
        // ที่ push โดยไม่มีแบรนด์ resolve ได้ ไม่ว่าหมวดหมู่ไหน — เลยโชว์เป็น
        // แถวแยกตายตัวเสมอ mandatory=true
        $attributeRows[] = [
            'label' => 'แบรนด์ (Brand)',
            'mandatory' => true,
            'value' => $this->resolveBrandDisplayValue($product),
        ];

        if ($shopeeCategoryId) {
            // "attribute ไหนอยู่ในหมวดหมู่นี้บ้าง + บังคับหรือเปล่า" มาจาก
            // shopee_category_attributes เสมอตอนนี้ — ดู ShopeeCategoryAttribute's
            // docblock (แก้บั๊ก attribute_id เดียวกันในหลายหมวดหมู่ทับ category_id/
            // mandatory กันเองที่เคยเจอ)
            $mandatoryById = ShopeeCategoryAttribute::where('category_id', $shopeeCategoryId)
                ->pluck('mandatory', 'shopee_attribute_id');

            $shopeeAttrs = ShopeeAttribute::whereIn('id', $mandatoryById->keys())
                ->orderBy('name')
                ->get();

            foreach ($shopeeAttrs as $spAttr) {
                $mapping = $mappings->first(fn ($m) => $m->target_field === 'shopee_attribute' && $m->shopee_attribute_id === $spAttr->id);
                $value = $mapping ? $this->resolveAttributeDisplayValue($product, $mapping->attribute, $activeLocaleId) : null;

                $attributeRows[] = [
                    'label' => $spAttr->name,
                    'mandatory' => (bool) ($mandatoryById[$spAttr->id] ?? false),
                    'value' => $value,
                ];
            }
        }

        $syncHistory = ProductMarketplaceSyncJob::where('product_id', $product->id)
            ->where('platform', 'shopee')
            ->with('shop:id,name')
            ->orderByDesc('id')
            ->limit(20)
            ->get()
            ->map(fn ($job) => [
                'action' => $job->action,
                'status' => $job->status,
                'message' => $job->message,
                'shop_name' => $job->shop->name ?? null,
                'created_at' => $job->created_at,
            ]);

        $publishedShopeeShops = $product->platformShops()
            ->whereHas('platform', fn ($q) => $q->where('code', 'shopee'))
            ->get(['sales_platform_shops.id', 'sales_platform_shops.name', 'sales_platform_shops.channel_id']);

        // "ข้อมูลสินค้า (Platform)" tab — ต่างจาก $attributeRows ด้านบน (custom
        // category attribute เฉพาะหมวดหมู่นี้ + แบรนด์) ตรงที่กลุ่มนี้คือฟิลด์ตายตัว
        // ที่ Shopee ทุกหมวดหมู่ต้องมี (ราคา/สต็อก/น้ำหนัก-ขนาด/รูปภาพ/วิดีโอ) — ใช้
        // resolveMappedField()/resolveProductImageUrls() จาก
        // ResolvesProductAttributeValues trait ตัวเดียวกับที่
        // ShopeeProductSyncService::buildPayload() ใช้จริงตอน push (ไม่เขียน
        // logic รีโซลฟ์ค่าซ้ำเอง) — ต่างจาก buildPayload() ตรงที่ตัวนี้ไม่เรียก
        // resolveAttributes()/enabledLogisticsChannelIds() (ซึ่งยิง live API ไป
        // Shopee) เลย ไม่งั้นทุกครั้งที่เปิด tab นี้จะยิง API จริงโดยไม่จำเป็น แค่
        // ต้องการพรีวิวจากข้อมูลที่มีอยู่ในเครื่องเท่านั้น
        //
        // ใช้ channel ของร้านที่ published อยู่ตัวเดียว (ถ้ามีพอดี 1 ร้าน) เพื่อให้
        // ราคา/ค่าที่ผูกกับ channel ตรงกับร้านนั้นจริงๆ — ถ้าไม่มีหรือมีหลายร้าน
        // fallback เป็น channel เริ่มต้น (null = ค่า Default/All Channels)
        $channelId = $publishedShopeeShops->count() === 1 ? $publishedShopeeShops->first()->channel_id : null;

        // buildPayload() ตั้ง description ให้ fallback เป็น $name ตายตัวถ้ายังไม่ได้
        // map (ดู ShopeeProductSyncService::buildPayload() บรรทัดที่ resolve
        // $description) — mirror เงื่อนไขเดียวกันตรงนี้เพื่อให้ preview ตรงกับของจริง
        $resolvedDescription = $this->resolveMappedField($mappings, 'description', $product, $channelId, localeCode: 'th') ?: $resolvedName;

        $platformFields = [
            ['label' => 'Seller SKU (Item SKU)', 'value' => $product->sku],
            ['label' => 'รายละเอียดสินค้า (Description)', 'value' => $resolvedDescription],
            ['label' => 'ราคา (Price)', 'value' => $this->resolveMappedField($mappings, 'price', $product, $channelId)],
            ['label' => 'จำนวนคงเหลือ (Stock)', 'value' => $this->resolveMappedField($mappings, 'qty', $product, $channelId)],
            ['label' => 'น้ำหนักบรรจุภัณฑ์ (kg)', 'value' => $this->resolveMappedField($mappings, 'weight', $product, $channelId)],
            ['label' => 'ความยาวบรรจุภัณฑ์ (cm)', 'value' => $this->resolveMappedField($mappings, 'length', $product, $channelId)],
            ['label' => 'ความกว้างบรรจุภัณฑ์ (cm)', 'value' => $this->resolveMappedField($mappings, 'width', $product, $channelId)],
            ['label' => 'ความสูงบรรจุภัณฑ์ (cm)', 'value' => $this->resolveMappedField($mappings, 'height', $product, $channelId)],
            // ไม่บังคับ (ไม่มีสินค้าไหนต้องมีวิดีโอ) — โชว์ไว้เผื่อ debug ว่าทำไม
            // ไม่มีวิดีโอขึ้นจริงบน listing ทั้งที่คิดว่า map ไว้แล้ว
            ['label' => 'วิดีโอสินค้า (Video)', 'value' => $this->resolveMappedField($mappings, 'video', $product, $channelId)],
        ];

        $platformImages = $this->resolveProductImageUrls($product, $channelId);

        return response()->json([
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => $pname ?: $product->sku,
            'variants_count' => $product->variants->count(),
            'enabled' => $product->enabled,
            'shopee_category_path' => $this->shopeeCategoryPathFor($shopeeCategoryId),
            'attributes' => $attributeRows,
            'platform_fields' => $platformFields,
            'platform_images' => $platformImages,
            'sync_history' => $syncHistory,
            'published_shopee_shops' => $publishedShopeeShops,
        ]);
    }

    /**
     * ค่า display ของ attribute หนึ่งตัวสำหรับสินค้าหนึ่งชิ้น ใช้โดย
     * productDetail() ด้านบนเท่านั้น — mirror ของ
     * LazadaAttributeMappingController::resolveAttributeDisplayValue() เป๊ะ
     * (ตัวนี้ generic ทั่วไปอยู่แล้ว ไม่มีอะไรเฉพาะ Lazada เลยจริงๆ — resolve
     * select/multiselect option code กลับเป็น label ที่คนอ่านได้ เพื่อโชว์ใน
     * sidebar แทนที่จะปล่อยเป็น code ดิบไว้แบบที่ AttributeValueFormatter ทำ)
     *
     * ถ้า $attribute เป็นหนึ่งใน configurable_attributes ของสินค้า (คือเป็น
     * แกน variant เช่น Size/Color) ค่าของ "ตัวแม่" เองมักจะว่างเปล่า (ค่าจริง
     * อยู่ที่ variant ลูกแต่ละตัวแยกกัน) เลย aggregate ค่าที่ต่างกันของ
     * variant ทุกตัวมารวมเป็นชุดแทน (เช่น "S, M, L, XL, XXL")
     */
    private function resolveAttributeDisplayValue(Product $product, ?Attribute $attribute, ?int $activeLocaleId): ?string
    {
        if (! $attribute) {
            return null;
        }

        $localeId = $attribute->is_locale_based ? $activeLocaleId : null;
        $scopeToLocale = function ($query) use ($localeId) {
            return $query->where(function ($q) use ($localeId) {
                $q->where('locale_id', $localeId)->orWhereNull('locale_id');
            })->orderByRaw('locale_id IS NULL'); // ตรง locale ปัจจุบันก่อน ตัว global (locale_id null) เป็น fallback
        };

        $isVariantDefining = in_array($attribute->id, $product->configurable_attributes ?? [], true);

        if ($isVariantDefining && $product->variants->isNotEmpty()) {
            $codes = $product->variants->map(function ($variant) use ($attribute, $scopeToLocale) {
                return $scopeToLocale(
                    ProductValue::where('product_id', $variant->id)
                        ->where('attribute_id', $attribute->id)
                        ->whereNull('channel_id')
                )->value('value');
            });
        } else {
            $own = $scopeToLocale(
                ProductValue::where('product_id', $product->id)
                    ->where('attribute_id', $attribute->id)
                    ->whereNull('channel_id')
            )->value('value');
            $codes = collect($own !== null && $own !== '' ? [$own] : []);
        }

        $codes = $codes->filter(fn ($c) => $c !== null && $c !== '')->unique()->values();
        if ($codes->isEmpty()) {
            return null;
        }

        if (in_array($attribute->type, ['select', 'multiselect'], true)) {
            $labelByCode = AttributeOption::where('attribute_id', $attribute->id)
                ->whereIn('code', $codes)
                ->get()
                ->keyBy('code');

            return $codes->map(fn ($code) => $labelByCode->get($code)?->admin_label ?? $code)->implode(', ');
        }

        return $codes->implode(', ');
    }

    /**
     * ชื่อแบรนด์ที่จะส่งไป Shopee จริง — mirror ลำดับความสำคัญเดียวกับ
     * ShopeeProductSyncService::resolveShopeeBrandId() เป๊ะๆ:
     *
     *   1. override เฉพาะสินค้า (products.shopee_brand_id) ถ้ามี
     *   2. ไม่งั้นดูค่า attribute `pbrand` ของสินค้า → Brand.shopee_brand_id
     *      ("Master Brand" ผ่าน mappedBrandOptionId() ใน
     *      ResolvesProductAttributeValues trait)
     *
     * ต่างจาก Lazada ตรงที่ไม่มี fallback ที่สามไปทาง generic mapping เลย —
     * Shopee ไม่มีแนวคิด "แมป PIM attribute เข้ากับ Shopee attribute ชื่อ
     * brand" แบบ Lazada (brand ไม่ได้เป็นส่วนหนึ่งของ shopee_attributes schema
     * เลย คนละ API กัน — ดู get_brand_list vs. get_attribute_tree)
     */
    private function resolveBrandDisplayValue(Product $product): ?string
    {
        $shopeeBrandId = $product->shopee_brand_id ?: $this->mappedBrandOptionId($product, 'shopee_brand_id');

        return $shopeeBrandId ? ShopeeBrand::find($shopeeBrandId)?->name : null;
    }

    /**
     * เดินขึ้นสายพ่อแม่ของ ShopeeCategory ทีละชั้นจนถึงราก — เรียกครั้งเดียวต่อ
     * request นี้ (สินค้าเดียว) เลยไม่ต้อง preload ทั้งต้นไม้เหมือน
     * shopeeProducts()'s $shopeeCategoryPathOf closure ด้านบน — mirror ของ
     * LazadaAttributeMappingController::lazadaCategoryPathFor() เป๊ะ
     */
    private function shopeeCategoryPathFor(?int $categoryId): ?string
    {
        if (! $categoryId) {
            return null;
        }

        $names = [];
        $id = $categoryId;
        while ($id) {
            $cat = ShopeeCategory::find($id, ['id', 'parent_id', 'name']);
            if (! $cat) {
                break;
            }
            array_unshift($names, $cat->name);
            $id = $cat->parent_id;
        }

        return $names ? implode(' > ', $names) : null;
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
        // (category_id, attribute_id) => is_mandatory — เก็บแยกจาก $rowsById
        // ด้านบน (ซึ่งจงใจ dedupe ข้ามหมวดหมู่ เพราะ name/input_type/options
        // เสถียรพอจะ key ด้วย attribute_id เฉยๆ) เพราะ mandatory ต่างจากนั้น —
        // เปลี่ยนไปตามหมวดหมู่จริง เก็บรวมแถวเดียวแบบ $rowsById ไม่ได้ ไม่งั้นจะ
        // เจอบั๊กเดิมที่ shopee_attributes.category_id/.mandatory เคยเป็น (ดู
        // ShopeeCategoryAttribute's docblock)
        $categoryAttrRows = [];

        foreach (array_chunk($categoryIds, 20) as $chunk) {
            $response = $client->getAttributeTree($chunk);
            $list = $response['response']['list'] ?? [];

            foreach ($list as $categoryResult) {
                // get_attribute_tree's documented response nests each
                // requested category's schema under `category_id` alongside
                // its `attribute_tree` — NOT independently confirmed live
                // for this *bulk* (multi-category) call the way the
                // single-category path in syncShopeeAttributesForCategory()
                // below is (only response.response.list[0] was exercised
                // against a real account there).
                //
                // Found via code review: this used to fall back to
                // positional matching against $chunk (assuming Shopee always
                // returns entries in request order) when `category_id` was
                // missing from a response entry. That's the exact bug this
                // whole table exists to avoid — a wrong guess here would
                // silently attribute one category's mandatory/attribute data
                // to a *different* category, corrupting it in a way nobody
                // would notice. `null` here instead just leaves that one
                // category's attributes under-synced for shopee_category_
                // attributes (safe — re-running the sync fixes it), while
                // still populating the global name/input_type/options cache
                // below regardless (that part isn't category-specific, so
                // there's nothing to misattribute).
                $categoryId = isset($categoryResult['category_id']) ? (int) $categoryResult['category_id'] : null;

                foreach ($categoryResult['attribute_tree'] ?? [] as $attr) {
                    $rowsById[$attr['attribute_id']] = [
                        'id' => $attr['attribute_id'],
                        'name' => $attr['name'],
                        'input_type' => $attr['attribute_info']['input_type'] ?? null,
                        'options' => $this->encodeShopeeOptions($attr),
                    ];

                    if ($categoryId) {
                        $categoryAttrRows[] = [
                            'category_id' => $categoryId,
                            'shopee_attribute_id' => $attr['attribute_id'],
                            'mandatory' => (bool) ($attr['mandatory'] ?? false),
                        ];
                    }
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

        foreach (array_chunk($categoryAttrRows, 500) as $chunk) {
            ShopeeCategoryAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['category_id', 'shopee_attribute_id'],
                ['mandatory', 'updated_at']
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
            'options' => $this->encodeShopeeOptions($attr),
            'created_at' => $now,
            'updated_at' => $now,
        ], $tree);

        // แยกเขียนคนละตาราง: name/input_type/options ยังคงไป shopee_attributes
        // เหมือนเดิม (เสถียรพอจะ dedupe ข้ามหมวดหมู่ได้จริง) ส่วน mandatory
        // ซึ่งเปลี่ยนไปตามหมวดหมู่ ไปที่ shopee_category_attributes แทน —
        // ไม่ใช้แถวเดียวกันซ้อนกันแบบเดิมอีกต่อไป (บั๊กที่แก้ไปแล้ว ดู
        // ShopeeCategoryAttribute's docblock)
        if ($rows !== []) {
            ShopeeAttribute::upsert($rows, ['id'], ['name', 'input_type', 'options', 'updated_at']);

            $categoryAttrRows = array_map(fn (array $attr) => [
                'category_id' => $categoryId,
                'shopee_attribute_id' => $attr['attribute_id'],
                'mandatory' => (bool) ($attr['mandatory'] ?? false),
                'created_at' => $now,
                'updated_at' => $now,
            ], $tree);
            ShopeeCategoryAttribute::upsert($categoryAttrRows, ['category_id', 'shopee_attribute_id'], ['mandatory', 'updated_at']);
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
        // "attribute ไหนอยู่ในหมวดหมู่นี้บ้าง + บังคับหรือเปล่า" มาจาก
        // shopee_category_attributes เสมอตอนนี้ (ไม่ใช่ shopee_attributes.
        // category_id/.mandatory ที่ deprecated แล้ว — ดู ShopeeCategoryAttribute
        // กับ ShopeeAttribute's docblock) ส่วน name/input_type/options ยังมาจาก
        // shopee_attributes เหมือนเดิม (ข้อมูลที่เสถียรพอจะ key ด้วย attribute_id เฉยๆ)
        $mandatoryById = ShopeeCategoryAttribute::where('category_id', $shopeeCategoryId)
            ->pluck('mandatory', 'shopee_attribute_id');

        $attributes = ShopeeAttribute::whereIn('id', $mandatoryById->keys())->orderBy('name')->get();

        $mappedByShopeeAttributeId = ShopeeAttributeMapping::whereIn('shopee_attribute_id', $attributes->pluck('id'))
            ->with(['attribute:id,name', 'optionMappings'])
            ->get()
            ->keyBy('shopee_attribute_id');

        $data = $attributes->map(function (ShopeeAttribute $attribute) use ($mappedByShopeeAttributeId, $mandatoryById) {
            $mapping = $mappedByShopeeAttributeId->get($attribute->id);
            $isSelectType = in_array($attribute->input_type, self::SELECT_INPUT_TYPES, true);

            return [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'input_type' => $attribute->input_type,
                'mandatory' => (bool) ($mandatoryById[$attribute->id] ?? false),
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
