<?php

namespace App\Http\Controllers\Catalog;

use App\Events\ProductDataChanged;
use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Jobs\AutoTranslateProductValueJob;
use App\Jobs\SyncProductToMarketplaceJob;
use App\Models\AssociationType;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Channel;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductAssociation;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\ProductValue;
use App\Models\SalesPlatformShop;
use App\Services\Catalog\AttributeAccessPolicy;
use App\Services\Catalog\AttributeValueFormatter;
use App\Services\Catalog\ProductCategoryLinker;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use App\Services\ImportExport\Exporters\ProductRowExporter;
use App\Services\ImportExport\SpreadsheetWriter;
use App\Services\Lazada\LazadaProductSyncService;
use App\Services\Shopee\ShopeeProductSyncService;
use App\Services\TikTok\TikTokProductSyncService;
use App\Services\WooCommerce\WooCommerceProductSyncService;
use App\Services\WordPress\TranslatePressTranslationSyncService;
use App\Services\WordPress\WordPressDatabase;
use App\Services\WordPress\WordPressTunnel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class ProductController extends Controller
{
    use HasVersionHistory;

    // ตั้งให้ตรงกับเพดาน main_images ของ TikTok เอง (9 รูป แต่ 1 ช่องถือเป็นรูป
    // "main" โดยปริยายในหน้า UI ของ marketplace ส่วนใหญ่) — บังคับตรงนี้ตั้งแต่
    // ขั้นตอนอัปโหลดของ PIM เอง เพื่อให้เห็นข้อจำกัดตั้งแต่ตอนแก้ไข แทนที่จะไป
    // เจอทีหลังตอน push ไป marketplace แล้วพัง
    private const MAX_GALLERY_IMAGES = 8;

    // ข้อกำหนดรูปของ marketplace (รวมถึง Create Product API ของ TikTok) กำหนด
    // ขั้นต่ำไว้ที่ 300x300px — บังคับตรงนี้ด้วยเหตุผลเดียวกับ MAX_GALLERY_IMAGES
    // ด้านบน
    private const MIN_IMAGE_DIMENSION = 300;

    public function __construct(private readonly AttributeAccessPolicy $attributeAccess) {}

    public function index(Request $request): Response
    {
        $grid = new GridManager('product_grid');

        $nameAttributeId = Attribute::idForCode('pname');

        // `name` และ filter attribute แบบไดนามิกจาก "Add Filter" เป็นแบบ EAV
        // (ProductValue) ไม่ใช่คอลัมน์จริงบน `products` เพราะงั้น applyFilters()
        // ของ GridManager ที่ทำงานกับคอลัมน์ธรรมดาจะจัดการให้ไม่ได้ — เลยต้อง
        // เพิ่มเป็นเงื่อนไข query แยกก่อน paginate แทน
        $filtersInput = $request->input('filters', []);
        $attributeFilters = $request->input('attribute_filters', []);
        $categoryId = $request->input('category_id');

        $gridData = $grid->getData($request, function ($query) use ($filtersInput, $attributeFilters, $nameAttributeId, $categoryId) {
            $nameValue = $filtersInput['name'] ?? null;
            if ($nameValue !== null && $nameValue !== '' && $nameAttributeId) {
                $query->whereHas('values', function ($q) use ($nameAttributeId, $nameValue) {
                    $q->where('attribute_id', $nameAttributeId)->where('value', 'like', "%{$nameValue}%");
                });
            }

            foreach ((array) $attributeFilters as $filter) {
                $attributeId = $filter['attribute_id'] ?? null;
                $value = $filter['value'] ?? null;
                if (! $attributeId || $value === null || $value === '') {
                    continue;
                }

                $query->whereHas('values', function ($q) use ($attributeId, $value) {
                    $q->where('attribute_id', $attributeId)->where('value', 'like', '%'.$value.'%');
                });
            }

            // มาจากตัวเลขจำนวนสินค้าที่กดได้ในหน้ารายการ Categories (ดู
            // resources/js/pages/catalog/categories/index.tsx) — ไม่ใช่
            // column filter ของ GridManager เพราะ `categories` เป็นความสัมพันธ์
            // many-to-many (pivot table product_category) ไม่ใช่คอลัมน์จริงบน
            // `products`
            if ($categoryId) {
                $query->whereHas('categories', fn ($q) => $q->where('categories.id', $categoryId));
            }
        });

        $imageAttributeIdByFamily = FamilyAttribute::query()
            ->join('attributes', 'attributes.id', '=', 'family_attributes.attribute_id')
            ->where('attributes.type', 'image')
            ->pluck('attributes.id', 'family_attributes.family_id');

        // ความสมบูรณ์ (Completeness) = สัดส่วนของ attribute ทั้งหมดที่ family ของ
        // สินค้าถูกกำหนดไว้ (ไม่ใช่แค่ตัวที่ required) ที่มีค่าใส่ไว้แล้ว จัดกลุ่มตาม
        // family ไว้ล่วงหน้า เพื่อให้สินค้าทุกตัวในหน้าเดียวกันใช้ lookup ชุดเดียวกัน
        // ได้เลย ไม่ต้อง query ซ้ำทีละแถว
        $familyIds = $gridData->getCollection()->pluck('family_id')->filter()->unique();
        $familyAttributeIdsByFamily = FamilyAttribute::query()
            ->whereIn('family_id', $familyIds)
            ->get(['family_id', 'attribute_id'])
            ->groupBy('family_id')
            ->map(fn ($rows) => $rows->pluck('attribute_id'));

        $productIds = $gridData->getCollection()->pluck('id');
        $parentIds = $gridData->getCollection()->pluck('parent_id')->filter()->unique();

        $parentSkus = $parentIds->isNotEmpty()
            ? Product::whereIn('id', $parentIds)->pluck('sku', 'id')
            : collect();

        $allAttributes = Attribute::cachedList();

        // attribute แบบอิงตาม locale (pname, spec_* ฯลฯ) จะเก็บ ProductValue
        // ไว้แถวละ 1 locale ส่วนแบบอิงตาม channel ก็เก็บแถวละ 1 channel เหมือนกัน
        // grid นี้ไม่มีตัวเลือก locale/channel ให้เลือก เลยต้องการแค่ค่าที่เป็น
        // global scope (channel_id IS NULL) ใน locale ปัจจุบันของแอดมินเท่านั้น
        // — กรองแค่นี้ไว้ล่วงหน้า แล้วเรียงให้แถวของ locale ที่ active มาก่อนแถว
        // fallback ที่ไม่มี locale เพื่อให้ `->first()` ด้านล่างได้แถวที่ต้องการจริงๆ
        // แทนที่จะได้แถวมั่วๆ ตามลำดับที่ DB คืนมา (ซึ่งเป็นสาเหตุที่ตัวสลับ locale
        // เคยถูกเมินเฉยแบบเงียบๆ ก่อนจะแก้ตรงนี้)
        $activeLocaleId = Locale::idForCode(app()->getLocale());

        $values = ProductValue::whereIn('product_id', $productIds)
            ->whereNull('channel_id')
            ->where(function ($query) use ($activeLocaleId) {
                $query->whereNull('locale_id');
                if ($activeLocaleId) {
                    $query->orWhere('locale_id', $activeLocaleId);
                }
            })
            ->when(
                $activeLocaleId,
                fn ($query) => $query->orderByRaw('CASE WHEN locale_id = ? THEN 0 ELSE 1 END ASC', [$activeLocaleId]),
            )
            ->get(['product_id', 'attribute_id', 'value']);

        // ทำ index ด้วย "product_id-attribute_id" เพื่อให้แต่ละแถวด้านล่างเป็น
        // lookup แบบ O(1) แทนที่จะต้องสแกน $values แบบ linear ใหม่ทุกครั้งต่อ
        // สินค้าต่อ attribute (สแกนแบบนั้นคือ O(products × attributes) ซึ่งกิน
        // เวลาส่วนใหญ่ของ action นี้เมื่อ catalog มีขนาดใหญ่พอสมควร) แถวถูกเรียง
        // ให้ active-locale มาก่อนอยู่แล้ว (ดู orderByRaw ด้านบน) และโค้ดนี้จะเก็บ
        // แค่ค่าแรกที่เจอต่อ key เท่านั้น ทำให้แถวของ locale ที่ active ยังชนะแถว
        // fallback ที่ไม่มี locale เหมือนกับที่ ->first() เคยทำ
        $valueByKey = [];
        foreach ($values as $value) {
            $key = $value->product_id.'-'.$value->attribute_id;
            if (! array_key_exists($key, $valueByKey)) {
                $valueByKey[$key] = $value->value;
            }
        }

        // ข้อมูลคอลัมน์ "Sales Channels" — เอาแค่สถานะที่ยืนยันแล้วว่า live จริง
        // เท่านั้น (product_platform_shops.status = 'live' ซึ่งถูกเติมโดย
        // LazadaProductSyncService::syncLiveStatus() แถวที่มีอยู่แต่ยัง
        // ไม่ใช่ status='live' แปลว่าแค่ "ทำเครื่องหมายไว้ให้ publish" ยังไม่ได้
        // push จริง) จัดกลุ่มตามชื่อแพลตฟอร์ม ไม่ได้ hardcode ไว้แค่ Lazada
        // เพื่อให้ sync ของแพลตฟอร์มใหม่ในอนาคตไม่ต้องแก้ตรงนี้
        $salesChannelRows = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->whereIn('product_platform_shops.product_id', $productIds)
            ->where('product_platform_shops.status', 'live')
            ->get(['product_platform_shops.product_id', 'sales_platforms.name as platform_name']);

        $salesChannelsByProduct = $salesChannelRows->groupBy('product_id')->map(fn ($rows) => [
            'total' => $rows->count(),
            'platforms' => $rows->groupBy('platform_name')->map->count(),
        ]);

        // ทุก shop ที่สินค้าถูกทำเครื่องหมาย "published" ไว้ ไม่ว่าจะ live จริง
        // หรือไม่ก็ตาม — เป็นชุดข้อมูลเดียวกับที่ checkbox ในแผง Sales Channels
        // ของหน้า Edit และตัวเช็ค "published" ใน queueMarketplaceSync() ใช้
        // (product_platformShops()) ทำให้ dialog Share แบบเลือกหลายรายการใน
        // หน้ารายการสินค้า ติ๊กช่องของ channel ที่สินค้าที่เลือกไว้ publish ไปแล้ว
        // ให้อัตโนมัติ แทนที่จะเปิดมาว่างเปล่าทุกครั้ง จงใจไม่กรองด้วย status='live'
        // เหมือน $salesChannelRows ด้านบน เพราะ "published" กับ "ยืนยันว่า live
        // จริง" เป็นคนละสถานะกันในที่นี้
        $publishedShopRows = DB::table('product_platform_shops')
            ->whereIn('product_id', $productIds)
            ->get(['product_id', 'sales_platform_shop_id']);

        $publishedShopIdsByProduct = $publishedShopRows->groupBy('product_id')
            ->map(fn ($rows) => $rows->pluck('sales_platform_shop_id')->all());

        $translationCompletenessByProduct = $this->translationCompletenessByProduct($gridData->getCollection());

        $items = $gridData->getCollection()->map(function ($product) use ($valueByKey, $nameAttributeId, $imageAttributeIdByFamily, $allAttributes, $parentSkus, $familyAttributeIdsByFamily, $salesChannelsByProduct, $publishedShopIdsByProduct, $translationCompletenessByProduct) {
            $product->family_code = $product->family ? ($product->family->name ?: $product->family->code) : '-';

            $familyAttributeIds = $familyAttributeIdsByFamily->get($product->family_id) ?? collect();
            if ($familyAttributeIds->isEmpty()) {
                // family นี้ไม่มี attribute ถูกกำหนดไว้เลย — ไม่มีอะไรให้วัดความ
                // สมบูรณ์เทียบด้วย เลยให้เป็น "N/A" แทนที่จะขึ้น 100% ซึ่งจะทำให้
                // เข้าใจผิด
                $product->completeness = null;
            } else {
                $filledCount = $familyAttributeIds->filter(function ($attributeId) use ($product, $valueByKey) {
                    $raw = $valueByKey[$product->id.'-'.$attributeId] ?? null;

                    return $raw !== null && trim((string) $raw) !== '';
                })->count();
                $product->completeness = (int) round($filledCount / $familyAttributeIds->count() * 100);
            }

            $product->name = $nameAttributeId
                ? ($valueByKey[$product->id.'-'.$nameAttributeId] ?? null)
                : null;

            $imageAttributeId = $imageAttributeIdByFamily->get($product->family_id);
            $imagePath = $imageAttributeId
                ? ($valueByKey[$product->id.'-'.$imageAttributeId] ?? null)
                : null;
            $product->image_url = AttributeValueFormatter::resolveStorageUrl($imagePath);

            $product->parent_sku = $product->parent_id ? ($parentSkus->get($product->parent_id) ?? null) : null;

            $channels = $salesChannelsByProduct->get($product->id);
            $product->sales_channels = [
                'total' => $channels['total'] ?? 0,
                'platforms' => $channels ? $channels['platforms']->toArray() : [],
            ];

            $product->published_shop_ids = $publishedShopIdsByProduct->get($product->id, []);

            $product->translation_completeness = $translationCompletenessByProduct[$product->id] ?? null;

            $product->attribute_values = $allAttributes->mapWithKeys(function (Attribute $attribute) use ($product, $valueByKey) {
                $rawValue = $valueByKey[$product->id.'-'.$attribute->id] ?? null;

                return [$attribute->id => $this->formatAttributeValue($attribute, $rawValue)];
            });

            return $product;
        });
        $gridData->setCollection($items);

        return Inertia::render('catalog/products/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $gridData,
            // ใช้ key แบบระบุตรงๆ (ไม่ใช้ $request->only() ที่จะข้าม key ที่ไม่มีค่าไป)
            // เพื่อให้ตรงนี้ serialize เป็น JSON object เสมอ ไม่มีทางกลายเป็น `[]`
            // — เพราะ `.sort` ของ array ว่างจะไปตรงกับ Array.prototype.sort ซึ่งทำให้
            // `filters.sort ?? ''` ฝั่ง frontend พังได้ (function ที่เป็น truthy หลุด
            // ผ่าน `??` ไปได้ แล้ว useState() ก็จะเรียกมันแบบ unbound ในฐานะ lazy
            // initializer แล้ว throw error)
            'filters' => [
                'search' => $request->input('search', ''),
                'sort' => $request->input('sort', ''),
                'dir' => $request->input('dir', ''),
                'filters' => $request->input('filters', []),
                'attribute_filters' => $request->input('attribute_filters', []),
                'category_id' => $request->input('category_id', ''),
                'category_name' => $request->input('category_name', ''),
            ],
            'families' => AttributeFamily::cachedList(),
            'attributes' => $allAttributes->map(fn (Attribute $attribute) => [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'label' => $attribute->name,
                'type' => $attribute->type,
                'is_filterable' => (bool) $attribute->is_filterable,
            ]),
            'salesChannels' => SalesPlatformShop::cachedGroupedByPlatform(),
        ]);
    }

    public function summary(): JsonResponse
    {
        $products = Product::with('family:id,code,name')->get([
            'id', 'sku', 'family_id', 'type', 'enabled', 'created_at', 'updated_at',
        ]);

        $allAttributes = Attribute::with('options')->get();

        $attributesByFamily = FamilyAttribute::with('attribute.options')
            ->get()
            ->groupBy('family_id')
            ->map(fn ($rows) => $rows->pluck('attribute')->filter());

        $values = ProductValue::whereIn('product_id', $products->pluck('id'))
            ->get(['product_id', 'attribute_id', 'value']);

        $data = $products->map(function (Product $product) use ($allAttributes, $attributesByFamily, $values) {
            $attributes = $attributesByFamily->get($product->family_id) ?: $allAttributes;

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'type' => $product->type,
                'enabled' => (bool) $product->enabled,
                'family' => $product->family ? [
                    'id' => $product->family->id,
                    'code' => $product->family->code,
                    'name' => $product->family->name,
                ] : null,
                // ใช้ toIso8601String() ไม่ใช่ toDateTimeString() — เพราะ string
                // แบบ naive ที่ toDateTimeString() คืนมาไม่มี timezone marker
                // ทำให้ `new Date(value)` ฝั่ง frontend อ่านผิดเป็นเวลา local แทนที่
                // จะเป็น UTC (ซึ่งเป็น APP_TIMEZONE ของแอปนี้) เลยแสดงเวลาคลาดเคลื่อน
                // ไปตามที่นาฬิกาของผู้ดูห่างจาก UTC เท่าไหร่ (เร็วไป 7 ชั่วโมงสำหรับ
                // browser ที่ตั้งเวลาไทย เช็คจากของจริงแล้ว) แก้แบบเดียวกันนี้ไปแล้ว
                // ที่หน้า edit ด้วย (ดู edit() ด้านล่าง)
                'created_at' => $product->created_at?->toIso8601String(),
                'updated_at' => $product->updated_at?->toIso8601String(),
                'attributes' => $attributes->map(function (Attribute $attribute) use ($product, $values) {
                    $rawValue = optional(
                        $values->first(fn ($v) => $v->product_id === $product->id && $v->attribute_id === $attribute->id)
                    )->value;

                    return [
                        'id' => $attribute->id,
                        'code' => $attribute->code,
                        'name' => $attribute->name,
                        'type' => $attribute->type,
                        'value' => $this->formatAttributeValue($attribute, $rawValue),
                    ];
                })->values(),
            ];
        });

        return response()->json([
            'total_products' => $products->count(),
            'products' => $data,
        ]);
    }

    /**
     * ค้นหาสินค้าแบบเบาๆ สำหรับตัวเลือก "Add related/up-sell/cross-sell product"
     * ในหน้า edit — หาโดย match กับ SKU หรือค่าของ attribute `pname` (ค้นทุก
     * locale เลย ตั้งใจให้ครอบคลุมกว้างกว่าชื่อที่แสดงผลด้านล่าง เผื่อกรณีมีเลขคล้าย
     * SKU ฝังอยู่ในชื่อของ locale ไหนก็ตามให้ยัง match ได้) และตัดตัวที่เลือกไว้
     * แล้วออก
     */
    public function search(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));
        $excludeIds = array_filter(array_map('intval', (array) $request->query('exclude', [])));

        if ($query === '') {
            return response()->json([]);
        }

        $nameAttributeId = Attribute::idForCode('pname');

        $matchingProductIds = $nameAttributeId
            ? ProductValue::where('attribute_id', $nameAttributeId)->where('value', 'like', "%{$query}%")->pluck('product_id')
            : collect();

        $products = Product::where(function ($q) use ($query, $matchingProductIds) {
            $q->where('sku', 'like', "%{$query}%");
            if ($matchingProductIds->isNotEmpty()) {
                $q->orWhereIn('id', $matchingProductIds);
            }
        })
            ->when(! empty($excludeIds), fn ($q) => $q->whereNotIn('id', $excludeIds))
            ->limit(20)
            ->get(['id', 'sku']);

        $names = $this->resolveProductNamesInCurrentLocale($products->pluck('id'));

        return response()->json($products->map(fn (Product $product) => [
            'id' => $product->id,
            'sku' => $product->sku,
            'name' => ($names[$product->id] ?? null) ?: $product->sku,
        ])->values());
    }

    /**
     * หาค่า attribute `pname` ของแต่ละ product id ตาม locale ปัจจุบันที่แอดมินใช้อยู่
     * (app()->getLocale()) ถ้า locale นั้นไม่มีแถวของตัวเอง ก็ fallback ไปใช้
     * scope แบบ global (locale_id=null) แทน — ใช้ลำดับความสำคัญของ locale
     * แบบเดียวกับที่ index() ใช้กับกริดของมันอยู่แล้ว
     * ถ้าไม่ทำแบบนี้ การใช้ `ProductValue::pluck('value', 'product_id')` ตรงๆ
     * จะไม่มี ORDER BY คุมลำดับแถว locale หลายๆ อันของ product เดียวกัน เลยทำให้
     * pluck() สุ่มเอาแถวไหนก็ได้ที่ DB คืนมาล่าสุด — ไม่แน่นอน แล้วก็ไม่ใช่ภาษา
     * ของแอดมินคนที่กำลังดูอยู่จริงๆ ด้วย (เจอเคสจริงมาแล้ว: แอดมิน locale ไทย
     * เปิด product picker แล้วเจอชื่อเป็นภาษาจีน)
     *
     * @param  \Illuminate\Support\Collection<int, int>  $productIds
     * @return array<int, string|null> product_id => ชื่อ
     */
    private function resolveProductNamesInCurrentLocale(Collection $productIds): array
    {
        $nameAttributeId = Attribute::idForCode('pname');
        if (! $nameAttributeId || $productIds->isEmpty()) {
            return [];
        }

        $activeLocaleId = Locale::idForCode(app()->getLocale());

        $rowsByProduct = ProductValue::whereIn('product_id', $productIds)
            ->where('attribute_id', $nameAttributeId)
            ->whereNull('channel_id')
            ->get(['product_id', 'locale_id', 'value'])
            ->groupBy('product_id');

        $names = [];
        foreach ($rowsByProduct as $productId => $rows) {
            $match = $activeLocaleId ? $rows->firstWhere('locale_id', $activeLocaleId) : null;
            $names[$productId] = ($match ?? $rows->firstWhere('locale_id', null))?->value;
        }

        return $names;
    }

    /**
     * รายงานแบบ read-only ของ product ที่ยังไม่มีชื่อ (`pname`) ที่แปลจริงๆ
     * ในหนึ่ง locale ขึ้นไปที่เปิดใช้งานอยู่ ถือว่า locale ไหน "missing" เมื่อ
     * ค่าว่างเปล่า หรือยังเท่ากับ SKU อยู่ — เพราะ Product::applySmartDefaults()
     * จะตั้งค่า `pname` เริ่มต้นของทุก locale เป็น SKU ตอนสร้าง/duplicate
     * (เป็นแค่ placeholder) ดังนั้น locale ที่ยังไม่ถูกแตะเลยจะอ่านได้ว่า
     * "= SKU" ไม่ใช่ค่าว่างเปล่าจริงๆ
     */
    public function missingTranslations(): Response
    {
        $locales = Locale::active();
        $localeIds = $locales->pluck('id')->all();
        $localeList = $locales->map(fn ($locale) => ['id' => $locale->id, 'code' => $locale->code, 'display_name' => $locale->display_name])->all();
        $nameAttributeId = Attribute::idForCode('pname');
        $thaiLocaleId = Locale::idForCode('th');

        // เอาทุก attribute ที่ติดแฟล็ก "value per locale" (pname, warranty_*,
        // spec_*, ...) ไม่ใช่แค่ pname เพราะ product อาจจะแปลชื่อแล้ว
        // แต่ยังขาดเนื้อหาอื่น เช่น หมายเหตุการรับประกันหรือสเปก
        // ในบาง locale อยู่ก็ได้
        $localeBasedAttributes = Attribute::where('is_locale_based', true)->orderBy('code')->get(['id', 'code', 'name']);
        $attributesById = $localeBasedAttributes->keyBy('id');
        $localeBasedAttributeIds = $localeBasedAttributes->pluck('id')->all();

        $products = Product::with('family:id,code,name')
            ->orderBy('sku')
            ->get(['id', 'sku', 'family_id', 'enabled']);

        // จำกัดเฉพาะ locale-based attribute ที่ถูก assign ให้กับ family ของ
        // product นั้นจริงๆ — ใช้แหล่งข้อมูลเดียวกับที่ edit() ใช้จัดกลุ่ม
        // แท็บ attribute เลยไม่มีทางที่รายงานนี้จะไปเตือนฟิลด์ที่หน้า Edit
        // ของ product เองไม่มีที่ให้แสดง/แก้ได้ ส่วน family ที่ไม่มีแถว
        // FamilyAttribute เลยสักแถว จะ fallback ไปใช้ทุก locale-based
        // attribute แทน เหมือนกับ fallback "ไม่มีการ assign -> โชว์ system
        // attribute ทั้งหมด" ของ edit()
        $familyAttributeIdsByFamily = FamilyAttribute::whereIn('attribute_id', $localeBasedAttributeIds)
            ->get(['family_id', 'attribute_id'])
            ->groupBy('family_id')
            ->map(fn ($rows) => $rows->pluck('attribute_id')->all());
        $familiesWithAnyAssignment = FamilyAttribute::pluck('family_id')->unique()->all();

        // จัดกลุ่มตาม product แล้วก็ attribute — ตั้งใจให้ sparse เพราะ
        // attribute แบบ locale-based ทั้ง 17 ตัวของ catalog นี้ ส่วนใหญ่ถูกใช้
        // จริงแค่ไม่กี่ product (หรือแค่ตัวเดียว) การสร้างจากแถวที่มีอยู่จริง
        // (แทนที่จะไล่เช็คทั้ง 17 attribute x 3 locale ของทุก product แบบ
        // เหมารวม) จึงตรงกับสภาพข้อมูลจริงและทำให้ loop ด้านล่างเร็วขึ้นด้วย
        // ใช้แถวดิบจาก query-builder (stdClass) ไม่ใช่ hydrate เป็น model
        // ProductValue เพราะตรงนี้ไม่ต้องการอะไรมากไปกว่า 4 คอลัมน์ดิบๆ —
        // ตอน boot ของ Eloquent model แต่ละแถว (casts, accessors, event
        // machinery) คือตัวกินเวลาหลักของหน้านี้ตอนมีเป็นหมื่นแถว
        //
        // รวมแถวที่ locale_id เป็น NULL ด้วย (จัดไว้ใต้ key 'global' ด้านล่าง)
        // — ดู docblock ของ foldGlobalValueIntoThai() ว่าทำไมแถวพวกนี้ถึงไม่ใช่
        // "ไม่มี locale" จริงๆ และถ้าข้ามแถวพวกนี้ไป จะทำให้ฟิลด์ที่ bulk-import
        // มา เช่น spec_specifications ไม่โผล่ในรายงานนี้เลย ทั้งที่ไม่เคยถูก
        // แยกเป็น EN/ZH เลยสักครั้ง
        $rowsByProductAttribute = [];
        if (! empty($localeBasedAttributeIds)) {
            foreach (
                DB::table('product_values')
                    ->whereIn('attribute_id', $localeBasedAttributeIds)
                    ->whereNull('channel_id')
                    ->where(fn ($query) => $query->whereIn('locale_id', $localeIds)->orWhereNull('locale_id'))
                    ->select('product_id', 'attribute_id', 'locale_id', 'value')
                    ->cursor()
                as $value
            ) {
                $rowsByProductAttribute[$value->product_id][$value->attribute_id][$value->locale_id ?? 'global'] = $value->value;
            }
        }

        // attribute id ที่เกี่ยวข้องขึ้นอยู่กับ family_id เท่านั้น และ catalog
        // นี้มีจำนวน family ที่ต่างกันน้อยกว่าจำนวน product เยอะมาก เลย
        // resolve แค่ครั้งเดียวต่อ family แล้ว cache ไว้ตรงนี้ แทนที่จะกรอง
        // list attribute ใหม่ทุกครั้งสำหรับแต่ละ product ด้านล่าง
        $applicableAttributeIdsByFamily = [];

        $rows = [];
        foreach ($products as $product) {
            $familyId = $product->family_id;
            if (! array_key_exists($familyId, $applicableAttributeIdsByFamily)) {
                $ids = $familyAttributeIdsByFamily->get($familyId);
                if ($ids === null) {
                    $ids = in_array($familyId, $familiesWithAnyAssignment, true) ? [] : $localeBasedAttributeIds;
                }
                $applicableAttributeIdsByFamily[$familyId] = array_flip($ids);
            }
            $applicableAttributeIds = $applicableAttributeIdsByFamily[$familyId];

            if (empty($applicableAttributeIds)) {
                continue;
            }

            $missingAttributesByLocaleId = [];
            $productRows = $rowsByProductAttribute[$product->id] ?? [];

            // pname ถูกเช็คเสมอ ต่อให้ไม่มีแถวเลยก็ตาม — เพราะ placeholder
            // "ยังเป็นแค่ SKU" (Product::applySmartDefaults()) หมายความว่า
            // product ที่ไม่เคยถูกตั้งชื่อในภาษาไหนเลย คือเคสที่รายงานนี้
            // ต้องการโชว์ให้เห็นมากที่สุด ต่างจาก locale-based attribute
            // ตัวอื่นๆ ด้านล่างที่ไม่ได้เป็นแบบนี้
            if (isset($applicableAttributeIds[$nameAttributeId])) {
                $this->collectMissingLocalesForAttribute(
                    $attributesById[$nameAttributeId],
                    $this->foldGlobalValueIntoThai($productRows[$nameAttributeId] ?? [], $thaiLocaleId),
                    $localeList,
                    $product->sku,
                    isNameAttribute: true,
                    requireSource: false,
                    thaiLocaleId: $thaiLocaleId,
                    missingAttributesByLocaleId: $missingAttributesByLocaleId,
                );
            }

            // ส่วน locale-based attribute ตัวอื่นๆ: จะพิจารณาก็ต่อเมื่อมี
            // แถวอยู่จริงอย่างน้อยหนึ่งแถว (attribute ที่ไม่มีแถวเลยของ
            // product นี้ แปลว่าไม่เคยถูกกรอกในภาษาไหนเลย — นั่นคือขาดเนื้อหา
            // ไม่ใช่ปัญหาการแปล) และจะถูกเตือนก็ต่อเมื่อมีอย่างน้อยหนึ่ง
            // locale ที่มีข้อความจริงให้แปลออกไปได้ (requireSource) — ไม่งั้น
            // ก็เป็นเคส "ไม่มีอะไรให้แปล" เหมือนกัน แค่กระจายไปทุก locale
            // แทนที่จะไม่มีเลยสักตัว
            foreach ($productRows as $attributeId => $valuesByLocale) {
                if ($attributeId === $nameAttributeId || ! isset($applicableAttributeIds[$attributeId])) {
                    continue;
                }

                $this->collectMissingLocalesForAttribute(
                    $attributesById[$attributeId],
                    $this->foldGlobalValueIntoThai($valuesByLocale, $thaiLocaleId),
                    $localeList,
                    $product->sku,
                    isNameAttribute: false,
                    requireSource: true,
                    thaiLocaleId: $thaiLocaleId,
                    missingAttributesByLocaleId: $missingAttributesByLocaleId,
                );
            }

            if (empty($missingAttributesByLocaleId)) {
                continue;
            }

            $missingLocales = [];
            foreach ($localeList as $locale) {
                if (! empty($missingAttributesByLocaleId[$locale['id']])) {
                    $missingLocales[] = ['locale' => $locale, 'missing_attributes' => $missingAttributesByLocaleId[$locale['id']]];
                }
            }

            $rows[] = [
                'id' => $product->id,
                'sku' => $product->sku,
                'family' => $product->family ? ($product->family->name ?: $product->family->code) : null,
                'enabled' => (bool) $product->enabled,
                'missing_locales' => $missingLocales,
            ];
        }

        return Inertia::render('catalog/products/missing-translations', [
            'rows' => $rows,
            'totalProducts' => $products->count(),
        ]);
    }

    /**
     * การ bulk import (ProductRowImporter) — และ path การเขียนข้อมูลอื่นๆ
     * ที่ไม่ได้เจาะจง locale ใดเป็นพิเศษ — จะเอาค่าของ locale-based attribute
     * ไปลงที่ scope แบบ global เสมอ (channel_id=null, locale_id=null) และ
     * ค่า global นั้นก็เป็นภาษาไทยตามธรรมเนียมของระบบ ไม่ใช่ค่าที่ "ไม่มี
     * locale" จริงๆ: ดู docblock ของ ProductRowImporter::sourceLocaleId()
     * ที่ hardcode ภาษาไทยเป็น source language สำหรับ scope นี้เวลากระจาย
     * ค่าที่ bulk import มาไปยัง locale อื่นๆ
     *
     * ฟังก์ชันนี้จะเอาค่านั้นไปใส่ในช่องภาษาไทยเมื่อภาษาไทยยังไม่มีแถวของ
     * ตัวเองอยู่แล้ว เพื่อให้การเช็คทุกจุดถัดไป (การหา missing, การหา source
     * ให้ action Translate) มองเห็นมันเหมือนเป็นแถวภาษาไทยจริงๆ ถ้าไม่ทำแบบนี้
     * attribute ที่ถูก bulk-import มาอย่างเดียว — ไม่เคยถูกแยกเป็นแถวต่อ
     * locale เลย — จะอ่านได้ว่าไม่มีเนื้อหาในภาษาไหนเลย ทำให้มองไม่เห็นใน
     * รายงาน แล้วก็ทำให้ action Translate ไม่มี source ให้แปล ทั้งที่จริงๆ
     * มี source ดีๆ อยู่ตรงนั้นแหละ
     *
     * @param  array<int|string, string|null>  $valuesByLocale locale_id (หรือ 'global') => ค่าดิบ
     * @return array<int, string|null> locale_id => ค่าดิบ, เอา key 'global' ออกแล้ว
     */
    private function foldGlobalValueIntoThai(array $valuesByLocale, ?int $thaiLocaleId): array
    {
        $globalValue = $valuesByLocale['global'] ?? null;
        unset($valuesByLocale['global']);

        if ($thaiLocaleId === null || trim((string) $globalValue) === '') {
            return $valuesByLocale;
        }

        $hasOwnThaiValue = array_key_exists($thaiLocaleId, $valuesByLocale) && trim((string) $valuesByLocale[$thaiLocaleId]) !== '';
        if (! $hasOwnThaiValue) {
            $valuesByLocale[$thaiLocaleId] = $globalValue;
        }

        return $valuesByLocale;
    }

    /**
     * ประเมินค่าของ attribute ตัวหนึ่งในแต่ละ locale สำหรับ product เดียว
     * แล้วเติมเข้าไปใน $missingAttributesByLocaleId[$localeId] สำหรับทุก
     * locale ที่ขาดอยู่ ถ้า $requireSource เป็น true attribute ที่ไม่มี
     * source ที่ใช้ได้เลยสักที่ (ไม่มีอะไรให้แปลออกไปได้) จะถูกตัดทิ้งไปเลย
     * ไม่ถูกเตือน — ดูจุดที่เรียกใช้ทั้งสองจุดใน missingTranslations() ว่า
     * ทำไม pname ถึงส่ง false ส่วน locale-based attribute ตัวอื่นส่ง true
     *
     * @param  array<int, string|null>  $valuesByLocale locale_id => ค่าดิบ
     * @param  array<int, array{id: int, code: string, display_name: string|null}>  $localeList
     * @param  array<int, array<int, array{id: int, code: string, name: string|null}>>  $missingAttributesByLocaleId  locale_id => รายการ attribute, ส่งโดยอ้างอิง (by reference)
     */
    private function collectMissingLocalesForAttribute(
        Attribute $attribute,
        array $valuesByLocale,
        array $localeList,
        string $sku,
        bool $isNameAttribute,
        bool $requireSource,
        ?int $thaiLocaleId,
        array &$missingAttributesByLocaleId,
    ): void {
        $coverage = $this->resolveAttributeCoverage($valuesByLocale, $localeList, $sku, $isNameAttribute, $thaiLocaleId);

        if (empty($coverage['missingLocaleIds']) || ($requireSource && $coverage['sourceLocaleId'] === null)) {
            return;
        }

        $descriptor = ['id' => $attribute->id, 'code' => $attribute->code, 'name' => $attribute->name];
        foreach ($coverage['missingLocaleIds'] as $localeId) {
            $missingAttributesByLocaleId[$localeId][] = $descriptor;
        }
    }

    /**
     * ค่าของ locale-based attribute จะถือว่า "missing" เมื่อมันว่างเปล่า
     * หรือ — เฉพาะ pname เท่านั้น — ยังเท่ากับ SKU ที่
     * Product::applySmartDefaults() ตั้งให้ทุก locale ตอนสร้าง/duplicate
     * (เป็นแค่ placeholder ไม่ใช่การแปลจริง) แค่นี้อย่างเดียวยังจับไม่ได้ว่า
     * locale ไหนมีค่าที่แค่ copy ข้อความจริงจาก locale อื่นมาตรงๆ —
     * ดู resolveAttributeCoverage() ที่ห่อฟังก์ชันนี้ไว้พร้อมเช็คเพิ่มเติม
     * ตัวนั้นแหละที่ผู้เรียกควรใช้จริงๆ
     */
    private function isProductValueMissing(?string $value, string $sku, bool $isNameAttribute): bool
    {
        $value = trim((string) $value);
        if ($value === '') {
            return true;
        }

        return $isNameAttribute && strcasecmp($value, $sku) === 0;
    }

    /**
     * หาว่า locale ไหนมี source content จริงๆ ของ attribute นั้น แล้วก็
     * ระบุ locale อื่นๆ ที่เปิดใช้งานอยู่ทั้งหมดที่ยังต้องแปล — ไม่ว่าจะว่าง
     * เปล่า, (เฉพาะ pname) ยังเป็นแค่ placeholder ที่เท่ากับ SKU, หรือเป็นค่า
     * ที่ copy ข้อความ source มาเป๊ะๆ ทุกตัวอักษรโดยไม่เคยถูกแปลจริง
     *
     * ทั้งลำดับความสำคัญของ source locale และการเช็ค "copy มา ไม่ใช่แปล"
     * ใช้ธรรมเนียมเดียวกับที่ ProductRowImporter::sourceLocaleId() วางไว้
     * สำหรับ catalog นี้: ถึงแม้ config('app.locale') จะเป็น 'en' (ค่า
     * default ของ Laravel ที่ไม่มีใครไปแตะ) แต่เนื้อหาจริง — ชื่อ, สเปก,
     * ทุกอย่างที่ import เข้ามา — ส่วนใหญ่เขียนเป็นภาษาไทย และค่า "English"
     * ของ catalog นี้จำนวนมากก็คือข้อความไทยตัวเดียวกันที่ถูก copy ไปใส่
     * ช่อง EN ตรงๆ ไม่เคยถูกแปลจริงเลย (เช็คจากข้อมูลจริงแล้ว: ~96% ของ
     * product มี `pname` เหมือนกันเป๊ะทั้ง en และ th) ถ้าใช้
     * config('app.locale') เป็น source หรือถือว่าค่าที่ไม่ว่างเปล่า = "แปล
     * แล้ว" ทั้งสองแบบจะพลาดเคสนี้ไปเงียบๆ — นี่แหละคือสาเหตุที่ action
     * Translate ข้ามชื่อ product ไปเกือบทุกตัว ทั้งที่รายงาน/action บอกว่า
     * "ไม่มีอะไรขาด"
     *
     * @param  array<int, string|null>  $valuesByLocale locale_id => ค่าดิบ
     * @param  array<int, array{id: int}>  $localeList
     * @return array{sourceLocaleId: int|null, sourceValue: string, missingLocaleIds: int[]}
     */
    private function resolveAttributeCoverage(array $valuesByLocale, array $localeList, string $sku, bool $isNameAttribute, ?int $thaiLocaleId): array
    {
        $isRealValue = fn (?string $value) => ! $this->isProductValueMissing($value, $sku, $isNameAttribute);

        $sourceLocaleId = null;
        $sourceValue = '';

        if ($thaiLocaleId !== null && $isRealValue($valuesByLocale[$thaiLocaleId] ?? null)) {
            $sourceLocaleId = $thaiLocaleId;
            $sourceValue = trim($valuesByLocale[$thaiLocaleId]);
        } else {
            foreach ($valuesByLocale as $localeId => $value) {
                if (is_int($localeId) && $isRealValue($value)) {
                    $sourceLocaleId = $localeId;
                    $sourceValue = trim((string) $value);
                    break;
                }
            }
        }

        $missingLocaleIds = [];
        foreach ($localeList as $locale) {
            if ($locale['id'] === $sourceLocaleId) {
                continue;
            }

            $value = $valuesByLocale[$locale['id']] ?? null;
            $isDuplicateOfSource = $sourceValue !== '' && trim((string) $value) === $sourceValue;

            if ($isDuplicateOfSource || $this->isProductValueMissing($value, $sku, $isNameAttribute)) {
                $missingLocaleIds[] = $locale['id'];
            }
        }

        return ['sourceLocaleId' => $sourceLocaleId, 'sourceValue' => $sourceValue, 'missingLocaleIds' => $missingLocaleIds];
    }

    /**
     * คำนวณเปอร์เซ็นต์ความครบถ้วนของการแปลของแต่ละ product สำหรับคอลัมน์
     * "Translation" ในกริด product — ใช้กฎเดียวกับ missingTranslations()
     * (locale-based attribute ทุกตัวที่ถูก assign ให้ family ของ product นั้น;
     * pname นับเสมอต่อให้ไม่มี source เลยก็ตาม, attribute ตัวอื่นนับก็ต่อเมื่อ
     * มีค่าจริงอย่างน้อยหนึ่งค่าให้แปลออกไปได้; scope global/bulk-import ของ
     * ภาษาไทยถือเป็นค่าไทยจริง) แยกเป็น pass ของหน้านี้เองต่างหาก แทนที่จะ
     * ใช้ loop เดิมของ missingTranslations() ซ้ำ เพราะตัวนั้นถูกออกแบบมาให้
     * สแกน catalog *ทั้งหมด* แบบ batch — ซึ่งถูกตรงนั้นเพราะรันแค่ครั้งเดียว
     * ต่อการเปิดดูรายงาน แต่จะสิ้นเปลืองถ้ามาใช้ตรงนี้ที่ index() รันซ้ำทุก
     * ครั้งที่โหลด/sort/filter กริด สำหรับแค่ ~25-100 แถวต่อครั้งเท่านั้น
     *
     * @param  \Illuminate\Support\Collection<int, Product>  $products
     * @return array<int, int|null> product_id => เปอร์เซ็นต์ที่แปลแล้ว (0-100) หรือ null ถ้าไม่มีอะไรให้วัด (เปิดใช้แค่ locale เดียว หรือ family ไม่มี locale-based attribute ที่เกี่ยวข้องเลย)
     */
    private function translationCompletenessByProduct(Collection $products): array
    {
        $locales = Locale::active();
        $localeList = $locales->map(fn ($locale) => ['id' => $locale->id])->all();
        if (count($localeList) < 2) {
            return $products->mapWithKeys(fn (Product $p) => [$p->id => null])->all();
        }

        $nameAttributeId = Attribute::idForCode('pname');
        $thaiLocaleId = Locale::idForCode('th');
        $localeBasedAttributeIds = Attribute::where('is_locale_based', true)->pluck('id')->all();

        $familyIds = $products->pluck('family_id')->filter()->unique();
        $familyAttributeIdsByFamily = FamilyAttribute::whereIn('family_id', $familyIds)
            ->whereIn('attribute_id', $localeBasedAttributeIds)
            ->get(['family_id', 'attribute_id'])
            ->groupBy('family_id')
            ->map(fn ($rows) => $rows->pluck('attribute_id')->all());
        $familiesWithAnyAssignment = FamilyAttribute::whereIn('family_id', $familyIds)->pluck('family_id')->unique()->all();

        $rowsByProductAttribute = [];
        if (! empty($localeBasedAttributeIds)) {
            $rows = DB::table('product_values')
                ->whereIn('product_id', $products->pluck('id'))
                ->whereIn('attribute_id', $localeBasedAttributeIds)
                ->whereNull('channel_id')
                ->where(fn ($query) => $query->whereIn('locale_id', $locales->pluck('id'))->orWhereNull('locale_id'))
                ->select('product_id', 'attribute_id', 'locale_id', 'value')
                ->get();
            foreach ($rows as $row) {
                $rowsByProductAttribute[$row->product_id][$row->attribute_id][$row->locale_id ?? 'global'] = $row->value;
            }
        }

        $result = [];
        foreach ($products as $product) {
            $applicableIds = $familyAttributeIdsByFamily->get($product->family_id);
            if ($applicableIds === null) {
                $applicableIds = in_array($product->family_id, $familiesWithAnyAssignment, true) ? [] : $localeBasedAttributeIds;
            }

            if (empty($applicableIds)) {
                $result[$product->id] = null;

                continue;
            }

            $productRows = $rowsByProductAttribute[$product->id] ?? [];
            $totalChecks = 0;
            $missingChecks = 0;

            foreach ($applicableIds as $attributeId) {
                $isNameAttribute = $attributeId === $nameAttributeId;
                $valuesByLocale = $this->foldGlobalValueIntoThai($productRows[$attributeId] ?? [], $thaiLocaleId);
                $coverage = $this->resolveAttributeCoverage($valuesByLocale, $localeList, $product->sku, $isNameAttribute, $thaiLocaleId);

                if (! $isNameAttribute && $coverage['sourceLocaleId'] === null) {
                    // ไม่มี source ให้ attribute นี้เลยสักที่ — ไม่ใช่ปัญหา
                    // การแปล (ไม่มีอะไรให้แปลออกไปตั้งแต่แรก) เลยไม่นับรวม
                    // เข้าตัวหารด้วย เหมือนกับที่ missingTranslations() ข้าม
                    // ด้วย requireSource
                    continue;
                }

                $checksForAttribute = count($localeList) - ($coverage['sourceLocaleId'] !== null ? 1 : 0);
                $totalChecks += $checksForAttribute;
                $missingChecks += count($coverage['missingLocaleIds']);
            }

            $result[$product->id] = $totalChecks > 0 ? (int) round(($totalChecks - $missingChecks) / $totalChecks * 100) : null;
        }

        return $result;
    }

    /**
     * locale-based attribute id ที่เกี่ยวข้องกับ $familyId — ใช้ข้อจำกัด
     * เดียวกับที่ missingTranslations() ใช้ (แต่ตัวนั้น batch ไว้สำหรับสแกน
     * ทั้ง catalog): เอาเฉพาะ attribute ที่ถูก assign ให้ family นั้นจริงๆ
     * ผ่าน FamilyAttribute โดย fallback ไปใช้ทุก locale-based attribute เมื่อ
     * family ไม่มีการ assign attribute เลยสักตัว เหมือนกับ fallback
     * "ไม่มีการ assign -> โชว์ system attribute ทั้งหมด" ของ edit() ตรงนี้
     * query แยกเป็นรายตัว family (ไม่ batch) เพราะ action translate ด้านล่าง
     * แตะแค่ product เดียวหรือไม่กี่ตัวที่เลือกไว้ชัดเจน ไม่ใช่ทั้ง catalog
     */
    private function applicableLocaleBasedAttributeIds(?int $familyId, Collection $localeBasedAttributeIds): Collection
    {
        $assigned = FamilyAttribute::where('family_id', $familyId)
            ->whereIn('attribute_id', $localeBasedAttributeIds)
            ->pluck('attribute_id');

        if ($assigned->isNotEmpty()) {
            return $assigned;
        }

        $familyHasAnyAssignment = FamilyAttribute::where('family_id', $familyId)->exists();

        return $familyHasAnyAssignment ? collect() : $localeBasedAttributeIds;
    }

    /**
     * สั่งคิวการแปลด้วย AI ให้กับทุก locale-based attribute (ที่เกี่ยวข้องกับ
     * family ของแต่ละ product) ที่ยังขาดค่าจริงในหนึ่ง locale ขึ้นไป — สั่ง
     * AutoTranslateProductValueJob หนึ่งงานต่อหนึ่ง attribute ไม่ใช่ต่อ
     * locale เพราะ AttributeAutoTranslator::fillMissingProductValue() เติม
     * ทุก locale ที่ขาดของ attribute นั้นให้ในคราวเดียวอยู่แล้ว ใช้ร่วมกัน
     * ระหว่าง action "Translate" แบบทีละ product และแบบ bulk บนรายงาน
     * Missing Translations
     *
     * @param  Collection<int, Product>  $products
     * @return array{queued: int, missingWithNoSource: int} queued = จำนวนงานที่
     *         ถูกสั่งจริงๆ; missingWithNoSource = จำนวน attribute ที่มี
     *         locale ขาดอยู่ แต่ไม่มี locale ไหนถืออยู่ที่มีค่าจริงให้แปล
     *         ออกไปได้เลย (locale-based attribute ทุกตัวว่างเปล่า/เป็นแค่
     *         placeholder) — ผู้เรียกใช้ค่านี้แยกกรณี "แปลครบแล้ว" ออกจาก
     *         "ติดอยู่ ต้องพิมพ์ค่าใส่เองก่อน" ตอนที่ queued เป็น 0
     */
    private function queueProductTranslationJobs(Collection $products): array
    {
        $localeBasedAttributeIds = Attribute::where('is_locale_based', true)->pluck('id');
        $nameAttributeId = Attribute::idForCode('pname');
        $thaiLocaleId = Locale::idForCode('th');
        $localeList = Locale::active()->map(fn ($locale) => ['id' => $locale->id])->all();
        $queued = 0;
        $missingWithNoSource = 0;

        foreach ($products as $product) {
            $applicableAttributeIds = $this->applicableLocaleBasedAttributeIds($product->family_id, $localeBasedAttributeIds);
            if ($applicableAttributeIds->isEmpty()) {
                continue;
            }

            // รวมแถวที่ locale_id เป็น NULL ด้วย (scope global/bulk-import
            // ที่จะถูก fold เข้ากับภาษาไทยด้านล่าง) — ไม่ใช่แค่แถวของ
            // locale ที่เปิดใช้งานอยู่เท่านั้น ดู docblock ของ
            // foldGlobalValueIntoThai()
            $valuesByAttribute = ProductValue::where('product_id', $product->id)
                ->whereIn('attribute_id', $applicableAttributeIds)
                ->whereNull('channel_id')
                ->get(['attribute_id', 'locale_id', 'value'])
                ->groupBy('attribute_id');

            foreach ($applicableAttributeIds as $attributeId) {
                $rawValuesByLocale = [];
                foreach ($valuesByAttribute->get($attributeId) ?? [] as $row) {
                    $rawValuesByLocale[$row->locale_id ?? 'global'] = $row->value;
                }
                $valuesByLocale = $this->foldGlobalValueIntoThai($rawValuesByLocale, $thaiLocaleId);
                $isNameAttribute = $attributeId === $nameAttributeId;

                $coverage = $this->resolveAttributeCoverage($valuesByLocale, $localeList, $product->sku, $isNameAttribute, $thaiLocaleId);
                if (empty($coverage['missingLocaleIds'])) {
                    continue;
                }

                if ($coverage['sourceLocaleId'] === null || $coverage['sourceValue'] === '') {
                    $missingWithNoSource++;

                    continue;
                }

                AutoTranslateProductValueJob::dispatch($product->id, $attributeId, $coverage['sourceLocaleId'], $coverage['sourceValue']);
                $queued++;
            }
        }

        return ['queued' => $queued, 'missingWithNoSource' => $missingWithNoSource];
    }

    /**
     * แอ็กชัน "Translate" ของแต่ละสินค้า บนหน้ารายงาน Missing Translations
     */
    public function queueMissingTranslations(Product $product): RedirectResponse
    {
        $result = $this->queueProductTranslationJobs(collect([$product]));

        if ($result['queued'] > 0) {
            return back()->with('success', "Queued {$result['queued']} field(s) for translation.");
        }

        return back()->with(
            $result['missingWithNoSource'] > 0 ? 'error' : 'success',
            $result['missingWithNoSource'] > 0
                ? 'Nothing to translate — no source value found in any language yet. Type a value into at least one language first.'
                : 'This product is already fully translated.'
        );
    }

    /**
     * แอ็กชัน "Translate selected" แบบ bulk บนหน้ารายงาน Missing Translations —
     * เวลาติ๊กเลือกสินค้าในรายงานแล้วกดปุ่มนี้ จะส่ง product id ที่ติ๊กไว้มาที่นี่
     */
    public function queueMissingTranslationsBulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_ids' => ['required', 'array', 'min:1'],
            'product_ids.*' => ['integer', 'exists:products,id'],
        ]);

        $products = Product::whereIn('id', $validated['product_ids'])->get(['id', 'sku', 'family_id']);
        $result = $this->queueProductTranslationJobs($products);

        return back()->with('success', "Queued {$result['queued']} field(s) for translation across {$products->count()} product(s).");
    }

    /**
     * ค้นหาว่าสินค้าอยู่ในหมวดหมู่ไหนบ้าง โดยใช้ SKU (หรือบางส่วนของ SKU) —
     * ทุกสินค้าที่ `sku` ตรงกับที่ค้นหา จะคืนพาธเต็มตั้งแต่ root ไปจนถึง leaf
     * ของทุกหมวดหมู่ที่ผูกอยู่ผ่าน `product_category` ไม่ใช่แค่หมวดแม่ตัวบนสุด
     */
    public function categoryPathBySku(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sku' => ['required', 'string', 'min:1'],
        ]);

        $products = Product::where('sku', 'like', '%'.$validated['sku'].'%')->get(['id', 'sku']);

        $names = $this->resolveProductNamesInCurrentLocale($products->pluck('id'));

        $productCategoryIds = DB::table('product_category')
            ->whereIn('product_id', $products->pluck('id'))
            ->get(['product_id', 'category_id'])
            ->groupBy('product_id');

        $categoriesById = Category::all(['id', 'code', 'name', 'parent_id'])->keyBy('id');

        $buildPath = function (int $categoryId) use ($categoriesById): array {
            $path = [];
            $category = $categoriesById->get($categoryId);

            while ($category) {
                array_unshift($path, ['id' => $category->id, 'code' => $category->code, 'name' => $category->name]);
                $category = $category->parent_id ? $categoriesById->get($category->parent_id) : null;
            }

            return $path;
        };

        // ถ้าสินค้าถูกติ๊กหลายระดับในหมวดหมู่สายเดียวกัน (ตัวเลือกหมวดหมู่จะ
        // auto-check ทุกหมวดแม่ขึ้นไปจนถึง root ให้เอง) ถ้าไม่กรองออกก็จะโชว์
        // พาธซ้ำๆ หลายบรรทัด ซึ่งเป็นแค่พาธเดิมที่สั้นกว่ากันไปเรื่อยๆ เอาจริงๆ
        // แค่หมวดที่ลึกที่สุดในแต่ละสายก็พอแล้ว เพราะพาธของมันมีหมวดแม่ครบอยู่แล้ว
        // เลยต้องตัด id ที่เป็นหมวดแม่ของหมวดอื่นทิ้งไป
        $ancestorIdsOf = function (int $categoryId) use ($categoriesById): array {
            $ids = [];
            $category = $categoriesById->get($categoryId);
            while ($category?->parent_id) {
                $ids[] = $category->parent_id;
                $category = $categoriesById->get($category->parent_id);
            }

            return $ids;
        };

        $results = $products->map(function (Product $product) use ($names, $productCategoryIds, $buildPath, $ancestorIdsOf) {
            $categoryIds = $productCategoryIds->get($product->id, collect())->pluck('category_id')->map(fn ($id) => (int) $id);
            $allAncestorIds = $categoryIds->flatMap($ancestorIdsOf)->unique();
            $leafCategoryIds = $categoryIds->diff($allAncestorIds);

            return [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => ($names[$product->id] ?? null) ?: $product->sku,
                'categories' => $leafCategoryIds->map(fn ($id) => $buildPath($id))->values(),
            ];
        })->values();

        return response()->json([
            'query' => $validated['sku'],
            'results' => $results,
        ]);
    }

    /**
     * "quick export" แบบ synchronous สำหรับตาราง product — ดาวน์โหลดไฟล์ทันที
     * ไม่ต้องผ่านขั้นตอน export-config/job-tracker เหมือนปกติ จะ export
     * เฉพาะแถวที่ติ๊กเลือกไว้ถ้ามี ไม่งั้นก็ export ตามฟิลเตอร์ค้นหาปัจจุบัน
     */
    public function quickExport(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'format' => ['required', 'in:csv,xls,xlsx'],
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer'],
            'search' => ['nullable', 'string'],
            'columns' => ['nullable', 'array'],
            'columns.*' => ['string'],
            'types' => ['nullable', 'array'],
            'types.*' => ['in:simple,configurable'],
            'category_id' => ['nullable', 'integer'],
        ]);

        $format = $validated['format'];
        $ids = $validated['ids'] ?? [];

        $allColumns = (new ProductRowExporter($request->user()))->columns();
        // ถ้าไม่ได้เลือกคอลัมน์มา (ว่างหรือไม่ส่งมาเลย) ก็ถือว่าเอาทุกคอลัมน์
        // เหมือนชุดเต็มของ ProductRowExporter — ถ้าเลือกมาก็เอาแค่ที่ตรงกัน
        // (เรียงตามลำดับใน $allColumns โดย sku จะถูกเก็บไว้เสมอ เพื่อให้ทุกแถว
        // ที่ export ออกมายังมี identity อยู่ ถึงแม้แอดมินจะไม่ได้ติ๊ก sku ไว้)
        $selectedColumns = ! empty($validated['columns'])
            ? array_values(array_intersect($allColumns, $validated['columns']))
            : $allColumns;
        if (! in_array('sku', $selectedColumns, true)) {
            array_unshift($selectedColumns, 'sku');
        }

        $attributeCodes = array_slice($allColumns, 4);
        $attributesByCode = Attribute::whereIn('code', $attributeCodes)->get()->keyBy('code');

        $query = Product::with('family')->orderBy('id');
        if (! empty($ids)) {
            // ถ้ามีการติ๊กเลือกแถวมาชัดเจน หมายความว่าเอาแค่สินค้ากลุ่มนี้เท่านั้น —
            // search กับฟิลเตอร์ type/category ด้านล่างเป็นแค่วิธีเลือก "ชุด"
            // สินค้าอีกแบบหนึ่งในระดับ dialog ไม่ใช่เงื่อนไขเสริมที่ซ้อนทับกับ
            // การเลือกที่ชัดเจนอยู่แล้ว เลยข้ามทั้งหมดไปเมื่อมี IDs ส่งมา
            // (ตรงกับฝั่ง frontend ที่จะหยุดส่งค่าพวกนี้ด้วยเช่นกัน
            // — ดูที่ handleQuickExport())
            $query->whereIn('id', $ids);
        } else {
            if (! empty($validated['search'])) {
                $query->where('sku', 'like', '%'.$validated['search'].'%');
            }

            if (! empty($validated['types'])) {
                $query->whereIn('type', $validated['types']);
            }

            if (! empty($validated['category_id'])) {
                $query->whereHas('categories', fn ($q) => $q->where('categories.id', $validated['category_id']));
            }
        }

        // ใช้วิธี chunk แทนการ query ProductValue ทีละสินค้า (ปัญหา N+1 ที่ทำให้
        // export ไฟล์ใหญ่ๆ ช้ามาก) — ดึงค่ามาเป็นแบทช์ครั้งละ 500 สินค้า
        // ในขณะที่ `cursor()` ยังช่วยคุมไม่ให้สินค้าทั้งหมดโหลดเข้า memory รวดเดียว
        $rows = (function () use ($query, $attributesByCode, $selectedColumns) {
            foreach ($query->cursor()->chunk(500) as $products) {
                $valuesByProduct = ProductValue::whereIn('product_id', $products->pluck('id'))
                    ->whereNull('channel_id')
                    ->whereNull('locale_id')
                    ->get(['product_id', 'attribute_id', 'value'])
                    ->groupBy('product_id');

                foreach ($products as $product) {
                    $values = $valuesByProduct->get($product->id, collect())->pluck('value', 'attribute_id');

                    $row = array_intersect_key([
                        'sku' => $product->sku,
                        'family_code' => $product->family?->code ?? '',
                        'type' => $product->type,
                        'enabled' => $product->enabled ? '1' : '0',
                    ], array_flip($selectedColumns));

                    foreach ($attributesByCode as $code => $attribute) {
                        if (in_array($code, $selectedColumns, true)) {
                            $row[$code] = $values->get($attribute->id, '');
                        }
                    }

                    yield $row;
                }
            }
        })();

        Storage::disk('local')->makeDirectory('tmp-exports');
        $tempRelativePath = 'tmp-exports/'.Str::uuid().'.'.$format;
        $tempAbsolutePath = Storage::disk('local')->path($tempRelativePath);

        SpreadsheetWriter::write($tempAbsolutePath, $format, $selectedColumns, $rows, ',');

        $downloadName = 'products_'.now()->format('Ymd_His').'.'.$format;

        return response()->download($tempAbsolutePath, $downloadName)->deleteFileAfterSend(true);
    }

    private function formatAttributeValue(Attribute $attribute, ?string $rawValue): mixed
    {
        return AttributeValueFormatter::format($attribute, $rawValue);
    }

    /**
     * ลบไฟล์บน public disk ที่ถูกตัดออกจากการเปลี่ยนแปลงค่าจริงๆ
     * ค่าแบบ image/file เป็น path string เดี่ยวๆ ดังนั้นแค่มีการเปลี่ยนค่าก็ลบ
     * ไฟล์เก่าทิ้งไปเลย ส่วนค่าแบบ gallery เป็น array ของ path เข้ารหัสแบบ JSON
     * และตอนนี้ frontend เปิดให้ผู้ใช้เก็บรูปเดิมส่วนใหญ่ไว้ พร้อมเพิ่ม/ลบทีละรูป
     * ได้ — เลยจะลบเฉพาะ path ที่มีอยู่ใน $oldValue แต่ไม่มีใน $newValue เท่านั้น
     * แทนที่จะลบชุดเก่าทั้งหมด
     */
    private function deleteRemovedAttributeFiles(Attribute $attribute, string $oldValue, ?string $newValue): void
    {
        if ($attribute->type === 'gallery') {
            $oldPaths = json_decode($oldValue, true);
            $newPaths = $newValue !== null ? json_decode($newValue, true) : [];
            $removedPaths = array_diff((array) $oldPaths, (array) $newPaths);

            foreach ($removedPaths as $path) {
                if ($path) {
                    Storage::disk('public')->delete($path);
                }
            }

            return;
        }

        Storage::disk('public')->delete($oldValue);
    }

    /**
     * เช็คความยาว (≤5 นาที) และขนาด (≥480×480px) ของไฟล์สำหรับ attribute type
     * `video` — Laravel validator ไม่มี rule สำเร็จรูปให้ทั้งสองอย่างนี้ และการ
     * จะอ่านค่าพวกนี้ได้ต้องแกะ metadata ของไฟล์ MP4 จริงๆ ซึ่ง getID3
     * (james-heinrich/getid3 เป็น PHP ล้วนๆ ไม่ต้องพึ่ง ffmpeg binary) อ่านให้
     * โดยตรงจากไฟล์บนดิสก์เลย จะคืนข้อความแจ้งผู้ใช้ตามเงื่อนไขแรกที่ผิดพลาด
     * หรือคืน null ถ้าไฟล์ผ่านเกณฑ์ทั้งหมด
     *
     * ทำงานคู่กับการเช็คฝั่ง client ใน edit.tsx (ใช้ metadata จาก <video> ของ
     * browser) ซึ่งจะเช็คก่อนและดักไฟล์ที่ผิดเงื่อนไขได้ส่วนใหญ่ก่อนที่จะถูกส่งมา
     * ด้วยซ้ำ แต่ตัวนี้คือด่านสุดท้ายที่ดักรีเควสต์ที่ยิงตรงมาที่ endpoint
     * (ข้าม UI ไปเลย) ไม่ให้หลุดผ่านไปได้
     */
    private function validateVideoConstraints(UploadedFile $file): ?string
    {
        $info = (new \getID3)->analyze($file->getRealPath());

        $duration = $info['playtime_seconds'] ?? null;
        if ($duration !== null && $duration > 300) {
            return 'Video must be 5 minutes or shorter.';
        }

        $width = $info['video']['resolution_x'] ?? null;
        $height = $info['video']['resolution_y'] ?? null;
        if ($width !== null && $height !== null && ($width < 480 || $height < 480)) {
            return 'Video must be at least 480x480px.';
        }

        return null;
    }

    /**
     * เช็คขนาดขั้นต่ำของไฟล์สำหรับ attribute type `image`/`gallery` —
     * ใช้แนวคิดและรูปแบบเดียวกับ validateVideoConstraints() ด้านบน แต่ใช้
     * getimagesize() (มีมากับ PHP อยู่แล้ว ไม่ต้องพึ่ง dependency เพิ่มแค่เพื่อ
     * เช็คขนาด) แทน getID3 ฟังก์ชันนี้จะถูกเรียกก็ต่อเมื่อ rule `image` ของ
     * Laravel ผ่านมาแล้วเท่านั้น ดังนั้น $file ที่ได้จะเป็นไฟล์รูปจริงที่อ่านได้เสมอ
     */
    private function validateImageConstraints(UploadedFile $file): ?string
    {
        $size = @getimagesize($file->getRealPath());
        [$width, $height] = $size !== false ? $size : [null, null];

        if ($width !== null && $height !== null && ($width < self::MIN_IMAGE_DIMENSION || $height < self::MIN_IMAGE_DIMENSION)) {
            return sprintf('Image must be at least %dx%dpx.', self::MIN_IMAGE_DIMENSION, self::MIN_IMAGE_DIMENSION);
        }

        return null;
    }

    /**
     * รายการ attribute ที่ใช้กำหนดแกน variant ของสินค้าแบบ configurable ได้
     * (ต้องมี options ให้เลือก) แต่ละตัวจะพ่วง family_ids มาด้วย เพื่อให้ตัวเลือก
     * variant-attribute ในหน้า Create/Edit จำกัดตัวเองให้เหลือแค่ attribute ที่
     * ถูก assign ให้ family ที่เลือกไว้จริงๆ — ไม่งั้นจะมีตัวเลือกที่ไม่เกี่ยวกับ
     * family ของสินค้าโผล่มาแบบเงียบๆ และไม่โผล่ในกลุ่ม attribute ที่กรองตาม
     * family ของหน้า Edit
     */
    private function configurableAttributeOptions()
    {
        return Attribute::with(['options', 'families:id'])
            ->has('options')
            ->select('id', 'code', 'name', 'type')
            ->get()
            ->map(function (Attribute $attribute) {
                $attribute->family_ids = $attribute->families->pluck('id');

                return $attribute;
            });
    }

    public function create(): Response
    {
        // เรียง family ที่ถูกใช้บ่อยที่สุดไว้อันดับแรก เพื่อให้ค่าเริ่มต้นของฟอร์ม
        // create (families[0]) เป็น family ที่สินค้าถูก assign ไปมากที่สุดจริงๆ
        // แทนที่จะเป็นลำดับสุ่มๆ ตามที่ถูก insert ลง DB ก่อนหลัง
        $families = AttributeFamily::withCount('products')
            ->orderByDesc('products_count')
            ->orderBy('name')
            ->get(['id', 'code', 'name']);

        $attributes = $this->configurableAttributeOptions();

        return Inertia::render('catalog/products/create', [
            'families' => $families,
            'attributes' => $attributes,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'sku' => ['required', 'string', 'max:100', 'unique:products,sku'],
            'family_id' => ['required', 'exists:attribute_families,id'],
            'type' => ['required', 'in:simple,configurable'],
            'enabled' => ['required', 'boolean'],
            'configurable_attributes' => ['nullable', 'array'],
            'configurable_attributes.*' => ['integer', 'exists:attributes,id'],
            'variants' => ['nullable', 'array'],
            // 'distinct' ดัก SKU ของ variant สองแถวที่ generate มาชนกันเอง ส่วน
            // notIn ดัก SKU ของ variant ที่ไปชนกับ SKU ของสินค้าแม่เอง — ทั้งสอง
            // เคสนี้เมื่อก่อนหลุดผ่าน `unique:products,sku` ไปได้ (เพราะมันเช็ค
            // แค่แถวที่บันทึกลง DB ไปแล้ว) แล้วไปชนกับ unique constraint ของ DB
            // ตรงๆ ในลูปด้านล่าง ทำให้เกิด QueryException ดิบๆ (500) แทนที่จะเป็น
            // validation error ที่อ่านรู้เรื่อง
            'variants.*.sku' => [
                'required_if:type,configurable',
                'string',
                'max:100',
                'distinct',
                'unique:products,sku',
                Rule::notIn([$request->input('sku')]),
            ],
            'variants.*.price' => ['nullable', 'numeric'],
            'variants.*.qty' => ['nullable', 'integer'],
            'variants.*.attributes' => ['nullable', 'array'],
        ]);

        // variants.*.attributes เป็น associative map ที่ key คือ attribute id
        // (`{attributeId: value}`) ซึ่ง rule แบบ dot-notation ของ Laravel เช็คแค่
        // "value" ไม่ได้เช็ค "key" — ถ้า attribute id ที่ส่งมาไม่มีจริง เมื่อก่อน
        // จะไปชนกับ FK constraint ของ product_values.attribute_id ตรงๆ ทำให้
        // เกิด raw 500 แทนที่จะเป็น validation error
        $validator->after(function ($validator) use ($request) {
            $validAttributeIds = null;

            foreach ((array) $request->input('variants', []) as $index => $variant) {
                $attributeIds = array_keys((array) ($variant['attributes'] ?? []));
                if (empty($attributeIds)) {
                    continue;
                }

                $validAttributeIds ??= Attribute::pluck('id')->map(fn ($id) => (string) $id)->all();
                $unknown = array_diff(array_map('strval', $attributeIds), $validAttributeIds);

                foreach ($unknown as $badId) {
                    $validator->errors()->add("variants.{$index}.attributes", "Unknown attribute id \"{$badId}\".");
                }
            }
        });

        $validated = $validator->validate();

        $parentProduct = null;

        DB::transaction(function () use ($validated, $request, &$parentProduct) {
            $parentProduct = Product::create([
                'sku' => $validated['sku'],
                'family_id' => $validated['family_id'],
                'type' => $validated['type'],
                'enabled' => $validated['enabled'],
                'configurable_attributes' => $validated['configurable_attributes'] ?? null,
                'created_by' => $request->user()?->id,
                'updated_by' => $request->user()?->id,
            ]);

            $parentProduct->applySmartDefaults();

            if ($validated['type'] === 'configurable' && ! empty($validated['variants'])) {
                $priceAttr = Attribute::where('code', 'price')->first();
                $qtyAttr = Attribute::where('code', 'qty')->first();

                foreach ($validated['variants'] as $variantData) {
                    $childProduct = Product::create([
                        'sku' => $variantData['sku'],
                        'parent_id' => $parentProduct->id,
                        'family_id' => $parentProduct->family_id,
                        'type' => 'simple',
                        'enabled' => $parentProduct->enabled,
                        'created_by' => $request->user()?->id,
                        'updated_by' => $request->user()?->id,
                    ]);

                    $childProduct->applySmartDefaults();

                    // บันทึกราคา
                    if ($priceAttr && isset($variantData['price']) && $variantData['price'] !== '') {
                        ProductValue::create([
                            'product_id' => $childProduct->id,
                            'attribute_id' => $priceAttr->id,
                            'value' => (string) $variantData['price'],
                        ]);
                    }

                    // บันทึกจำนวน
                    if ($qtyAttr && isset($variantData['qty']) && $variantData['qty'] !== '') {
                        ProductValue::create([
                            'product_id' => $childProduct->id,
                            'attribute_id' => $qtyAttr->id,
                            'value' => (string) $variantData['qty'],
                        ]);
                    }

                    // บันทึก attribute ของ combination (เช่น รหัส/ID ของสี, ไซซ์)
                    if (! empty($variantData['attributes'])) {
                        foreach ($variantData['attributes'] as $attrId => $attrVal) {
                            if ($attrVal !== null && $attrVal !== '') {
                                ProductValue::create([
                                    'product_id' => $childProduct->id,
                                    'attribute_id' => $attrId,
                                    'value' => (string) $attrVal,
                                ]);
                            }
                        }
                    }
                }

                $newVariantValues = $this->variantValueSnapshot($parentProduct);
                $this->recordProductValueChanges($parentProduct, [], $newVariantValues, 'variant_values_updated');
            }
        });

        // ต่างจาก update()/destroy() ตรงที่ตอนสร้างสินค้าใหม่จะไม่มีการยิง
        // websocket push ของ ProductDataChanged (สินค้าที่เพิ่งสร้างจะมีความ
        // หมายก็ต่อเมื่อค้นเจอ/แก้ไขได้จริงๆ เท่านั้น) แต่ storefront cache
        // ก็ยังต้องรู้เรื่องนี้อยู่ดี — ดูที่ Product::bumpStorefrontVersion()
        Product::bumpStorefrontVersion();

        // พาผู้ใช้ไปหน้า Edit เลย — เพราะฟอร์ม Create เก็บแค่ SKU/family/type/
        // variants เท่านั้น ถ้าไม่ทำแบบนี้ผู้ใช้ต้องไปหาสินค้าที่เพิ่งสร้างเองในตาราง
        // ก่อนถึงจะเริ่มใส่เนื้อหาจริงๆ ได้ (ชื่อ, รูป, หมวดหมู่, ...) จะกลับไปหน้า
        // index แทนก็ต่อเมื่อ role นั้นสร้างสินค้าได้แต่แก้ไขไม่ได้เท่านั้น
        $user = $request->user();
        if ($user && $user->hasPermission('products', 'edit_products')) {
            return to_route('catalog.products.edit', $parentProduct)->with('success', 'Product created successfully.');
        }

        return to_route('catalog.products.index')->with('success', 'Product created successfully.');
    }

    /**
     * สร้างสินค้าใหม่โดย copy จากสินค้าเดิม: family/type/ค่า attribute/หมวดหมู่
     * เหมือนกันหมด แต่ใช้ SKU ใหม่ที่ auto-generate ขึ้นมา จะเริ่มต้นเป็นสถานะ
     * disabled เสมอ (ไม่ว่าตัวต้นฉบับจะเปิดหรือปิดอยู่ก็ตาม) เพื่อไม่ให้สินค้า
     * ที่ยังไม่ได้ตรวจสอบดันไปออนไลน์โดยไม่ตั้งใจภายใต้ SKU ที่สอง — ผู้ใช้ต้อง
     * ไปตรวจสอบ/ปรับแก้ที่หน้า Edit เอง (ซึ่งจะพาไปที่นั่นต่อ) แล้วค่อยเปิดใช้งาน
     * เอง ถ้าเป็นสินค้าแบบ configurable ก็จะ copy variant ไปด้วย โดยแต่ละตัว
     * ถูก duplicate ด้วยวิธีเดียวกันแล้วผูก parent ใหม่ให้เป็นสินค้าที่เพิ่งสร้าง
     */
    public function duplicate(Request $request, Product $product): RedirectResponse
    {
        $duplicate = DB::transaction(function () use ($product, $request) {
            $newProduct = CodeGenerator::createWithRetry(
                'products',
                $product->sku.'-copy',
                fn ($sku) => Product::create([
                    'sku' => $sku,
                    'family_id' => $product->family_id,
                    'type' => $product->type,
                    'enabled' => false,
                    'configurable_attributes' => $product->configurable_attributes,
                    'created_by' => $request->user()?->id,
                    'updated_by' => $request->user()?->id,
                ]),
                column: 'sku',
            );

            $this->copyProductData($product, $newProduct);

            if (strtolower($product->type) === 'configurable') {
                foreach (Product::where('parent_id', $product->id)->get() as $variant) {
                    $newVariant = CodeGenerator::createWithRetry(
                        'products',
                        $variant->sku.'-copy',
                        fn ($sku) => Product::create([
                            'sku' => $sku,
                            'parent_id' => $newProduct->id,
                            'family_id' => $variant->family_id,
                            'type' => 'simple',
                            'enabled' => false,
                            'created_by' => $request->user()?->id,
                            'updated_by' => $request->user()?->id,
                        ]),
                        column: 'sku',
                    );

                    $this->copyProductData($variant, $newVariant);
                }
            }

            return $newProduct;
        });

        AuditLog::record('duplicated', $duplicate, null, [
            'duplicated_from_id' => $product->id,
            'duplicated_from_sku' => $product->sku,
        ]);

        return to_route('catalog.products.edit', $duplicate)
            ->with('success', "Duplicated as \"{$duplicate->sku}\" (disabled). Review and update before enabling.");
    }

    /**
     * Copy ค่า attribute และการ assign หมวดหมู่จาก $source ไปยัง $target
     * attribute ที่ตั้ง flag `is_unique` ไว้ (barcode_*, `pid`, ...) จะถูก
     * ข้ามไปโดยตั้งใจ — ถ้า copy ค่าไปตรงๆ จะทำให้ตัว duplicate มีค่า "unique"
     * เหมือนตัวต้นฉบับเป๊ะ ซึ่งไม่ว่าจะไม่มีความหมาย (สินค้าสองชิ้นใช้บาร์โค้ด
     * เดียวกัน) หรือผิดไปเลยก็ตาม ส่วน `pid` จะซ่อมตัวเองผ่าน applySmartDefaults()
     * (เรียกก่อน เพื่อให้การ copy ค่าที่ไม่ unique อย่าง `pname` ในขั้นตอนถัดไป
     * ยังเขียนทับค่าเริ่มต้น "= SKU" ของมันด้วยชื่อจริงจากต้นฉบับได้)
     */
    private function copyProductData(Product $source, Product $target): void
    {
        $target->applySmartDefaults();

        ProductValue::where('product_id', $source->id)
            ->whereHas('attribute', fn ($q) => $q->where('is_unique', false))
            ->get(['attribute_id', 'channel_id', 'locale_id', 'value'])
            ->each(fn (ProductValue $value) => ProductValue::updateOrCreate(
                [
                    'product_id' => $target->id,
                    'attribute_id' => $value->attribute_id,
                    'channel_id' => $value->channel_id,
                    'locale_id' => $value->locale_id,
                ],
                ['value' => $value->value]
            ));

        $categoryIds = $source->categories()->pluck('categories.id');
        if ($categoryIds->isNotEmpty()) {
            $target->categories()->sync($categoryIds);
        }
    }

    public function edit(Product $product): Response
    {
        return Inertia::render('catalog/products/edit', $this->buildProductFormProps($product));
    }

    /**
     * Read-only counterpart to edit() — same exact data (see
     * buildProductFormProps()), rendered by a separate page
     * (resources/js/pages/catalog/products/show.tsx) with every field
     * displayed as plain text/chips instead of form controls. update()
     * redirects here after a successful save so an admin sees a plain
     * confirmation of what was actually stored, without re-deriving a
     * second, possibly-drifting view of the same product from scratch.
     */
    public function show(Product $product): Response
    {
        return Inertia::render('catalog/products/show', $this->buildProductFormProps($product));
    }

    /**
     * อัปโหลดรูปเดี่ยวสำหรับฝังลงในเนื้อหา HTML ของ attribute แบบ rich-text
     * (textarea) โดยตรง — เช่นตอนกดปุ่มรูปภาพในตัวแก้ไขรายละเอียดสินค้า (ดู
     * resources/js/components/rich-text-editor.tsx) คนละกรณีกับไฟล์ของ
     * attribute ชนิด image/gallery ที่ update() จัดการอยู่แล้ว (ตัวนั้นเก็บ
     * ทั้ง value ของ attribute เป็น path เดียวหรือ JSON array ของ path)
     * เพราะรูปที่ฝังในเนื้อหาต้องได้ URL กลับมาทันทีเพื่อแทรกเข้า editor
     * ระหว่างที่ยังแก้ไขอยู่ ก่อนที่จะกด Save ฟอร์มทั้งหน้าด้วยซ้ำ
     */
    public function uploadDescriptionImage(Request $request, Product $product): JsonResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'image', 'max:4096'],
        ]);

        $path = $validated['image']->store('product-descriptions', 'public');

        return response()->json(['url' => Storage::url($path)]);
    }

    /**
     * Everything the Edit/Read product pages need — split out from edit()
     * (which used to build this inline) purely so show() can render the
     * exact same data read-only instead of maintaining a second, parallel
     * query path that could quietly drift out of sync with what edit() (and
     * therefore what a save through update() actually persists) considers
     * "this product's full data".
     */
    private function buildProductFormProps(Product $product): array
    {
        $families = AttributeFamily::select('id', 'code', 'name')->get();

        // ดึง pivot family_attributes ของ family ของสินค้านี้ ตามลำดับที่ตั้งไว้
        // ในหน้าแก้ไข Attribute Family
        $familyAttributes = FamilyAttribute::with(['attribute.options', 'attributeGroup'])
            ->where('family_id', $product->family_id)
            ->orderBy('sort_order')
            ->get();

        $user = auth()->user();

        // จัดกลุ่ม attribute แบบไดนามิกตาม attributeGroup
        $groupsData = [];
        foreach ($familyAttributes as $fa) {
            $group = $fa->attributeGroup;
            $attr = $fa->attribute;
            if (! $group || ! $attr) {
                continue;
            }

            // เช็คว่า user มีสิทธิ์ดูกลุ่ม attribute นี้หรือเปล่า
            if ($user && ! $this->canUserViewAttributeGroup($user, $group)) {
                continue;
            }

            // เช็คว่า user มีสิทธิ์ดู attribute ตัวนี้โดยเฉพาะหรือเปล่า
            if ($user && ! $this->canUserViewAttribute($user, $attr)) {
                continue;
            }

            $groupId = $group->id;
            if (! isset($groupsData[$groupId])) {
                $groupsData[$groupId] = [
                    'id' => $group->id,
                    'code' => $group->code,
                    'name' => $group->name ?: ucfirst($group->code),
                    // เก็บ label ของทุกภาษาไว้เลย เพื่อให้ frontend สลับภาษาที่แสดง
                    // ได้ทันที (หยิบจากตรงนี้) ไม่ต้องรอ round-trip ไปเซิร์ฟเวอร์
                    // เพื่อ resolve `name` ข้างบนใหม่ทุกครั้งที่เปลี่ยนภาษา
                    'translations' => $group->translations,
                    'attributes' => [],
                ];
            }
            $attr->editable = $this->canUserEditAttributeGroup($user, $group) && $this->canUserEditAttribute($user, $attr);
            $this->decorateOptionsWithMappedPlatforms($attr);
            $groupsData[$groupId]['attributes'][] = $attr;
        }

        // เอากลุ่มที่ว่างเปล่าออก (กลุ่มที่ไม่มี attribute ที่มองเห็นได้เลย)
        $groupsData = array_filter($groupsData, fn ($group) => ! empty($group['attributes']));

        // ถ้า family ของสินค้ายังไม่มี family attributes ที่ผูกไว้เลย ให้โชว์ system attribute ทั้งหมดไว้ในกลุ่ม General แทน
        // หมายเหตุ: ตรงนี้ต้องเช็คจาก attribute assignments ดิบๆ ของ family เอง ไม่ใช่เช็คจาก $groupsData
        // เพราะไม่งั้น family ที่มี attribute ผูกไว้จริง แต่ user ดันไม่มีสิทธิ์ดู จะเผลอไหลไปโชว์
        // system attribute ทั้งหมดแทน ทั้งที่ควรจะโชว์เป็นกลุ่มว่างเปล่าตามความถูกต้อง
        if ($familyAttributes->isEmpty()) {
            $allAttributes = Attribute::with('options')->get();

            // ถ้ามีการเช็คสิทธิ์ user ก็กรองตามนั้นด้วย
            if ($user) {
                $allAttributes = $allAttributes->filter(fn ($attr) => $this->canUserViewAttribute($user, $attr));
            }

            $allAttributes->each(function ($attr) use ($user) {
                $attr->editable = $this->canUserEditAttribute($user, $attr);
                $this->decorateOptionsWithMappedPlatforms($attr);
            });

            if ($allAttributes->isNotEmpty()) {
                $groupsData[] = [
                    'id' => 0,
                    'code' => 'general',
                    'name' => 'General',
                    'attributes' => $allAttributes->values()->all(),
                ];
            }
        } else {
            // $groupsData is already in the real, curated order at this point —
            // $familyAttributes was loaded ->orderBy('sort_order') above, and
            // group_id keys land in $groupsData in first-appearance order, so
            // this reflects exactly the drag-and-drop order set on the
            // Attribute Family edit page (resources/js/pages/catalog/
            // attribute-families/edit.tsx — see its handleReorderGroup()).
            //
            // A hardcoded ['general', 'specifications', ...] re-sort used to
            // run here, re-ranking groups by a fixed list matched on `code`.
            // That silently broke any family with a group whose code wasn't
            // in the list (e.g. a custom 'purchasing'/'accounting' group,
            // created via the group-management UI, no seeder entry) — such a
            // group always fell through to the same fallback rank, sorting it
            // ahead of 'tis_certification' ("Others") even when the user had
            // deliberately dragged "Others" below it. Removed rather than
            // extended: the real order was already correct and available;
            // the hardcoded list was strictly a second, conflicting source of
            // truth for the same thing.
            $groupsData = array_values($groupsData);
        }

        // โหลดค่าล่วงหน้าเฉพาะที่ไม่ผูก channel (global attribute) บวกกับ channel
        // ค่าเริ่มต้น ครบทุกภาษา ส่วนค่าของ channel อื่นจะโหลดทีหลังตอน user
        // สลับ channel selector ผ่าน GET .../attribute-values เพื่อไม่ให้
        // payload ตอนโหลดครั้งแรกใหญ่เกินไป
        $channels = Channel::cachedAll()->map(fn (Channel $c) => ['id' => $c->id, 'code' => $c->code, 'name' => $c->name]);
        $defaultChannelId = $channels->first()['id'] ?? null;

        // จัดกลุ่มลิสต์ channel แบบแบนๆ ตาม sales platform (Lazada, ...) สำหรับ
        // tree แบบพับเก็บได้ใน sidebar ของหน้า Edit Product — channel ที่ไม่มี shop
        // ผูกอยู่ (เช่น channel เว็บไซต์เริ่มต้น) จะตกไปอยู่กลุ่ม "Website" และ
        // ไม่มี shop_id เพราะไม่มีอะไรให้ publish checkbox ตอบด้วย
        $shopByChannelId = SalesPlatformShop::with('platform:id,name')
            ->whereNotNull('channel_id')
            ->get()
            ->keyBy('channel_id');

        // สถานะ live ที่ยืนยันแล้วของ shop ต่างๆ ของสินค้านี้ (ดูที่
        // LazadaProductSyncService::syncLiveStatus()) — แยกกันคนละเรื่องกับ
        // publishedShopIds ด้านล่าง ที่แปลว่า "ติ๊กว่าจะ publish" เฉยๆ ตัวนี้
        // ตอบคำถาม "เรา push อันนี้ไปแล้วหรือยัง?" เพื่อไม่ต้องกดปุ่ม Push
        // เพื่อรู้คำตอบเพียงอย่างเดียว — ดูที่ live badge ในแผง Sales Channels
        $liveStatusByShopId = DB::table('product_platform_shops')
            ->where('product_id', $product->id)
            ->where('status', 'live')
            ->get(['sales_platform_shop_id', 'last_synced_at'])
            ->keyBy('sales_platform_shop_id');

        $channelGroups = $channels
            ->map(function ($channel) use ($shopByChannelId, $liveStatusByShopId) {
                $shop = $shopByChannelId->get($channel['id']);
                $liveStatus = $shop ? $liveStatusByShopId->get($shop->id) : null;

                return [
                    'id' => $channel['id'],
                    'code' => $channel['code'],
                    'name' => $channel['name'],
                    'shop_id' => $shop?->id,
                    'platform' => $shop?->platform?->name ?? 'Website',
                    'is_live' => $liveStatus !== null,
                    'live_synced_at' => $liveStatus?->last_synced_at,
                ];
            })
            ->groupBy('platform')
            ->map(fn ($group, $platform) => ['platform' => $platform, 'channels' => $group->values()])
            ->values();

        $rawValues = ProductValue::where('product_id', $product->id)
            ->where(function ($q) use ($defaultChannelId) {
                $q->whereNull('channel_id');
                if ($defaultChannelId) {
                    $q->orWhere('channel_id', $defaultChannelId);
                }
            })
            ->get();

        $values = [];
        foreach ($rawValues as $val) {
            $channelKey = $val->channel_id ? (string) $val->channel_id : 'global';
            $localeKey = $val->locale_id ? (string) $val->locale_id : 'default';
            $values[$val->attribute_id][$channelKey][$localeKey] = $val->value;
        }

        $variantsData = [];
        if (strtolower($product->type) === 'configurable') {
            $priceAttrId = Attribute::idForCode('price');
            $qtyAttrId = Attribute::idForCode('qty');

            $variants = Product::where('parent_id', $product->id)->get();
            // รวมเป็น query เดียวแล้ว key ด้วย product_id แทนที่จะยิง
            // ProductValue::where('product_id', ...) แยกทีละ variant
            // ในลูปข้างล่าง — เดิมทำแบบนั้นจะกลายเป็น N+1 query สำหรับ
            // configurable product ที่มี N variant
            $variantValuesByProduct = ProductValue::whereIn('product_id', $variants->pluck('id'))
                ->get()
                ->groupBy('product_id');
            foreach ($variants as $variant) {
                $rawVals = $variantValuesByProduct->get($variant->id, collect());
                $variantValues = [];
                $price = '';
                $qty = '';

                foreach ($rawVals as $val) {
                    if ($val->attribute_id == $priceAttrId) {
                        $price = $val->value;
                    } elseif ($val->attribute_id == $qtyAttrId) {
                        $qty = $val->value;
                    } else {
                        // ตรงนี้เก็บเฉพาะ attribute ที่ใช้กำหนด combination (สี, ไซส์, ...)
                        // เท่านั้น — price/qty แยกออกไปโชว์ต่างหากด้านบนแล้ว เพื่อให้
                        // frontend เช็คได้ง่ายๆ ว่า "combination ของ variant นี้ตรงกับ
                        // ที่ generate ใหม่หรือเปล่า" แค่เทียบ map ตัวนี้ตัวเดียวพอ
                        $variantValues[$val->attribute_id] = $val->value;
                    }
                }

                $variantsData[] = [
                    'id' => $variant->id,
                    'sku' => $variant->sku,
                    'price' => $price,
                    'qty' => $qty,
                    'attributes' => $variantValues,
                ];
            }
        }

        $family = $product->family;

        $categoryIds = $product->categories()->pluck('categories.id')->all();

        return [
            'product' => [
                'id' => $product->id,
                'sku' => $product->sku,
                'family_id' => $product->family_id,
                'family_code' => $family ? ($family->name ?: ucfirst($family->code)) : 'Default',
                'type' => ucfirst($product->type),
                'enabled' => (bool) $product->enabled,
                'configurable_attributes' => $product->configurable_attributes ?? [],
                'shopee_category_id' => $product->shopee_category_id,
                'lazada_category_id' => $product->lazada_category_id,
                'tiktok_category_id' => $product->tiktok_category_id,
                'woocommerce_category_id' => $product->woocommerce_category_id,
                'shopee_brand_id' => $product->shopee_brand_id,
                'lazada_brand_id' => $product->lazada_brand_id,
                'tiktok_brand_id' => $product->tiktok_brand_id,
                'woocommerce_brand_id' => $product->woocommerce_brand_id,
                // ใช้ ISO 8601 ที่มี UTC offset ระบุชัดเจน เพื่อให้ frontend
                // แปลงเป็นเวลาท้องถิ่นได้ ไม่ใช่แค่โชว์ string ดิบๆ ตรงๆ
                'created_at' => ($product->created_at ?? now())->toIso8601String(),
                'updated_at' => ($product->updated_at ?? now())->toIso8601String(),
                'translation_completeness' => $this->translationCompletenessByProduct(collect([$product]))[$product->id] ?? null,
            ],
            'families' => $families,
            'assignedGroups' => $groupsData,
            'productValues' => $values,
            'variants' => $variantsData,
            'configurableAttributes' => $this->configurableAttributeOptions(),
            'channels' => $channels,
            'channelGroups' => $channelGroups,
            'categoryIds' => $categoryIds,
            'publishedShopIds' => $product->platformShops()->pluck('sales_platform_shops.id')->all(),
            'associations' => $this->associationsFor($product),
            'canViewHistory' => auth()->user()?->hasPermission('products', 'view_history') ?? false,
        ];
    }

    public function history(Product $product): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($product)]);
    }

    /**
     * เช็คแบบ read-only แบบเรียลไทม์ว่าสินค้านี้ live อยู่บน Lazada สำหรับ shop
     * นี้จริงๆ ตอนนี้หรือเปล่า — ถูกเรียกจากหน้า Edit Product ตอนเปิด dialog
     * ยืนยัน Push/Deactivate เพื่อให้เห็นสถานะปัจจุบันจริงๆ ของ Lazada แทนที่
     * จะใช้สถานะที่ cache ไว้ใน product_platform_shops (ซึ่งจะสดแค่เท่าที่
     * bulk sync ครั้งล่าสุดทำไว้ หรืออาจจะยังไม่เคย sync สินค้านี้เลยด้วยซ้ำ)
     * ดูที่ LazadaProductSyncService::checkLiveStatus()
     */
    public function checkLazadaStatus(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        try {
            return response()->json(LazadaProductSyncService::forShop($shop)->checkLiveStatus($product, $shop));
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า LAZADA เลย — สร้างหรืออัปเดตลิสติ้งจริง
     * บนหน้าร้านของผู้ขาย เรียกได้เฉพาะ shop ที่สินค้านี้ถูกติ๊กว่า "published"
     * ไว้ชัดเจนแล้วเท่านั้น (ดูที่ platformShops()) ดังนั้นจะไม่มีทางถูกยิงไป
     * shop ที่ไม่มีใครเลือกไว้ได้
     *
     * ใช้วิธี queue แทนที่จะรันตรงๆ (ดูที่ queueMarketplaceSync()) — เมื่อก่อน
     * web worker จะค้างรอจน Lazada ตอบกลับ ไม่ว่าจะใช้เวลานานแค่ไหนก็ตาม
     */
    public function pushToLazada(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'lazada', 'push');
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า LAZADA เลย — ซ่อนลิสติ้งจริงออกจากหน้าร้าน
     * ใช้เงื่อนไข "published" เดียวกับ pushToLazada() แต่ที่ service layer จะมี
     * การเช็คเพิ่มอีกชั้นว่าสินค้านี้เคยถูก push ไปแล้วจริงๆ (ไม่งั้นก็ไม่มีอะไร
     * ให้ deactivate)
     */
    public function deactivateLazada(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'lazada', 'deactivate');
    }

    /**
     * ทำหน้าที่เหมือน checkLazadaStatus() ด้านบน แต่เป็นฝั่ง Shopee — ดูที่
     * ShopeeProductSyncService::checkLiveStatus() ว่าเช็คคำว่า "live" ยังไง
     * (เทียบกับ platform_item_id ที่เรา cache ไว้เอง ไม่ได้ค้นหาด้วย SKU
     * ฝั่ง Shopee)
     */
    public function checkShopeeStatus(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        try {
            return response()->json(ShopeeProductSyncService::forShop($shop)->checkLiveStatus($product, $shop));
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า SHOPEE เลย — สร้างหรืออัปเดตลิสติ้งจริง
     * บนหน้าร้านของผู้ขาย ใช้เงื่อนไข "published" เดียวกับ pushToLazada()
     */
    public function pushToShopee(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'shopee', 'push');
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า SHOPEE เลย — ซ่อนลิสติ้งจริงออกจากหน้าร้าน
     * ใช้เงื่อนไข "published" เดียวกับ deactivateLazada()
     */
    public function deactivateShopee(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'shopee', 'deactivate');
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า SHOPEE เลย — ลบลิสติ้งจริงถาวร
     * (ShopeeProductSyncService::delete() ผ่าน v2.product.delete_item — ดู
     * docblock ของ ShopeeClient::deleteItem()) ยกเลิกไม่ได้จากฝั่ง Shopee
     * ใช้เงื่อนไข "published" เดียวกับ deactivateShopee() และใช้ infrastructure
     * queued-job ตัวเดียวกัน — ตอนนี้มีให้เฉพาะ Shopee เท่านั้น ยังไม่ได้ทำ
     * ให้ platform อื่นด้วย
     */
    public function deleteFromShopee(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'shopee', 'delete');
    }

    /**
     * ทำหน้าที่เหมือน checkLazadaStatus()/checkShopeeStatus() ด้านบน แต่แบบ
     * ลดสเปคลง — ดู docblock ของ TikTokProductSyncService::checkLiveStatus():
     * TikTok ยังไม่มี endpoint "Get Product" แบบรายชิ้นที่มีเอกสารรองรับ
     * ดังนั้นต่างจาก Lazada (ถามตรงจาก Lazada) หรือ Shopee (ถามผ่าน
     * platform_item_id) ตัวนี้จะสะท้อนแค่ข้อมูล product_platform_shops
     * ที่เรา cache ไว้เอง ไม่ใช่สถานะจริงของ TikTok ณ ตอนนั้น
     */
    public function checkTikTokStatus(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        try {
            return response()->json(TikTokProductSyncService::forShop($shop)->checkLiveStatus($product, $shop));
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * ปุ่ม "Check live status" ในหน้ารายการสินค้า — รัน checkLazadaStatus()/
     * checkShopeeStatus()/checkTikTokStatus() (การเช็คจริงต่อ shop แบบเดียว
     * กับที่ dialog push/deactivate ในหน้า Edit ใช้) กับทุก shop ที่สินค้านี้
     * เชื่อมอยู่ เพื่อให้ cell "Sales Channels" ในหน้ารายการสะท้อนสถานะจริง
     * ปัจจุบันของแต่ละ platform แทนที่จะใช้แต่ค่าที่ bulk sync หรือ push
     * ครั้งล่าสุดทิ้ง cache ไว้ใน product_platform_shops เท่านั้น ถ้า shop ไหน
     * ตอบไม่ได้ (โดน rate limit, token หมดอายุ ฯลฯ) ก็ไม่ทำให้ shop อื่นล้ม
     * ตามไปด้วย — เก็บ error ของมันไว้แล้วส่งกลับไปพร้อมกับผลที่สำเร็จ
     */
    public function checkLiveStatus(Product $product): JsonResponse
    {
        $links = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('product_platform_shops.product_id', $product->id)
            ->get(['sales_platform_shops.id as shop_id', 'sales_platform_shops.name as shop_name', 'sales_platforms.code as platform_code', 'sales_platforms.name as platform_name']);

        $errors = [];
        foreach ($links as $link) {
            $shop = SalesPlatformShop::find($link->shop_id);
            if (! $shop) {
                continue;
            }

            try {
                match ($link->platform_code) {
                    'lazada' => LazadaProductSyncService::forShop($shop)->checkLiveStatus($product, $shop),
                    'shopee' => ShopeeProductSyncService::forShop($shop)->checkLiveStatus($product, $shop),
                    'tiktok' => TikTokProductSyncService::forShop($shop)->checkLiveStatus($product, $shop),
                    'woocommerce' => WooCommerceProductSyncService::forShop($shop)->checkLiveStatus($product, $shop),
                    default => null,
                };
            } catch (\Throwable $e) {
                $errors[] = "{$link->platform_name} ({$link->shop_name}): {$e->getMessage()}";
            }
        }

        $liveRows = DB::table('product_platform_shops')
            ->join('sales_platform_shops', 'sales_platform_shops.id', '=', 'product_platform_shops.sales_platform_shop_id')
            ->join('sales_platforms', 'sales_platforms.id', '=', 'sales_platform_shops.sales_platform_id')
            ->where('product_platform_shops.product_id', $product->id)
            ->where('product_platform_shops.status', 'live')
            ->get(['sales_platforms.name as platform_name']);

        return response()->json([
            'sales_channels' => [
                'total' => $liveRows->count(),
                'platforms' => $liveRows->groupBy('platform_name')->map->count(),
            ],
            'checked' => $links->count(),
            'errors' => $errors,
        ]);
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า TIKTOK เลย — สร้างหรืออัปเดตลิสติ้งจริง
     * บนหน้าร้านของผู้ขาย ใช้เงื่อนไข "published" เดียวกับ pushToLazada()
     * ตอนนี้จะพังทุกสินค้า — ดู docblock ของ
     * TikTokProductSyncService::buildPayload() ว่าทำไม (ยังไม่รู้ warehouse_id
     * ของ TikTok และยังไม่มี mapping ต้นทาง product-attribute)
     */
    public function pushToTikTok(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'tiktok', 'push');
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า TIKTOK เลย — ซ่อนลิสติ้งจริงออกจากหน้าร้าน
     * ใช้เงื่อนไข "published" เดียวกับ deactivateLazada()
     */
    public function deactivateTikTok(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'tiktok', 'deactivate');
    }

    /**
     * ทำหน้าที่เหมือน checkLazadaStatus()/checkShopeeStatus()/checkTikTokStatus()
     * ด้านบน แต่เป็นฝั่ง WooCommerce — ดูที่
     * WooCommerceProductSyncService::checkLiveStatus() ว่าเช็คคำว่า "live"
     * ยังไง (ถามตรงจาก WooCommerce ด้วย SKU เหมือน Lazada ไม่ได้เชื่อ cache
     * เฉยๆ)
     */
    public function checkWoocommerceStatus(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        try {
            return response()->json(WooCommerceProductSyncService::forShop($shop)->checkLiveStatus($product, $shop));
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า WOOCOMMERCE เลย — สร้างหรืออัปเดตลิสติ้ง
     * จริงในร้าน ใช้เงื่อนไข "published" เดียวกับ pushToLazada()
     */
    public function pushToWoocommerce(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'woocommerce', 'push');
    }

    /**
     * ยิงเขียนข้อมูลจริงแบบ live เข้า WOOCOMMERCE เลย — ตั้งลิสติ้งจริงเป็น
     * draft ซ่อนออกจากหน้าร้าน ใช้เงื่อนไข "published" เดียวกับ
     * deactivateLazada()
     */
    public function deactivateWoocommerce(Product $product, SalesPlatformShop $shop): JsonResponse
    {
        return $this->queueMarketplaceSync($product, $shop, 'woocommerce', 'deactivate');
    }

    /**
     * เติมชื่อภาษาอังกฤษของสินค้าตัวนี้ตัวเดียวเข้าไปในดิกชันนารีของ
     * TranslatePress — ดู docblock ของ TranslatePressTranslationSyncService
     * เพื่อดูขอบเขตความปลอดภัยที่แน่ชัด (แตะเฉพาะสินค้าที่ TranslatePress
     * เคย render ไปแล้วเท่านั้น) จะปฏิเสธถ้าความสมบูรณ์ของคำแปลยังไม่ถึง
     * 100% — บังคับตรงนี้ด้วย ไม่ใช่แค่ปิดปุ่มไว้ที่ frontend เพราะมันเขียน
     * เนื้อหาจริง (แม้จะเขียนทับได้ง่ายก็ตาม) ลงเว็บไซต์จริง
     *
     * ทำงานแบบ synchronous ต่างจาก marketplace push ที่ใช้ queue ด้านบน —
     * เพราะนี่คือการเขียน DB ตรงๆ ครั้งเดียวผ่าน SSH tunnel ที่ต้องเปิดปิด
     * ทุกครั้งอยู่แล้ว ไม่ใช่การเรียก API ของ platform ภายนอกที่ latency
     * ไม่แน่นอน เลยไม่มีอะไรต้อง poll
     */
    public function fillWoocommerceTranslationsForProduct(Product $product): JsonResponse
    {
        $completeness = $this->translationCompletenessByProduct(collect([$product]))[$product->id] ?? null;
        if ($completeness !== 100) {
            return response()->json([
                'message' => 'Translation must be 100% complete before pushing to TranslatePress (currently '.($completeness ?? 0).'%).',
            ], 422);
        }

        $tunnel = new WordPressTunnel();

        try {
            $tunnel->open();
            $db = new WordPressDatabase($tunnel->localPort());

            try {
                $result = (new TranslatePressTranslationSyncService($db))->fillOneProduct($product);
            } finally {
                $db->close();
            }
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        } finally {
            $tunnel->close();
        }

        return response()->json($result);
    }

    /**
     * ใช้ร่วมกันโดย pushToLazada()/deactivateLazada()/pushToShopee()/
     * deactivateShopee()/pushToTikTok()/deactivateTikTok() — เช็คเงื่อนไข
     * "published" แบบ synchronous ก่อน (ไม่แพง เช็คในเครื่องเลย) แล้วส่งต่อ
     * การเขียนข้อมูล live จริงๆ ไปให้ SyncProductToMarketplaceJob แทนที่จะ
     * เรียก sync service ตรงนี้เอง ส่งกลับ 202 พร้อม job id ทันที ส่วน
     * frontend จะ poll marketplaceSyncJobStatus() เพื่อดูผลจริงทีหลัง
     */
    private function queueMarketplaceSync(Product $product, SalesPlatformShop $shop, string $platform, string $action): JsonResponse
    {
        $isPublished = $product->platformShops()->where('sales_platform_shops.id', $shop->id)->exists();
        if (! $isPublished) {
            return response()->json([
                'message' => "'{$shop->name}' is not marked as published for this product — check the box next to it first.",
            ], 422);
        }

        // Fail fast, synchronously, instead of letting a doomed job get
        // queued and only discovering "no category mapped" once
        // SyncProductToMarketplaceJob runs it — each
        // {Platform}ProductSyncService::resolve{Platform}CategoryId()
        // method throws the exact same check, but only *after* dispatch.
        // Checked for 'push' only (deactivate/delete never touch category).
        if ($action === 'push' && ! $this->hasMarketplaceCategoryMapped($product, $platform)) {
            return response()->json([
                'message' => "This product has no {$platform} category set — set one under Marketplace Categories before pushing.",
            ], 422);
        }

        // เช็คแบบเดียวกันกับ category ด้านบน แต่สำหรับ brand — เพิ่งเพิ่มเข้ามา
        // ทีหลัง (เดิม brand ไม่เคยเป็นเงื่อนไขบังคับก่อน push เลยสักแพลตฟอร์ม)
        // ตอนนี้บังคับเหมือน category ทุกแพลตฟอร์ม แม้ในความเป็นจริง brand จะเป็น
        // ข้อมูล optional สำหรับ marketplace ส่วนใหญ่ (สินค้าจำนวนมากไม่มีแบรนด์จริง
        // ก็ยังขายได้) — เป็นการตัดสินใจของแอปนี้เองให้บังคับต้องเลือกอะไรสักอย่าง
        // ก่อนเสมอ (รวมถึงเลือกแถว "No Brand" ของ platform นั้นเองได้ ถ้ามีอยู่ใน
        // ชุดที่ sync มา) ไม่ใช่ปล่อยว่างเงียบๆ เหมือนที่เคยเป็นมา
        if ($action === 'push' && ! $this->hasMarketplaceBrandMapped($product, $platform)) {
            return response()->json([
                'message' => "This product has no {$platform} brand set — set one under Brand before pushing.",
            ], 422);
        }

        $syncJob = $this->dispatchMarketplaceSyncJob($product, $shop, $platform, $action);

        $message = match ($action) {
            'deactivate' => "Deactivation on '{$shop->name}' queued.",
            'delete' => "Permanent deletion from '{$shop->name}' queued.",
            default => "Push to '{$shop->name}' queued.",
        };

        return response()->json([
            'job_id' => $syncJob->id,
            'status' => 'queued',
            'message' => $message,
        ], 202);
    }

    /**
     * เช็คแบบเดียวกับที่ Shopee/Lazada/TikTok/WooCommerceProductSyncService::
     * resolve*CategoryId() ใช้จริงตอน build payload: ใช้ค่า override เฉพาะสินค้า
     * (products.{platform}_category_id) ถ้ามี ไม่งั้น fallback ไปดูว่า
     * PIM category ที่สินค้าผูกอยู่ มี mapping ของ platform นี้หรือเปล่า —
     * เขียนซ้ำเป็น query ตรงนี้ (ไม่เรียก sync service ตรงๆ) เพราะ sync
     * service ต้อง instantiate ด้วย shop/account credentials จริง ส่วนตรงนี้
     * แค่ต้องการเช็คแบบ synchronous เบาๆ ก่อน dispatch job เท่านั้น
     */
    private function hasMarketplaceCategoryMapped(Product $product, string $platform): bool
    {
        $column = "{$platform}_category_id";
        if ($product->{$column}) {
            return true;
        }

        return $product->categories()->whereNotNull($column)->exists();
    }

    /**
     * เช็คแบบเดียวกับที่ mappedBrandOptionId() (ResolvesProductAttributeValues
     * trait ที่ sync service ทุกตัวใช้ตอน build payload จริง) ใช้: ค่า override
     * เฉพาะสินค้า (products.{platform}_brand_id) ถ้ามี ไม่งั้น fallback ไปดูว่า
     * ค่า attribute `pbrand` ของสินค้านี้ ชี้ไปที่ AttributeOption ที่มี mapping
     * ของ platform นี้หรือเปล่า — เขียนซ้ำเป็น query ตรงนี้ (ไม่เรียก sync service
     * ตรงๆ) ด้วยเหตุผลเดียวกับ hasMarketplaceCategoryMapped() ด้านบน
     */
    private function hasMarketplaceBrandMapped(Product $product, string $platform): bool
    {
        $column = "{$platform}_brand_id";
        if ($product->{$column}) {
            return true;
        }

        $pbrandAttributeId = Attribute::idForCode('pbrand');
        if (! $pbrandAttributeId) {
            return false;
        }

        $brandCode = ProductValue::where('product_id', $product->id)
            ->where('attribute_id', $pbrandAttributeId)
            ->whereNull('channel_id')
            ->whereNull('locale_id')
            ->value('value');

        if (! $brandCode) {
            return false;
        }

        return AttributeOption::where('attribute_id', $pbrandAttributeId)
            ->where('code', $brandCode)
            ->whereNotNull($column)
            ->exists();
    }

    /**
     * ตัวที่ queue job จริงๆ อยู่เบื้องหลัง queueMarketplaceSync() ด้านบน แต่
     * ไม่มีเงื่อนไข "published อยู่แล้ว" — ถูกใช้ซ้ำโดย pushBulk() (ด้านล่าง)
     * ที่จะ publish สินค้าให้ shop นี้เองก่อนอยู่แล้ว (ดูที่
     * Product::platformShops()) ดังนั้นเงื่อนไขนี้จะผ่านอยู่ดีในกรณีนั้น
     * ส่วนการ validate required-attribute ที่ทั้งสองฝั่งพึ่งพาอยู่นั้นอยู่ใน
     * SyncProductToMarketplaceJob → {Platform}ProductSyncService ไม่ได้
     * ถูกกระทบจากการแยกฟังก์ชันนี้แต่อย่างใด
     */
    private function dispatchMarketplaceSyncJob(Product $product, SalesPlatformShop $shop, string $platform, string $action): ProductMarketplaceSyncJob
    {
        $syncJob = ProductMarketplaceSyncJob::create([
            'product_id' => $product->id,
            'sales_platform_shop_id' => $shop->id,
            'platform' => $platform,
            'action' => $action,
            'status' => 'queued',
            'user_id' => auth()->id(),
        ]);

        SyncProductToMarketplaceJob::dispatch($syncJob->id, auth()->id());

        return $syncJob;
    }

    /**
     * ปุ่ม bulk "Share" ในหน้ารายการสินค้า — publish สินค้าที่เลือกทั้งหมด
     * ไปยัง shop ที่เลือกทั้งหมด (ติ๊กช่องให้อัตโนมัติ ที่ปกติ user ต้องมาติ๊ก
     * เองทีละสินค้าในแผง Sales Channels ของหน้า Edit) แล้ว queue job push
     * ทีละคู่ product×shop ผ่าน dispatchMarketplaceSyncJob() ด้านบน ทำงาน
     * แบบ fire-and-forget: ฟังก์ชันนี้ return จำนวนแบบ flash message ทันที
     * เหมือนกับ queueMissingTranslationsBulk() — ผลสำเร็จหรือล้มเหลวของ
     * แต่ละสินค้า/แต่ละ shop (รวมถึงการ validate required-attribute ของแต่ละ
     * platform ที่ยังรันเหมือนเดิมอยู่ใน queued job) จะไปเช็คทีหลังได้ที่
     * หน้า Edit ของสินค้านั้นๆ
     */
    public function pushBulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_ids' => ['required', 'array', 'min:1'],
            'product_ids.*' => ['integer', 'exists:products,id'],
            'shop_ids' => ['required', 'array', 'min:1'],
            'shop_ids.*' => ['integer', 'exists:sales_platform_shops,id'],
        ]);

        $products = Product::whereIn('id', $validated['product_ids'])->get();
        $shops = SalesPlatformShop::with('platform:id,code')->whereIn('id', $validated['shop_ids'])->get();
        $shopIds = $shops->pluck('id')->all();

        foreach ($products as $product) {
            $product->platformShops()->syncWithoutDetaching($shopIds);

            foreach ($shops as $shop) {
                $this->dispatchMarketplaceSyncJob($product, $shop, $shop->platform->code, 'push');
            }
        }

        return back()->with('success', "Queued push for {$products->count()} product(s) across {$shops->count()} channel(s).");
    }

    /**
     * ปุ่ม bulk "Deactivate" ในหน้ารายการสินค้า — เป็นคู่หูฝั่ง Deactivate ของ
     * pushBulk() ด้านบน ต่างจาก push ตรงที่ตัวนี้จะไม่ auto-publish ให้เลย:
     * จะ queue เฉพาะคู่ product×shop ที่ถูกติ๊ก "published" ไว้อยู่แล้วเท่านั้น
     * (product->platformShops()) สอดคล้องกับทั้งเงื่อนไข "ยังไม่ได้ published"
     * ของ queueMarketplaceSync() และแผง Sales Channels ของหน้า Edit ที่จะไม่
     * มีปุ่ม Deactivate โผล่มาให้กดถ้า shop นั้นยังไม่ได้ติ๊กไว้ คู่ไหนที่ยังไม่
     * ได้ publish จะถูกข้ามไปเงียบๆ (แค่นับจำนวนไว้ ไม่ถือเป็น error) แทนที่จะ
     * ทำให้ request ทั้งก้อนพังไปเพราะคู่นั้นคู่เดียว
     */
    public function deactivateBulk(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'product_ids' => ['required', 'array', 'min:1'],
            'product_ids.*' => ['integer', 'exists:products,id'],
            'shop_ids' => ['required', 'array', 'min:1'],
            'shop_ids.*' => ['integer', 'exists:sales_platform_shops,id'],
        ]);

        $products = Product::whereIn('id', $validated['product_ids'])->get();
        $shops = SalesPlatformShop::with('platform:id,code')->whereIn('id', $validated['shop_ids'])->get();

        $queued = 0;
        $skipped = 0;
        foreach ($products as $product) {
            $publishedShopIds = $product->platformShops()->pluck('sales_platform_shops.id')->all();

            foreach ($shops as $shop) {
                if (!in_array($shop->id, $publishedShopIds, true)) {
                    $skipped++;
                    continue;
                }

                $this->dispatchMarketplaceSyncJob($product, $shop, $shop->platform->code, 'deactivate');
                $queued++;
            }
        }

        $message = "Queued deactivate for {$queued} product/channel pair(s).";
        if ($skipped > 0) {
            $message .= " Skipped {$skipped} pair(s) not published there.";
        }

        return back()->with('success', $message);
    }

    /**
     * ถูก poll โดยหน้า Edit Product หลังจาก pushToLazada()/pushToShopee()/
     * deactivateLazada()/deactivateShopee() ตอบ response "queued" เริ่มต้น
     * กลับมา จนกว่า status จะไม่ใช่ queued/processing แล้ว
     */
    public function marketplaceSyncJobStatus(Product $product, ProductMarketplaceSyncJob $syncJob): JsonResponse
    {
        if ((int) $syncJob->product_id !== (int) $product->id) {
            abort(404);
        }

        return response()->json([
            'job_id' => $syncJob->id,
            'status' => $syncJob->status,
            'message' => $syncJob->message,
            'result' => $syncJob->result,
        ]);
    }

    public function update(Request $request, Product $product): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'sku' => ['required', 'string', 'max:100', 'unique:products,sku,'.$product->id],
            'family_id' => ['required', 'exists:attribute_families,id'],
            'type' => ['required', 'in:simple,configurable,Simple,Configurable'],
            'enabled' => ['required', 'boolean'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['exists:categories,id'],
            'shopee_category_id' => ['nullable', 'integer', 'exists:shopee_categories,id'],
            'lazada_category_id' => ['nullable', 'integer', 'exists:lazada_categories,id'],
            'tiktok_category_id' => ['nullable', 'integer', 'exists:tiktok_categories,id'],
            'woocommerce_category_id' => ['nullable', 'integer', 'exists:woocommerce_categories,id'],
            'shopee_brand_id' => ['nullable', 'integer', 'exists:shopee_brands,id'],
            'lazada_brand_id' => ['nullable', 'integer', 'exists:lazada_brands,id'],
            'tiktok_brand_id' => ['nullable', 'integer', 'exists:tiktok_brands,id'],
            'woocommerce_brand_id' => ['nullable', 'integer', 'exists:woocommerce_brands,id'],
            'published_shop_ids' => ['nullable', 'array'],
            'published_shop_ids.*' => ['exists:sales_platform_shops,id'],
            'associations' => ['nullable', 'array'],
            'associations.related' => ['nullable', 'array'],
            'associations.related.*' => ['exists:products,id'],
            'associations.up_sell' => ['nullable', 'array'],
            'associations.up_sell.*' => ['exists:products,id'],
            'associations.cross_sell' => ['nullable', 'array'],
            'associations.cross_sell.*' => ['exists:products,id'],
            'values' => ['nullable', 'array'],
            'configurable_attributes' => ['nullable', 'array'],
            'configurable_attributes.*' => ['integer', 'exists:attributes,id'],
            'variants' => ['nullable', 'array'],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.sku' => ['required_if:type,configurable', 'string', 'max:100', 'distinct'],
            'variants.*.price' => ['nullable', 'numeric'],
            'variants.*.qty' => ['nullable', 'integer'],
            'variants.*.attributes' => ['nullable', 'array'],
        ]);

        // เช็คกันแบบเดียวกับตอน store() เรื่อง "attribute id ใน variants.*.attributes
        // ที่ไม่รู้จัก" — ดูคอมเมนต์ตรงนั้นได้เลย เมื่อก่อน update() ไม่มีการเช็ค field
        // นี้เลย ปล่อยผ่านแบบไม่ validate อะไรเลย
        $validator->after(function ($validator) use ($request) {
            $validAttributeIds = null;

            foreach ((array) $request->input('variants', []) as $index => $variant) {
                $attributeIds = array_keys((array) ($variant['attributes'] ?? []));
                if (empty($attributeIds)) {
                    continue;
                }

                $validAttributeIds ??= Attribute::pluck('id')->map(fn ($id) => (string) $id)->all();
                $unknown = array_diff(array_map('strval', $attributeIds), $validAttributeIds);

                foreach ($unknown as $badId) {
                    $validator->errors()->add("variants.{$index}.attributes", "Unknown attribute id \"{$badId}\".");
                }
            }
        });

        $validated = $validator->validate();

        DB::transaction(function () use ($validated, $request, $product) {
            $oldCategoryIds = $product->categories()->pluck('categories.id')->map(fn ($id) => (int) $id)->sort()->values()->all();

            $product->update([
                'sku' => $validated['sku'],
                'family_id' => $validated['family_id'],
                'type' => strtolower($validated['type']),
                'enabled' => $validated['enabled'],
                'configurable_attributes' => $validated['configurable_attributes'] ?? $product->configurable_attributes,
                'shopee_category_id' => $validated['shopee_category_id'] ?? null,
                'lazada_category_id' => $validated['lazada_category_id'] ?? null,
                'tiktok_category_id' => $validated['tiktok_category_id'] ?? null,
                'woocommerce_category_id' => $validated['woocommerce_category_id'] ?? null,
                'shopee_brand_id' => $validated['shopee_brand_id'] ?? null,
                'lazada_brand_id' => $validated['lazada_brand_id'] ?? null,
                'tiktok_brand_id' => $validated['tiktok_brand_id'] ?? null,
                'woocommerce_brand_id' => $validated['woocommerce_brand_id'] ?? null,
                'updated_by' => $request->user()?->id,
            ]);

            $newCategoryIds = collect($validated['category_ids'] ?? [])->map(fn ($id) => (int) $id)->sort()->values()->all();
            $product->categories()->sync($newCategoryIds);
            $categoryChanged = $oldCategoryIds !== $newCategoryIds;

            if ($categoryChanged) {
                ProductCategoryLinker::deriveLegacyCodesFromCategories($product, $newCategoryIds);
            }

            $oldShopIds = $product->platformShops()->pluck('sales_platform_shops.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            $newShopIds = collect($validated['published_shop_ids'] ?? [])->map(fn ($id) => (int) $id)->sort()->values()->all();
            $product->platformShops()->sync($newShopIds);
            if ($oldShopIds !== $newShopIds) {
                AuditLog::record('published_shops_updated', $product, ['shop_ids' => $oldShopIds], ['shop_ids' => $newShopIds]);
            }

            $this->syncAssociations($product, $validated['associations'] ?? []);

            // $values เป็น array ซ้อนกัน: attribute_id -> channelKey ('global' หรือ channel id) -> localeKey ('default' หรือ locale id) -> value
            // ฝั่ง frontend คำนวณ channelKey/localeKey ของแต่ละ attribute ตามค่า
            // is_channel_based/is_locale_based ให้แล้ว ดังนั้น loop นี้แค่ต้องแปลง
            // sentinel key กลับเป็น null สำหรับ scope แบบ global/default เท่านั้น
            $values = $request->input('values', []);

            // เก็บ error แบบ "values.{attributeId}" => message ไว้ตรงนี้ ทั้งจาก
            // รอบอัปโหลดไฟล์และรอบเช็ค required/unique ด้านล่าง แล้วค่อยโยน
            // ValidationException รวมกันทีเดียว เพื่อให้การบันทึกทั้งหมด
            // ถูกยกเลิกไปพร้อมกัน (transaction rollback) แทนที่จะบันทึกไปครึ่งๆ
            // กลางๆ แล้วมาสะดุดที่ field ที่ผิด
            $valueErrors = [];

            $storeAttributeFile = function (Attribute $attribute, $file) use (&$valueErrors) {
                if (! $file) {
                    return null;
                }

                // ใช้กฎเดียวกับ field รูปภาพ/ไฟล์ของ CategoryController (รูป 4MB,
                // ไฟล์ทั่วไป 10MB) — เมื่อก่อน loop นี้เก็บไฟล์ที่อัปโหลดได้ทุกชนิด
                // โดยไม่จำกัด mime-type หรือขนาดเลย ส่วนวิดีโอแยกเงื่อนไขเอง:
                // เฉพาะ MP4 เท่านั้น ขนาดไม่เกิน 100MB — ให้ตรงกับข้อกำหนดอัปโหลด
                // วิดีโอของ Lazada เอง เพราะ attribute นี้มีไว้ใช้กับฟิลด์ "video"
                // (Video URL) ที่เป็น optional ของ Lazada
                $rules = match (true) {
                    in_array($attribute->type, ['image', 'gallery'], true) => ['image', 'max:4096'],
                    $attribute->type === 'video' => ['file', 'mimes:mp4', 'max:102400'],
                    default => ['file', 'max:10240'],
                };

                $validator = Validator::make(['file' => $file], ['file' => $rules]);

                if ($validator->fails()) {
                    $valueErrors["values.{$attribute->id}"] = "{$attribute->name}: ".$validator->errors()->first('file');

                    return null;
                }

                // ระยะเวลา/ขนาดของไฟล์ validator ของ Laravel เช็คให้ไม่ได้ —
                // เลยทำเป็นรอบที่สอง เช็คต่อเมื่อ mime/size ผ่านแล้วเท่านั้น
                // เพื่อให้ไฟล์ผิดฟอร์แมตโดน error ที่เจาะจงกว่าและถูกกว่าด้านบน
                // แทนที่จะให้ getID3 พยายามอ่านไฟล์ (แล้วน่าจะพังอยู่ดี)
                if ($attribute->type === 'video') {
                    $videoError = $this->validateVideoConstraints($file);
                    if ($videoError !== null) {
                        $valueErrors["values.{$attribute->id}"] = "{$attribute->name}: {$videoError}";

                        return null;
                    }
                }

                if (in_array($attribute->type, ['image', 'gallery'], true)) {
                    $imageError = $this->validateImageConstraints($file);
                    if ($imageError !== null) {
                        $valueErrors["values.{$attribute->id}"] = "{$attribute->name}: {$imageError}";

                        return null;
                    }
                }

                return $file->store('product-attributes', 'public');
            };

            foreach ($request->file('values', []) as $attributeId => $channelFiles) {
                $attribute = Attribute::find($attributeId);
                if (! $attribute) {
                    continue;
                }

                if (is_array($channelFiles)) {
                    foreach ($channelFiles as $channelKey => $localeFiles) {
                        if (is_array($localeFiles)) {
                            foreach ($localeFiles as $localeKey => $file) {
                                if (is_array($file)) {
                                    // Gallery: ตอนนี้ frontend ส่ง path เดิมที่ยังเก็บไว้
                                    // (เป็น string) ปนมากับไฟล์ใหม่ที่เพิ่งเลือก โดยอยู่ใน
                                    // index เดียวกันของ array คำขอแบบ multipart จะแยก
                                    // ไฟล์อัปโหลดกับ field ธรรมดาออกจากกันเสมอแม้อยู่ใน
                                    // array เดียวกัน ดังนั้น string ที่เก็บไว้จึงรอดมาอยู่ใน
                                    // $values ผ่านการอ่าน input() ด้านบนอยู่แล้ว — ให้เอา
                                    // path ของไฟล์ใหม่ที่เพิ่งอัปโหลดมารวมกลับเข้าไปแทนที่จะ
                                    // ทิ้งไป (เมื่อก่อนอัปโหลดใหม่ทีนึงจะทับ gallery ทั้งหมด)
                                    $keptPaths = array_values(array_filter(
                                        (array) ($values[$attributeId][$channelKey][$localeKey] ?? []),
                                        fn ($v) => is_string($v) && $v !== ''
                                    ));
                                    $incomingFiles = array_values(array_filter($file));

                                    // เช็คก่อนที่จะเก็บไฟล์ที่ส่งเข้ามาแม้แต่ไฟล์เดียว
                                    // (ไม่ใช่เช็คทีหลัง) เพื่อไม่ให้คำขอที่เกิน limit
                                    // ทิ้งไฟล์กำพร้าไว้บน disk โดยไม่มี product_values
                                    // row ไหนอ้างอิงถึงเลย
                                    if (count($keptPaths) + count($incomingFiles) > self::MAX_GALLERY_IMAGES) {
                                        $valueErrors["values.{$attributeId}"] = "{$attribute->name}: You can upload up to ".self::MAX_GALLERY_IMAGES.' images.';

                                        continue;
                                    }

                                    $newPaths = array_values(array_filter(array_map(
                                        fn ($f) => $storeAttributeFile($attribute, $f),
                                        $incomingFiles
                                    )));
                                    $values[$attributeId][$channelKey][$localeKey] = json_encode(array_merge($keptPaths, $newPaths));
                                } elseif ($file) {
                                    $path = $storeAttributeFile($attribute, $file);
                                    if ($path) {
                                        $values[$attributeId][$channelKey][$localeKey] = $path;
                                    }
                                }
                            }
                        } elseif ($localeFiles) {
                            $path = $storeAttributeFile($attribute, $localeFiles);
                            if ($path) {
                                $values[$attributeId][$channelKey]['default'] = $path;
                            }
                        }
                    }
                } elseif ($channelFiles) {
                    $path = $storeAttributeFile($attribute, $channelFiles);
                    if ($path) {
                        $values[$attributeId]['global']['default'] = $path;
                    }
                }
            }

            $touchedAttributeIds = collect($values)->keys()->filter(fn ($id) => is_numeric($id))->map(fn ($id) => (int) $id)->unique()->values();
            $oldProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);

            $user = $request->user();

            // หา group ที่แต่ละ attribute ที่ถูกแก้ไปสังกัดอยู่ ในบริบทของ family
            // ของ product นี้ — ต้องมีตัวนี้เพื่อให้การเช็ค permission ด้านล่างบังคับ
            // กฎเดียวกับที่ edit() ใช้ตอน render อยู่แล้ว คือ "ถ้า group เป็น
            // read-only จะทับกฎที่ attribute เดี่ยวๆ แก้ไขได้" (ดู docblock ของ
            // canUserEditAttributeGroup()) ถ้าไม่มีตัวเช็คนี้ คำขอที่ยิงตรงมาที่
            // endpoint นี้เลย (ข้าม UI ที่บังคับกฎนี้อยู่) จะยังเขียนค่าลง attribute
            // ที่ group แม่เป็น read-only ได้อยู่ดี
            $attributeGroupsById = FamilyAttribute::with('attributeGroup')
                ->where('family_id', $product->family_id)
                ->whereIn('attribute_id', $touchedAttributeIds)
                ->get()
                ->keyBy('attribute_id')
                ->map(fn ($fa) => $fa->attributeGroup);

            $canEditTouchedAttribute = function ($attribute) use ($user, $attributeGroupsById) {
                if (! $user) {
                    return true;
                }
                $group = $attributeGroupsById->get($attribute->id);
                if ($group && ! $this->canUserEditAttributeGroup($user, $group)) {
                    return false;
                }

                return $this->canUserEditAttribute($user, $attribute);
            };

            // บังคับ flag is_required/is_unique ของแต่ละ attribute ที่ฝั่ง server —
            // เมื่อก่อนมีแค่เครื่องหมาย "*" สวยๆ บน frontend ไม่มีอะไรกันไม่ให้
            // ค่า "required" ว่างเปล่า หรือค่า "unique" ที่ซ้ำกันถูกบันทึกเข้าไปได้เลย
            // จะเช็คเฉพาะ scope ที่มีอยู่จริงในคำขอนี้เท่านั้น (channel/locale ที่ user
            // ยังไม่ได้เปิดดูจะไม่ถูกโหลดเข้าฟอร์ม เลยเช็คตรงนี้ไม่ได้) และข้ามไป
            // สำหรับ attribute ที่ user คนนี้ไม่มีสิทธิ์แก้ไข เหมือนกับที่ loop
            // การบันทึกด้านล่างข้ามไปแบบเงียบๆ เช่นกัน
            if (is_array($values)) {
                foreach ($values as $attributeId => $channelValues) {
                    $attribute = Attribute::find($attributeId);
                    if (! $attribute || ! is_array($channelValues)) {
                        continue;
                    }
                    if (! $canEditTouchedAttribute($attribute)) {
                        continue;
                    }

                    foreach ($channelValues as $channelKey => $localeValues) {
                        $channelId = $channelKey === 'global' ? null : $channelKey;
                        if (! is_array($localeValues)) {
                            continue;
                        }

                        foreach ($localeValues as $localeKey => $val) {
                            $localeId = $localeKey === 'default' ? null : $localeKey;
                            $isEmpty = $val === null || $val === '' || (is_array($val) && empty($val));

                            if ($attribute->is_required && $isEmpty) {
                                $valueErrors["values.{$attributeId}"] = "{$attribute->name} is required.";

                                continue;
                            }

                            if ($attribute->is_unique && ! $isEmpty) {
                                $stringVal = is_array($val) ? json_encode($val) : (string) $val;
                                $taken = ProductValue::where('attribute_id', $attributeId)
                                    ->where('channel_id', $channelId)
                                    ->where('locale_id', $localeId)
                                    ->where('value', $stringVal)
                                    ->where('product_id', '!=', $product->id)
                                    ->exists();

                                if ($taken) {
                                    $valueErrors["values.{$attributeId}"] = "{$attribute->name} value \"{$stringVal}\" is already in use.";
                                }
                            }
                        }
                    }
                }
            }

            if (! empty($valueErrors)) {
                throw ValidationException::withMessages($valueErrors);
            }

            if (is_array($values)) {
                foreach ($values as $attributeId => $channelValues) {
                    $attribute = Attribute::find($attributeId);
                    if (! $attribute || ! is_array($channelValues)) {
                        continue;
                    }

                    // เช็คว่า user มีสิทธิ์แก้ไข attribute นี้หรือไม่ (รวมถึงเช็คว่า
                    // attribute group ของมันไม่ได้เป็น read-only ด้วย — ดู $canEditTouchedAttribute ด้านบน)
                    if (! $canEditTouchedAttribute($attribute)) {
                        continue;
                    }

                    foreach ($channelValues as $channelKey => $localeValues) {
                        $channelId = $channelKey === 'global' ? null : $channelKey;

                        if (! is_array($localeValues)) {
                            continue;
                        }

                        foreach ($localeValues as $localeKey => $val) {
                            $localeId = $localeKey === 'default' ? null : $localeKey;

                            // เมื่อก่อนไฟล์อัปโหลดที่ถูกแทนที่จะค้างอยู่บน disk ตลอดไป —
                            // เก็บค่าที่บันทึกไว้ก่อนหน้าการเขียนครั้งนี้ไว้ก่อน เพื่อจะได้
                            // เอามาลบทิ้งด้านล่าง หลังจากบันทึกค่าใหม่ (หรือลบค่า) เรียบร้อยแล้ว
                            $isFileAttribute = in_array($attribute->type, ['image', 'gallery', 'file', 'video'], true);
                            $oldStoredValue = $isFileAttribute
                                ? ProductValue::where('product_id', $product->id)
                                    ->where('attribute_id', $attributeId)
                                    ->where('channel_id', $channelId)
                                    ->where('locale_id', $localeId)
                                    ->value('value')
                                : null;

                            // ถ้า gallery ถูกล้างจนเหลือรูปเป็นศูนย์ ค่าที่ส่งมาจะเป็น `[]`
                            // (ยังนับว่าถูกแตะต้อง เลยยังต้อง diff/บันทึกอยู่ดี) — ให้ถือว่า
                            // เหมือนกับ null/'' แทนที่จะเก็บเป็น string "[]" ตรงๆ เพื่อให้
                            // สอดคล้องกับการเช็ค is_required ด้านบน
                            $isEmptyVal = $val === null || $val === '' || (is_array($val) && empty($val));

                            if (! $isEmptyVal) {
                                $newStoredValue = is_array($val) ? json_encode($val) : (string) $val;

                                ProductValue::updateOrCreate(
                                    [
                                        'product_id' => $product->id,
                                        'attribute_id' => $attributeId,
                                        'channel_id' => $channelId,
                                        'locale_id' => $localeId,
                                    ],
                                    [
                                        'value' => $newStoredValue,
                                    ]
                                );
                            } else {
                                $newStoredValue = null;

                                ProductValue::where('product_id', $product->id)
                                    ->where('attribute_id', $attributeId)
                                    ->where('channel_id', $channelId)
                                    ->where('locale_id', $localeId)
                                    ->delete();
                            }

                            if ($isFileAttribute && $oldStoredValue && $oldStoredValue !== $newStoredValue) {
                                $this->deleteRemovedAttributeFiles($attribute, $oldStoredValue, $newStoredValue);
                            }
                        }
                    }
                }
            }

            $newProductValues = $this->productValueSnapshot($product->id, $touchedAttributeIds);
            $valuesChanged = $this->recordProductValueChanges($product, $oldProductValues, $newProductValues);

            if ($valuesChanged || $categoryChanged || $product->wasChanged(['sku', 'family_id', 'type', 'enabled'])) {
                event(new ProductDataChanged($product->id, $product->enabled));
                Product::bumpStorefrontVersion();
            }

            // ซิงค์ Variants (ลูกๆ ที่เป็น Cartesian Product)
            $oldVariantValues = $this->variantValueSnapshot($product);

            // ใช้ $request->has (ไม่ใช่ !empty) เพื่อให้กรณีล้าง variant ทั้งหมด
            // ในหน้า Edit UI — คือส่ง `variants: []` มาหลังจาก regenerate โดยไม่ได้
            // เลือก attribute เลย — ยังคงลบลูกที่กลายเป็นกำพร้าด้านล่างได้อยู่ แทนที่
            // จะเข้าใจผิดว่า array ว่างๆ นี้แปลว่า "ไม่ได้ส่ง field มา ปล่อย variants
            // ไว้เหมือนเดิม"
            if (strtolower($validated['type']) === 'configurable' && $request->has('variants')) {
                $priceAttr = Attribute::where('code', 'price')->first();
                $qtyAttr = Attribute::where('code', 'qty')->first();
                $existingVariantIds = [];

                foreach ($validated['variants'] ?? [] as $variantData) {
                    $childProduct = null;
                    if (! empty($variantData['id'])) {
                        $childProduct = Product::find($variantData['id']);
                    }

                    if ($childProduct) {
                        // เมื่อก่อนการเปลี่ยนชื่อ (rename) variant ที่มีอยู่แล้วไม่มีการเช็ค
                        // ความซ้ำเลย — ถ้า SKU ไปชนกับ product/variant อื่น จะโดน
                        // unique constraint ของ DB ตรงๆ ทำให้เกิด QueryException
                        // ดิบๆ (500) แทนที่จะเป็น validation error ที่สวยงาม
                        $skuTaken = Product::where('sku', $variantData['sku'])
                            ->where('id', '!=', $childProduct->id)
                            ->exists();

                        if ($skuTaken) {
                            throw ValidationException::withMessages([
                                'variants' => "SKU \"{$variantData['sku']}\" is already in use.",
                            ]);
                        }

                        $childProduct->update([
                            'sku' => $variantData['sku'],
                            'enabled' => $product->enabled,
                            'updated_by' => $request->user()?->id,
                        ]);
                    } else {
                        // เช็ค SKU ไม่ให้ซ้ำ สำหรับ variant ใหม่
                        $request->validate([
                            'variants.*.sku' => ['unique:products,sku'],
                        ]);

                        $childProduct = Product::create([
                            'sku' => $variantData['sku'],
                            'parent_id' => $product->id,
                            'family_id' => $product->family_id,
                            'type' => 'simple',
                            'enabled' => $product->enabled,
                            'created_by' => $request->user()?->id,
                            'updated_by' => $request->user()?->id,
                        ]);

                        $childProduct->applySmartDefaults();
                    }

                    $existingVariantIds[] = $childProduct->id;

                    // อัปเดตราคา
                    if ($priceAttr) {
                        if (isset($variantData['price']) && $variantData['price'] !== '') {
                            ProductValue::updateOrCreate(
                                [
                                    'product_id' => $childProduct->id,
                                    'attribute_id' => $priceAttr->id,
                                ],
                                ['value' => (string) $variantData['price']]
                            );
                        } else {
                            ProductValue::where('product_id', $childProduct->id)->where('attribute_id', $priceAttr->id)->delete();
                        }
                    }

                    // อัปเดตจำนวนคงเหลือ (qty)
                    if ($qtyAttr) {
                        if (isset($variantData['qty']) && $variantData['qty'] !== '') {
                            ProductValue::updateOrCreate(
                                [
                                    'product_id' => $childProduct->id,
                                    'attribute_id' => $qtyAttr->id,
                                ],
                                ['value' => (string) $variantData['qty']]
                            );
                        } else {
                            ProductValue::where('product_id', $childProduct->id)->where('attribute_id', $qtyAttr->id)->delete();
                        }
                    }

                    // บันทึกชุดค่า attribute ที่ผสมกัน (variant ใหม่)
                    if (! empty($variantData['attributes'])) {
                        foreach ($variantData['attributes'] as $attrId => $attrVal) {
                            if ($attrVal !== null && $attrVal !== '') {
                                ProductValue::updateOrCreate(
                                    [
                                        'product_id' => $childProduct->id,
                                        'attribute_id' => $attrId,
                                    ],
                                    ['value' => (string) $attrVal]
                                );
                            }
                        }
                    }
                }

                // ลบ variant ที่ถูกเอาออกจาก frontend ลบทีละตัว (ไม่ใช้ query delete
                // แบบ bulk) เพื่อให้ Eloquent ยิง event `deleted` และ Auditable
                // บันทึกการลบไว้จริงๆ
                Product::where('parent_id', $product->id)->whereNotIn('id', $existingVariantIds)->get()->each->delete();
            } elseif (strtolower($validated['type']) !== 'configurable') {
                // Product Type ถูกเปลี่ยนจาก Configurable ออกไป (หรือเป็น Simple
                // อยู่แล้ว) — product แบบ Simple มี variant ลูกไม่ได้ เลยต้องลบ
                // ตัวที่ยังเหลืออยู่ทิ้งไป แทนที่จะปล่อยให้เป็นลูกกำพร้าอยู่ใต้
                // parent ที่ไม่ได้แสดงตัวว่าเป็น configurable แล้ว
                Product::where('parent_id', $product->id)->get()->each->delete();
            }

            $product->applySmartDefaults();
            foreach ($product->variants as $variant) {
                $variant->applySmartDefaults();
            }

            $newVariantValues = $this->variantValueSnapshot($product);
            $this->recordProductValueChanges($product, $oldVariantValues, $newVariantValues, 'variant_values_updated');
        });

        // ไปหน้า Read (แสดงข้อมูลที่เพิ่งบันทึกแบบ read-only) แทนที่จะกลับไปหน้า
        // รายการสินค้า — ให้ผู้แก้ไขเห็นทันทีว่าสิ่งที่กรอกไปถูกบันทึกไว้ครบถ้วน
        // ถูกต้องจริงๆ ก่อนออกจากหน้านี้
        return to_route('catalog.products.show', $product)->with('success', 'Product updated successfully.');
    }

    /**
     * Per-panel save from the edit screen: PIM categories + the marketplace
     * category overrides. Mirrors the category slice of update() so behaviour
     * (legacy-code derivation, sync) stays identical — it just doesn't touch
     * anything else on the product.
     */
    public function updateCategories(Request $request, Product $product): RedirectResponse
    {
        $validated = $request->validate([
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['exists:categories,id'],
            'shopee_category_id' => ['nullable', 'integer', 'exists:shopee_categories,id'],
            'lazada_category_id' => ['nullable', 'integer', 'exists:lazada_categories,id'],
            'tiktok_category_id' => ['nullable', 'integer', 'exists:tiktok_categories,id'],
            'woocommerce_category_id' => ['nullable', 'integer', 'exists:woocommerce_categories,id'],
        ]);

        DB::transaction(function () use ($validated, $request, $product) {
            $oldCategoryIds = $product->categories()->pluck('categories.id')->map(fn ($id) => (int) $id)->sort()->values()->all();

            $product->update([
                'shopee_category_id' => $validated['shopee_category_id'] ?? null,
                'lazada_category_id' => $validated['lazada_category_id'] ?? null,
                'tiktok_category_id' => $validated['tiktok_category_id'] ?? null,
                'woocommerce_category_id' => $validated['woocommerce_category_id'] ?? null,
                'updated_by' => $request->user()?->id,
            ]);

            $newCategoryIds = collect($validated['category_ids'] ?? [])->map(fn ($id) => (int) $id)->sort()->values()->all();
            $product->categories()->sync($newCategoryIds);

            if ($oldCategoryIds !== $newCategoryIds) {
                ProductCategoryLinker::deriveLegacyCodesFromCategories($product, $newCategoryIds);
            }
        });

        return back()->with('success', 'Categories saved.');
    }

    /**
     * Per-panel save: the `pbrand` attribute value (System Brand side) plus
     * the marketplace brand overrides. `pbrand` is a plain select attribute —
     * not channel/locale scoped — so it's a single ProductValue row.
     */
    public function updateBrand(Request $request, Product $product): RedirectResponse
    {
        $pbrandId = Attribute::idForCode('pbrand');

        $validated = $request->validate([
            'pbrand' => [
                'nullable', 'string', 'max:255',
                $pbrandId ? Rule::exists('attribute_options', 'code')->where('attribute_id', $pbrandId) : 'string',
            ],
            'shopee_brand_id' => ['nullable', 'integer', 'exists:shopee_brands,id'],
            'lazada_brand_id' => ['nullable', 'integer', 'exists:lazada_brands,id'],
            'tiktok_brand_id' => ['nullable', 'integer', 'exists:tiktok_brands,id'],
            'woocommerce_brand_id' => ['nullable', 'integer', 'exists:woocommerce_brands,id'],
        ]);

        DB::transaction(function () use ($validated, $request, $product, $pbrandId) {
            $product->update([
                'shopee_brand_id' => $validated['shopee_brand_id'] ?? null,
                'lazada_brand_id' => $validated['lazada_brand_id'] ?? null,
                'tiktok_brand_id' => $validated['tiktok_brand_id'] ?? null,
                'woocommerce_brand_id' => $validated['woocommerce_brand_id'] ?? null,
                'updated_by' => $request->user()?->id,
            ]);

            if ($pbrandId) {
                $code = trim((string) ($validated['pbrand'] ?? ''));
                $row = ProductValue::where('product_id', $product->id)
                    ->where('attribute_id', $pbrandId)
                    ->whereNull('channel_id')->whereNull('locale_id');

                if ($code !== '') {
                    $row->exists()
                        ? $row->update(['value' => $code])
                        : ProductValue::create([
                            'product_id' => $product->id,
                            'attribute_id' => $pbrandId,
                            'channel_id' => null,
                            'locale_id' => null,
                            'value' => $code,
                        ]);
                } else {
                    $row->delete();
                }
            }
        });

        return back()->with('success', 'Brand saved.');
    }

    /**
     * Per-panel save: which shops the product is marked "published" to.
     * Same sync + audit as update()'s Sales Channels slice.
     */
    public function updateChannels(Request $request, Product $product): RedirectResponse
    {
        $validated = $request->validate([
            'published_shop_ids' => ['nullable', 'array'],
            'published_shop_ids.*' => ['exists:sales_platform_shops,id'],
        ]);

        DB::transaction(function () use ($validated, $product) {
            $oldShopIds = $product->platformShops()->pluck('sales_platform_shops.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            $newShopIds = collect($validated['published_shop_ids'] ?? [])->map(fn ($id) => (int) $id)->sort()->values()->all();
            $product->platformShops()->sync($newShopIds);

            if ($oldShopIds !== $newShopIds) {
                AuditLog::record('published_shops_updated', $product, ['shop_ids' => $oldShopIds], ['shop_ids' => $newShopIds]);
            }
        });

        return back()->with('success', 'Sales channels saved.');
    }

    public function destroy(Product $product): RedirectResponse
    {
        $productId = $product->id;

        // ลบ variant ลูกๆ ทีละตัว (ไม่พึ่ง parent_id cascadeOnDelete ของ FK)
        // เพื่อให้ Eloquent ยิง event `deleted` และ Auditable
        // บันทึกการลบไว้จริงๆ
        Product::where('parent_id', $product->id)->get()->each->delete();

        ProductValue::where('product_id', $product->id)->delete();
        $product->delete();

        event(new ProductDataChanged($productId, false));
        Product::bumpStorefrontVersion();

        return to_route('catalog.products.index')->with('success', 'Product deleted successfully.');
    }

    /**
     * ดึงค่าปัจจุบันของทุก attribute ที่ผูกกับ channel/locale
     * ตามคู่ channel/locale ที่ระบุ ใช้โดยหน้าแก้ไขสินค้าเพื่อดึงเฉพาะ
     * ฟิลด์ที่ผูกกับ scope นี้ใหม่ เวลาผู้ใช้เปลี่ยน channel หรือ locale
     */
    public function attributeValues(Request $request, Product $product): JsonResponse
    {
        $channelId = $request->query('channel_id');
        $localeId = $request->query('locale_id');

        $attributes = $this->scopableAttributesFor($product, $request->user());

        $values = [];
        foreach ($attributes as $attribute) {
            $values[$attribute->id] = null;
        }

        // จัดกลุ่ม attribute ตามรูปแบบ scope ของมัน เพื่อให้แต่ละกลุ่มดึงข้อมูลได้ด้วย
        // query เดียวรวดเดียว แทนที่จะยิง query แยกทีละ attribute (ปัญหา N+1)
        $attributes->groupBy(fn ($attribute) => ($attribute->is_channel_based ? '1' : '0').($attribute->is_locale_based ? '1' : '0'))
            ->each(function ($group) use (&$values, $product, $channelId, $localeId) {
                $first = $group->first();

                $query = ProductValue::where('product_id', $product->id)
                    ->whereIn('attribute_id', $group->pluck('id'))
                    ->where('channel_id', $first->is_channel_based ? $channelId : null);

                if ($first->is_locale_based) {
                    // ถ้า locale นี้ยังไม่มีค่าของตัวเอง ให้ fallback ไปใช้ค่า global
                    // (locale_id เป็น NULL) แทน — ค่าที่ import เข้ามาจะตกอยู่ใน
                    // global scope เสมอ (ดูที่ ProductRowImporter) จนกว่าจะมีใครมา
                    // แปลแยกตาม locale ทีหลัง ถ้าไม่มี fallback นี้ ฟิลด์ที่ผูกกับ
                    // locale ซึ่งเพิ่ง import มาใหม่ๆ จะดูเหมือนว่างเปล่า
                    // ทั้งที่จริงๆ มันมีค่าอยู่
                    $query->where(function ($q) use ($localeId) {
                        $q->whereNull('locale_id')->orWhere('locale_id', $localeId);
                    })->orderByRaw('CASE WHEN locale_id = ? THEN 0 ELSE 1 END ASC', [$localeId]);
                } else {
                    $query->whereNull('locale_id');
                }

                $query->get(['attribute_id', 'value'])
                    ->each(function ($value) use (&$values) {
                        $attributeId = $value->attribute_id;
                        // สำหรับ attribute ที่ผูกกับ locale แถวจะเรียงเอา locale ที่ใช้งานอยู่
                        // ขึ้นก่อนเสมอ ดังนั้นให้เอาแค่แถวแรกที่เจอของแต่ละ attribute เท่านั้น
                        if ($values[$attributeId] === null) {
                            $values[$attributeId] = $value->value;
                        }
                    });
            });

        return response()->json(['values' => $values]);
    }

    /**
     * สินค้าที่เกี่ยวข้อง/Up-sell/Cross-sell สำหรับพาเนล Associations
     * ในหน้าแก้ไขสินค้า โดย key เป็น association type code แต่ละรายการเป็น {id, sku, name}
     */
    private function associationsFor(Product $product): array
    {
        $records = $product->associations()->with(['associatedProduct', 'associationType'])->get();

        $names = $this->resolveProductNamesInCurrentLocale($records->pluck('associated_product_id'));

        $grouped = ['related' => [], 'up_sell' => [], 'cross_sell' => []];

        foreach ($records as $record) {
            $code = $record->associationType?->code;
            if (! isset($grouped[$code]) || ! $record->associatedProduct) {
                continue;
            }

            $grouped[$code][] = [
                'id' => $record->associatedProduct->id,
                'sku' => $record->associatedProduct->sku,
                'name' => ($names[$record->associatedProduct->id] ?? null) ?: $record->associatedProduct->sku,
            ];
        }

        return $grouped;
    }

    /**
     * ซิงค์แบบ replace-all-on-save สำหรับ association ทั้ง 3 ประเภท
     * ใช้แพทเทิร์นลบแล้วสร้างใหม่ เหมือนกับที่ใช้กับ variant ด้านบน
     */
    private function syncAssociations(Product $product, array $associations): void
    {
        foreach (['related', 'up_sell', 'cross_sell'] as $code) {
            $typeId = AssociationType::where('code', $code)->value('id');
            if (! $typeId) {
                continue;
            }

            ProductAssociation::where('owner_product_id', $product->id)
                ->where('association_type_id', $typeId)
                ->delete();

            $ids = collect($associations[$code] ?? [])->map(fn ($id) => (int) $id)->unique()->values();

            foreach ($ids as $associatedProductId) {
                ProductAssociation::create([
                    'owner_product_id' => $product->id,
                    'associated_product_id' => $associatedProductId,
                    'association_type_id' => $typeId,
                ]);
            }
        }
    }

    /**
     * ค่าปัจจุบันของ attribute ทั้งหมดของสินค้า จำกัดแค่ attribute id
     * ที่ระบุมา โดย key เป็น label ที่อ่านง่ายแบบ "code[channel:x,locale:y]"
     * เพื่อให้อ่านรู้เรื่องเวลาไปโชว์ในตาราง diff ของ audit log
     */
    private function productValueSnapshot(int $productId, Collection $attributeIds): array
    {
        if ($attributeIds->isEmpty()) {
            return [];
        }

        $codes = Attribute::whereIn('id', $attributeIds)->pluck('code', 'id');

        return ProductValue::where('product_id', $productId)
            ->whereIn('attribute_id', $attributeIds)
            ->get()
            ->mapWithKeys(function (ProductValue $value) use ($codes) {
                $label = $codes->get($value->attribute_id, "attribute_{$value->attribute_id}");
                $suffix = array_filter([
                    $value->channel_id ? "channel:{$value->channel_id}" : null,
                    $value->locale_id ? "locale:{$value->locale_id}" : null,
                ]);
                $key = $suffix ? "{$label}[".implode(',', $suffix).']' : $label;

                return [$key => $value->value];
            })
            ->all();
    }

    /**
     * เทียบผลลัพธ์ของ productValueSnapshot() สองชุด ถ้ามีอะไรเปลี่ยนแปลง
     * ก็บันทึกลง audit trail ของสินค้า คืนค่ากลับว่ามีการเปลี่ยนแปลงจริงหรือไม่
     * เพื่อให้ผู้เรียกใช้ตัดสินใจได้ว่าต้องแจ้งเตือน storefront หรือเปล่า
     */
    private function recordProductValueChanges(Product $product, array $oldValues, array $newValues, string $event = 'attribute_values_updated'): bool
    {
        $changedOld = [];
        $changedNew = [];

        foreach (array_unique(array_merge(array_keys($oldValues), array_keys($newValues))) as $key) {
            $old = $oldValues[$key] ?? null;
            $new = $newValues[$key] ?? null;

            if ($old !== $new) {
                $changedOld[$key] = $old;
                $changedNew[$key] = $new;
            }
        }

        if (empty($changedOld) && empty($changedNew)) {
            return false;
        }

        AuditLog::record($event, $product, $changedOld, $changedNew);

        return true;
    }

    /**
     * สแนปช็อตของทุกแถว ProductValue (ราคา, จำนวน, attribute ของ combination)
     * ที่เป็นของ variant ลูกทั้งหมดของสินค้าหลักตอนนี้ โดย key เป็น
     * "{variant sku}.{attribute code}" เพื่อให้ diff อ่านเข้าใจง่ายเมื่อไปโชว์ใน
     * audit trail ของสินค้าหลัก — เพราะ variant ไม่มีหน้าแก้ไขของตัวเอง
     * นี่จึงเป็นที่เดียวที่จะเห็นการเปลี่ยนแปลงของมันได้
     */
    private function variantValueSnapshot(Product $product): array
    {
        $variants = Product::where('parent_id', $product->id)->get(['id', 'sku']);

        if ($variants->isEmpty()) {
            return [];
        }

        $codes = Attribute::pluck('code', 'id');

        return ProductValue::whereIn('product_id', $variants->pluck('id'))
            ->get()
            ->mapWithKeys(function (ProductValue $value) use ($variants, $codes) {
                $sku = $variants->firstWhere('id', $value->product_id)?->sku ?? "product#{$value->product_id}";
                $label = $codes->get($value->attribute_id, "attribute_{$value->attribute_id}");

                return ["{$sku}.{$label}" => $value->value];
            })
            ->all();
    }

    /**
     * Attribute ที่ผูกกับ family ของสินค้า (หรือถ้า family ยังไม่ได้ผูก
     * attribute ไว้เลยก็เอาทั้งหมด) ที่แปรผันตาม channel และ/หรือ locale
     */
    /**
     * Attribute ที่มีสิทธิ์ให้ดึงค่าใหม่ตอนเปลี่ยน channel/locale โดย scope
     * ตาม family ของสินค้าและ — ให้ตรงกับการกรอง group/attribute ของ edit() —
     * ตามสิทธิ์ที่ $user มองเห็นได้ เพื่อไม่ให้การสลับ channel/locale
     * รั่วไหลค่าของ attribute ที่หน้าเว็บเองก็ซ่อนไว้อยู่แล้ว
     */
    private function scopableAttributesFor(Product $product, $user = null)
    {
        $familyAttributes = FamilyAttribute::with(['attribute', 'attributeGroup'])
            ->where('family_id', $product->family_id)
            ->get();

        if ($familyAttributes->isNotEmpty()) {
            $attributes = $familyAttributes
                ->filter(function ($fa) use ($user) {
                    $group = $fa->attributeGroup;
                    $attr = $fa->attribute;
                    if (! $group || ! $attr) {
                        return false;
                    }

                    if ($user && ! $this->canUserViewAttributeGroup($user, $group)) {
                        return false;
                    }

                    return ! $user || $this->canUserViewAttribute($user, $attr);
                })
                ->map(fn ($fa) => $fa->attribute);
        } else {
            // ยังไม่มี family attribute ให้ใช้เลย — edit() จะ fallback ไปโชว์
            // system attribute ทั้งหมดใต้หมวด "General" เลยทำแบบเดียวกันตรงนี้ด้วย
            $attributes = Attribute::all();

            if ($user) {
                $attributes = $attributes->filter(fn ($attr) => $this->canUserViewAttribute($user, $attr));
            }
        }

        return $attributes
            ->filter(fn ($attr) => $attr->is_channel_based || $attr->is_locale_based)
            ->values();
    }

    /**
     * เช็คว่าผู้ใช้มีสิทธิ์ดู attribute group นี้ไหม เป็นแค่ wrapper บางๆ
     * ที่เก็บไว้เพื่อไม่ต้องแก้จุดเรียกใช้เดิมทุกจุดใน controller นี้ —
     * กฎจริงๆ ตอนนี้ย้ายไปอยู่ที่ AttributeAccessPolicy แล้ว
     * (ใช้ร่วมกับตัวกรองคอลัมน์ตอน import/export สินค้าแบบ bulk)
     */
    private function canUserViewAttributeGroup($user, $group): bool
    {
        return $this->attributeAccess->canViewGroup($user, $group);
    }

    /**
     * เช็คว่าผู้ใช้มีสิทธิ์ดู attribute ตัวนี้ไหม ดูรายละเอียดเพิ่มเติม
     * ที่ docblock ของ canUserViewAttributeGroup()
     */
    private function canUserViewAttribute($user, $attribute): bool
    {
        return $this->attributeAccess->canViewAttribute($user, $attribute);
    }

    /**
     * เช็คว่าผู้ใช้มีสิทธิ์ *แก้ไข* ค่าของ attribute group นี้ไหม ดูรายละเอียด
     * เพิ่มเติมที่ docblock ของ canUserViewAttributeGroup()
     */
    private function canUserEditAttributeGroup($user, $group): bool
    {
        return $this->attributeAccess->canEditGroup($user, $group);
    }

    /**
     * เช็คว่าผู้ใช้มีสิทธิ์ *แก้ไข* ค่าของ attribute ตัวนี้ไหม ดูรายละเอียด
     * เพิ่มเติมที่ docblock ของ canUserViewAttributeGroup()
     */
    private function canUserEditAttribute($user, $attribute): bool
    {
        return $this->attributeAccess->canEditAttribute($user, $attribute);
    }

    /**
     * เติมข้อมูลลงใน `options` ของ attribute แบบ select/multiselect ที่ eager-load
     * มาแล้ว ว่าแต่ละ option ถูก map ไว้กับ marketplace ไหนบ้าง — ใช้วิธีคำนวณ
     * แบบเดียวกับที่ BrandController::index() และ CategoryController::tree()
     * ใช้กับคอลัมน์ mapped_platforms ของตัวเอง ตอนนี้มีแค่ `pbrand` เท่านั้นที่มี
     * ข้อมูลจริงในสี่คอลัมน์นี้ (ดูที่ shopee_brand_id/lazada_brand_id/
     * tiktok_brand_id/woocommerce_brand_id ของ AttributeOption) แต่ฟังก์ชันนี้
     * รันให้กับทุก attribute เหมือนกันหมด แทนที่จะเช็คเจาะจงแค่ code นี้ —
     * เพราะทำแบบนี้ต้นทุนถูก (ไม่ต้อง query เพิ่ม `options` โหลดมาแล้ว)
     * และยังใช้ได้ถูกต้องถ้าวันหน้ามี select attribute ตัวอื่นเกิด map กับ
     * marketplace แบบนี้ขึ้นมาบ้าง ถ้า attribute ตัวไหนไม่ได้โหลด relation
     * `options` ไว้ (เช่นพวกที่ไม่ใช่ select type) ฟังก์ชันนี้จะไม่ทำอะไรเลย
     */
    private function decorateOptionsWithMappedPlatforms(Attribute $attr): void
    {
        if (! $attr->relationLoaded('options')) {
            return;
        }

        foreach ($attr->options as $option) {
            $option->mapped_platforms = collect([
                'lazada' => $option->lazada_brand_id,
                'shopee' => $option->shopee_brand_id,
                'tiktok' => $option->tiktok_brand_id,
                'woocommerce' => $option->woocommerce_brand_id,
            ])->filter()->keys()->values()->all();
        }
    }
}
