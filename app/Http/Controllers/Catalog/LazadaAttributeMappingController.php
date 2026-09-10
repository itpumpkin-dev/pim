<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\ResolvesMarketplaceMasterCategory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\Category;
use App\Models\LazadaAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaAttributeOptionMapping;
use App\Models\LazadaBrand;
use App\Models\LazadaCategory;
use App\Models\LazadaCategoryAttribute;
use App\Models\LazadaSellerAccount;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\ProductValue;
use App\Services\Catalog\LazadaAttributeFamilyGenerator;
use App\Services\Catalog\LazadaMappedAttributeCreator;
use App\Services\Catalog\LazadaMappingTimelineBuilder;
use App\Services\Lazada\LazadaClient;
use App\Services\Marketplace\ResolvesProductAttributeValues;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
    use ResolvesMarketplaceMasterCategory;
    // resolveMappedField()/resolveProductImageUrls() ด้านล่าง (ใช้ใน
    // productDetail()'s "ข้อมูลสินค้า (Platform)" tab) — ตัวเดียวกันเป๊ะกับที่
    // LazadaProductSyncService::buildPayload() ใช้ resolve ค่าจริงตอน push ไม่ใช่
    // เขียน logic ซ้ำเอง กันไม่ให้ preview กับของจริงเพี้ยนไปคนละทางกัน
    use ResolvesProductAttributeValues;

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

        $mappedAttrNames = LazadaAttributeMapping::whereNotNull('lazada_attribute_name')->pluck('lazada_attribute_name')->unique()->all();
        $lazadaCategoryStats = [];

        // "N/M attr แมปแล้ว" ต่อหมวดหมู่ — มาจาก lazada_category_attributes
        // เสมอตอนนี้ (ไม่ใช่ lazada_attributes.category_id ที่ deprecated แล้ว
        // ดู LazadaCategoryAttribute's docblock) แต่ละหมวดหมู่มีชุด field เป็น
        // ของตัวเองจริงๆ ไม่ทับกันข้ามหมวดหมู่อีกต่อไป
        $catAttrGroup = LazadaCategoryAttribute::get(['category_id', 'lazada_attribute_name'])->groupBy('category_id');
        foreach ($catAttrGroup as $lzCatId => $attrs) {
            $totalAttr = $attrs->count();
            $mappedCount = $attrs->filter(fn ($a) => in_array($a->lazada_attribute_name, $mappedAttrNames, true))->count();
            $lazadaCategoryStats[$lzCatId] = [
                'total' => $totalAttr,
                'mapped' => $mappedCount,
            ];
        }

        // สถานะ "sync ไป Lazada แล้วหรือยัง" ต่อสินค้า — คนละเรื่องกับ
        // category_mapped/attribute_stats ด้านบน (นั่นคือ "ตั้งค่า mapping
        // ไว้ครบหรือยัง" ส่วนนี้คือ "เคย push แล้วยืนยันว่า live จริงบน Lazada
        // หรือยัง") อ่านจาก product_platform_shops.status ตัวเดียวกับที่
        // Sales Channels panel ของหน้า Edit Product ใช้โชว์ badge "Live"
        // (เขียนโดย LazadaProductSyncService::checkLiveStatus() ตอนเปิด
        // dialog Push/Deactivate หรือ syncLiveStatus() แบบ bulk) — ไม่ได้
        // เขียนโดย push() เอง (ดูคอมเมนต์ที่ push()) เลยอาจไม่ทันสมัยเป๊ะๆ
        // ถ้ายังไม่มีใครเปิด dialog เช็คสถานะของสินค้านั้นเลยหลัง push ล่าสุด
        $lazadaShopSyncByProduct = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('sales_platforms.code', 'lazada')
            ->where('product_platform_shops.status', 'live')
            ->whereIn('product_platform_shops.product_id', $pageProductIds)
            ->orderBy('sales_platform_shops.name')
            ->get([
                'product_platform_shops.product_id',
                'sales_platform_shops.name as shop_name',
                'product_platform_shops.last_synced_at',
            ])
            ->groupBy('product_id');

        $rows = $paginated->getCollection()->map(function (Product $product) use ($pnames, $pimCategoryPathOf, $allLazadaCategories, $lazadaCategoryPathOf, $lazadaCategoryStats, $allPimCategories, $lazadaShopSyncByProduct) {
            $masterCat = $this->resolveMasterCategory($product, $allPimCategories, 'lazada_category_id');

            // $masterCat คือหมวดหมู่ที่ "ลึกที่สุด" สำหรับแสดงผล (path เต็ม) —
            // ตัวที่ผูก lazada_category_id ไว้จริงอาจเป็นหมวดแม่ของมันแทนก็ได้
            // (เช่น ผู้ใช้แมป Category ไว้ที่ root ไม่ใช่ product group) เลยต้อง
            // ไล่หาในทุกหมวดหมู่ของสินค้า ไม่ใช่แค่ $masterCat ตัวเดียว ไม่งั้น
            // จะเห็น "ยังไม่ได้ map" ผิดๆ ทั้งที่แมปไว้จริงแล้วที่หมวดแม่
            $mappedCategory = $this->resolveMappedCategory($product, $allPimCategories, 'lazada_category_id') ?? $masterCat;

            $lazadaCatId = $product->lazada_category_id ?? ($mappedCategory?->lazada_category_id);
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
                'lazada_sync' => [
                    'synced' => $lazadaShopSyncByProduct->has($product->id),
                    'shops' => $lazadaShopSyncByProduct->get($product->id, collect())
                        ->map(fn ($row) => ['name' => $row->shop_name, 'last_synced_at' => $row->last_synced_at])
                        ->values()->all(),
                ],
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

    /**
     * รายละเอียดของสินค้าหนึ่งตัวสำหรับ sidebar ด้านขวาของหน้ารายการสินค้า
     * (lazada-products.tsx) — เบากว่า lazadaProducts() ด้านบนมาก เพราะดึงแค่
     * สินค้าเดียวตอนผู้ใช้กด arrow เปิดดู ไม่ต้อง preload ทั้งหน้า
     *
     * โชว์เฉพาะฟิลด์ "name" กับ custom category attribute ทุกตัว (ไม่ว่าจะ
     * บังคับหรือไม่) — ข้าม price/qty/weight/dimensions/SellerSku ออกไปตาม
     * requirement (ราคา/สต็อกดูที่หน้า Edit Product แทน) รายชื่อ raw name ที่
     * ข้ามนี้คือฟิลด์ที่มาจาก target_field ตายตัว (name/price/qty/weight/
     * length/width/height) ไม่ใช่ `lazada_attribute` ทั่วไป — ตรงกับที่
     * ProductController::lazadaMandatoryAttributeIds() ใช้แยกสองกลุ่มนี้เช่นกัน
     */
    public function productDetail(Product $product): JsonResponse
    {
        $product->load(['variants:id,parent_id']);

        $lazadaCategoryId = $product->lazada_category_id
            ?: $product->categories()->whereNotNull('lazada_category_id')->value('lazada_category_id');

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

        $mappings = LazadaAttributeMapping::with('attribute')->get();

        $attributeRows = [];

        $nameMapping = $mappings->first(fn ($m) => $m->target_field === 'name' && $m->attribute);
        $resolvedName = $nameMapping ? $this->resolveAttributeDisplayValue($product, $nameMapping->attribute, $activeLocaleId) : $pname;
        $attributeRows[] = [
            'label' => 'ชื่อสินค้า',
            'mandatory' => true,
            'value' => $resolvedName,
        ];

        // ฟิลด์ที่มี target_field ตายตัวอยู่แล้ว (ไม่ใช่ custom category
        // attribute) — ไม่โชว์ในลิสต์นี้ (price/stock ไม่ต้องเอามาแสดงตามที่
        // ขอ ส่วน SellerSku ก็ไม่ใช่ PIM attribute ให้โชว์ค่าอยู่แล้ว)
        $skipRawNames = ['SellerSku', 'price', 'qty', 'quantity', 'package_weight', 'package_length', 'package_width', 'package_height'];

        if ($lazadaCategoryId) {
            // "field ไหนอยู่ในหมวดหมู่นี้บ้าง + บังคับหรือเปล่า" มาจาก
            // lazada_category_attributes เสมอตอนนี้ — ดู LazadaCategoryAttribute's
            // docblock (แก้บั๊ก field ชื่อเดียวกันในหลายหมวดหมู่ทับ category_id/
            // mandatory กันเองที่เคยเจอ)
            $mandatoryByName = LazadaCategoryAttribute::where('category_id', $lazadaCategoryId)
                ->whereNotIn('lazada_attribute_name', $skipRawNames)
                ->pluck('mandatory', 'lazada_attribute_name');

            $lazadaAttrs = LazadaAttribute::whereIn('name', $mandatoryByName->keys())
                ->orderBy('name')
                ->get();

            foreach ($lazadaAttrs as $lzAttr) {
                if ($lzAttr->name === 'brand') {
                    // 'brand' ตอน push จริงไม่ได้ผ่าน LazadaAttributeMapping
                    // ธรรมดา — buildPayload() ให้ "Master Brand" (lazada_brand_id)
                    // ชนะก่อนเสมอ ถ้ามี ค่อย fallback ไปทาง mapping ทั่วไป (ดู
                    // resolveBrandDisplayValue() ด้านล่าง ซึ่ง mirror ลำดับ
                    // เดียวกับ LazadaProductSyncService::resolveLazadaBrandId())
                    $value = $this->resolveBrandDisplayValue($product);
                } else {
                    $mapping = $mappings->first(fn ($m) => $m->target_field === 'lazada_attribute' && $m->lazada_attribute_name === $lzAttr->name);
                    $value = $mapping ? $this->resolveAttributeDisplayValue($product, $mapping->attribute, $activeLocaleId) : null;
                }

                $attributeRows[] = [
                    'label' => $lzAttr->label ?: $lzAttr->name,
                    'mandatory' => (bool) ($mandatoryByName[$lzAttr->name] ?? false),
                    'value' => $value,
                ];
            }
        }

        $syncHistory = ProductMarketplaceSyncJob::where('product_id', $product->id)
            ->where('platform', 'lazada')
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

        $publishedLazadaShops = $product->platformShops()
            ->whereHas('platform', fn ($q) => $q->where('code', 'lazada'))
            ->get(['sales_platform_shops.id', 'sales_platform_shops.name', 'sales_platform_shops.channel_id']);

        // "ข้อมูลสินค้า (Platform)" tab — ต่างจาก $attributeRows ด้านบน (custom
        // category attribute เฉพาะหมวดหมู่นี้) ตรงที่กลุ่มนี้คือฟิลด์ตายตัวที่
        // Lazada ทุกหมวดหมู่ต้องมี (ราคา/สต็อก/น้ำหนัก-ขนาด/รูปภาพ) — พวกนี้คือสิ่ง
        // ที่หน้า listing จริงบน Lazada เอาไปแสดงให้ลูกค้าเห็น ใช้
        // resolveMappedField()/resolveProductImageUrls() จาก
        // ResolvesProductAttributeValues trait ตัวเดียวกับที่
        // LazadaProductSyncService::buildPayload() ใช้จริงตอน push (ไม่เขียน
        // logic รีโซลฟ์ค่าซ้ำเอง) — ต่างจาก buildPayload() ตรงที่ตัวนี้ไม่เรียก
        // assertMandatoryFieldsPresent() (ซึ่งยิง live API ไป Lazada) เลย ไม่งั้น
        // ทุกครั้งที่เปิด tab นี้จะยิง API จริงโดยไม่จำเป็น แค่ต้องการพรีวิวจากข้อมูล
        // ที่มีอยู่ในเครื่องเท่านั้น
        //
        // ใช้ channel ของร้านที่ published อยู่ตัวเดียว (ถ้ามีพอดี 1 ร้าน) เพื่อให้
        // ราคา/ค่าที่ผูกกับ channel ตรงกับร้านนั้นจริงๆ — ถ้าไม่มีหรือมีหลายร้าน
        // fallback เป็น channel เริ่มต้น (null = ค่า Default/All Channels)
        $channelId = $publishedLazadaShops->count() === 1 ? $publishedLazadaShops->first()->channel_id : null;

        $platformFields = [
            ['label' => 'Seller SKU', 'value' => $product->sku],
            // buildPayload() ตั้ง short_description ให้เท่ากับ name ตายตัวเสมอ
            // (ไม่มี target_field แยกให้ map เอง) — ไม่ใช่ค่าจริงจาก PIM attribute
            // ไหนต่างหาก แค่ mirror ชื่อสินค้าไปอีกฟิลด์หนึ่งของ Lazada
            ['label' => 'รายละเอียดสั้น (Short Description)', 'value' => $resolvedName],
            ['label' => 'ราคา (Price)', 'value' => $this->resolveMappedField($mappings, 'price', $product, $channelId)],
            ['label' => 'จำนวนคงเหลือ (Qty)', 'value' => $this->resolveMappedField($mappings, 'qty', $product, $channelId)],
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
            'lazada_category_path' => $this->lazadaCategoryPathFor($lazadaCategoryId),
            'attributes' => $attributeRows,
            'platform_fields' => $platformFields,
            'platform_images' => $platformImages,
            'sync_history' => $syncHistory,
            'published_lazada_shops' => $publishedLazadaShops,
        ]);
    }

    /**
     * ค่า display ของ attribute หนึ่งตัวสำหรับสินค้าหนึ่งชิ้น ใช้โดย
     * productDetail() ด้านบนเท่านั้น — ต่างจาก ResolvesProductAttributeValues
     * trait (ที่ sync service ใช้ตอน build payload จริง) ตรงที่ตัวนี้ resolve
     * select/multiselect option code กลับเป็น label ที่คนอ่านได้ (เพื่อโชว์ใน
     * sidebar) แทนที่จะปล่อยเป็น code ดิบไว้แบบที่ AttributeValueFormatter ทำ
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

        // Attribute แบบ locale-based (เช่น pname) เก็บค่าไว้แยกแถวต่อ locale —
        // ต้องขอ locale ปัจจุบันโดยเฉพาะ ไม่งั้น whereNull('locale_id') เพียว
        // ด้านล่างจะหาไม่เจอเลย ทั้งที่ค่าจริงมีอยู่ (บั๊กที่เจอจากการทดสอบจริง:
        // ชื่อสินค้าที่ map ผ่าน target_field='name' ขึ้น "ยังไม่ได้กรอก" ทั้งที่
        // สินค้ามีชื่ออยู่แล้ว) — attribute ที่ไม่ใช่ locale-based ยังคง query
        // ด้วย locale_id ตายตัวเป็น null เหมือนเดิม (ค่า global เดียวเท่านั้น)
        $localeId = $attribute->is_locale_based ? $activeLocaleId : null;
        $scopeToLocale = function ($query) use ($localeId) {
            return $query->where(function ($q) use ($localeId) {
                $q->where('locale_id', $localeId)->orWhereNull('locale_id');
            })->orderByRaw('locale_id IS NULL'); // ตรง locale ปัจจุบันก่อน ตัว global (locale_id null) เป็น fallback
        };

        $isVariantDefining = in_array($attribute->id, $product->configurable_attributes ?? [], true);

        if ($isVariantDefining && $product->variants->isNotEmpty()) {
            // ค่าของแต่ละ variant เอง (ไม่ใช่ query เดียวรวมทุก variant) เพราะ
            // fallback ต่อ locale ต้องคำนวณแยกต่อสินค้าแต่ละตัว ไม่ใช่ทั้งกลุ่ม
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
     * ชื่อแบรนด์ที่จะส่งไป Lazada จริง — mirror ลำดับความสำคัญเดียวกับ
     * LazadaProductSyncService::resolveLazadaBrandId()/buildPayload() เป๊ะๆ
     * (ต่างจาก field อื่นในลิสต์นี้ตรงที่ brand ไม่ได้ resolve ผ่าน
     * LazadaAttributeMapping ธรรมดาเป็นหลัก):
     *
     *   1. override เฉพาะสินค้า (products.lazada_brand_id) ถ้ามี
     *   2. ไม่งั้นดูค่า attribute `pbrand` ของสินค้า → Brand.lazada_brand_id
     *      ("Master Brand" — ตาราง lazada_brands ที่ sync มาจาก Lazada จริง
     *      ยืนยันตัวตนด้วย id ไม่ใช่ชื่อ ผ่าน mappedBrandOptionId() ใน
     *      ResolvesProductAttributeValues trait)
     *   3. ถ้ายังไม่มีทั้งสองทาง fallback ไปดู mapping ทั่วไปที่ผูก PIM
     *      attribute เข้ากับ Lazada category attribute ชื่อ `brand` ตรงๆ แทน
     *
     * ไม่ครอบคลุม resolveGenericBrandName()'s legacy option-id fallback (ดู
     * docblock ของมันเอง — เป็น fallback สำหรับ option-mapping ที่บันทึกไว้
     * ก่อนมี label column เท่านั้น) เพราะ productDetail() นี้เป็นแค่ preview
     * ไม่ใช่ path ที่ใช้ push จริง ถ้าพลาดกรณีเก่ามากๆ นั้นไป push ตัวจริงจะยัง
     * resolve ถูกอยู่ดี แค่ preview อาจไม่ตรงในเคสหายากนี้เท่านั้น
     */
    private function resolveBrandDisplayValue(Product $product): ?string
    {
        $lazadaBrandId = $product->lazada_brand_id ?: $this->mappedBrandOptionId($product, 'lazada_brand_id');
        if ($lazadaBrandId) {
            $name = LazadaBrand::find($lazadaBrandId)?->name;
            if ($name) {
                return $name;
            }
        }

        $mapping = LazadaAttributeMapping::with('attribute')
            ->where('target_field', 'lazada_attribute')
            ->where('lazada_attribute_name', 'brand')
            ->first();

        return $mapping ? $this->resolveAttributeDisplayValue($product, $mapping->attribute, null) : null;
    }

    /**
     * เดินขึ้นสายพ่อแม่ของ LazadaCategory ทีละชั้นจนถึงราก — เรียกครั้งเดียวต่อ
     * request นี้ (สินค้าเดียว) เลยไม่ต้อง preload ทั้งต้นไม้เหมือน
     * lazadaProducts()'s $lazadaCategoryPathOf closure ด้านบน
     */
    private function lazadaCategoryPathFor(?int $categoryId): ?string
    {
        if (! $categoryId) {
            return null;
        }

        $names = [];
        $id = $categoryId;
        while ($id) {
            $cat = LazadaCategory::find($id, ['id', 'parent_id', 'name']);
            if (! $cat) {
                break;
            }
            array_unshift($names, $cat->name);
            $id = $cat->parent_id;
        }

        return $names ? implode(' > ', $names) : null;
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
        // (category_id, name) => is_mandatory — เก็บแยกจาก $rowsByName ด้านบน
        // (ซึ่งจงใจ dedupe ข้ามหมวดหมู่ เพราะ label/input_type/attribute_type/
        // options เสถียรพอจะ key ด้วยชื่อ field เฉยๆ) เพราะ mandatory ต่างจากนั้น —
        // เปลี่ยนไปตามหมวดหมู่จริง เก็บรวมแถวเดียวแบบ $rowsByName ไม่ได้ ไม่งั้นจะ
        // เจอบั๊กเดิมที่ lazada_attributes.category_id/.mandatory เคยเป็น (ดู
        // LazadaCategoryAttribute's docblock)
        $categoryAttrRows = [];

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

                $categoryAttrRows[] = [
                    'category_id' => (int) $categoryId,
                    'lazada_attribute_name' => $attr['name'],
                    'mandatory' => (bool) ($attr['is_mandatory'] ?? false),
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

        foreach (array_chunk($categoryAttrRows, 500) as $chunk) {
            LazadaCategoryAttribute::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['category_id', 'lazada_attribute_name'],
                ['mandatory', 'updated_at']
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
            'options' => $this->encodeLazadaOptions($attr),
            'created_at' => $now,
            'updated_at' => $now,
        ], $schema);

        // แยกเขียนคนละตาราง: label/input_type/attribute_type/options ยังคงไป
        // lazada_attributes เหมือนเดิม (เสถียรพอจะ dedupe ข้ามหมวดหมู่ได้จริง)
        // ส่วน mandatory ซึ่งเปลี่ยนไปตามหมวดหมู่ ไปที่ lazada_category_attributes
        // แทน — ไม่ใช้แถวเดียวกันซ้อนกันแบบเดิมอีกต่อไป (บั๊กที่แก้ไปแล้ว ดู
        // LazadaCategoryAttribute's docblock)
        if ($rows !== []) {
            LazadaAttribute::upsert($rows, ['name'], ['label', 'input_type', 'attribute_type', 'options', 'updated_at']);

            $categoryAttrRows = array_map(fn (array $attr) => [
                'category_id' => $categoryId,
                'lazada_attribute_name' => $attr['name'],
                'mandatory' => (bool) ($attr['is_mandatory'] ?? false),
                'created_at' => $now,
                'updated_at' => $now,
            ], $schema);
            LazadaCategoryAttribute::upsert($categoryAttrRows, ['category_id', 'lazada_attribute_name'], ['mandatory', 'updated_at']);
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
        // "field ไหนอยู่ในหมวดหมู่นี้บ้าง + บังคับหรือเปล่า" มาจาก
        // lazada_category_attributes เสมอตอนนี้ (ไม่ใช่ lazada_attributes.
        // category_id/.mandatory ที่ deprecated แล้ว — ดู LazadaCategoryAttribute
        // กับ LazadaAttribute's docblock) ส่วน label/input_type/options ยังมาจาก
        // lazada_attributes เหมือนเดิม (ข้อมูลที่เสถียรพอจะ key ด้วยชื่อ field เฉยๆ)
        $mandatoryByName = LazadaCategoryAttribute::where('category_id', $lazadaCategoryId)
            ->pluck('mandatory', 'lazada_attribute_name');

        $attributes = LazadaAttribute::whereIn('name', $mandatoryByName->keys())
            ->orderBy('label')
            ->get();

        $mappedByLazadaAttributeName = LazadaAttributeMapping::whereIn('lazada_attribute_name', $attributes->pluck('name'))
            ->with(['attribute:id,name', 'optionMappings'])
            ->get()
            ->keyBy('lazada_attribute_name');

        $data = $attributes->map(function (LazadaAttribute $attribute) use ($mappedByLazadaAttributeName, $mandatoryByName) {
            $mapping = $mappedByLazadaAttributeName->get($attribute->name);
            $isSelectType = in_array($attribute->input_type, self::SELECT_INPUT_TYPES, true);

            return [
                'name' => $attribute->name,
                'label' => $attribute->label,
                'input_type' => $attribute->input_type,
                'mandatory' => (bool) ($mandatoryByName[$attribute->name] ?? false),
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
