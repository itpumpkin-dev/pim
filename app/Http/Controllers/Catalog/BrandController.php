<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AuditLog;
use App\Jobs\SyncLazadaBrandsJob;
use App\Jobs\SyncShopeeBrandsJob;
use App\Jobs\SyncTikTokBrandsJob;
use App\Models\Brand;
use App\Models\BrandTranslation;
use App\Models\Category;
use App\Models\JobTracker;
use App\Models\LazadaBrand;
use App\Models\LazadaSellerAccount;
use App\Models\Locale;
use App\Models\ProductValue;
use App\Models\ShopeeBrand;
use App\Models\ShopeeSellerAccount;
use App\Models\TikTokBrand;
use App\Models\TikTokSellerAccount;
use App\Models\WooCommerceBrand;
use App\Services\CodeGenerator;
use App\Services\Catalog\AttributeValueFormatter;
use App\Services\WooCommerce\WooCommerceClient;
use App\Support\TranslationTracking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Brands" เป็นหน้าจอเฉพาะทางสไตล์ WooCommerce — เดิมสร้างขึ้นมาบนแถว
 * AttributeOption ที่มีอยู่แล้วของ Attribute ชื่อ `pbrand` ตอนนี้เปลี่ยนมาเป็น
 * master table ของตัวเอง (`brands` + `brand_translations` — ดู Brand model)
 * ผูก master_source = 'brands' เข้ากับ attribute `pbrand` (ดู
 * MasterAttributeOptionSync) เพื่อให้เลือกเป็นแหล่งข้อมูล Master ของ attribute
 * อื่นได้ด้วย — แบรนด์ของสินค้ายังเก็บเป็น `ProductValue.value = Brand.code`
 * เหมือนเดิมทุกประการ (ไม่กระทบ) เพราะรหัส (code) เดิมทุกตัวถูกย้ายมาแบบคงเดิม
 * (ดู migration create_brands_table) thumbnail/parent_id/marketplace brand id
 * (Shopee/Lazada/TikTok/WooCommerce) ก็ย้ายมาที่นี่ทั้งหมดเช่นกัน — ไม่ใช่แค่
 * "ตัวเลือกของ select field" อีกต่อไป แต่เป็นข้อมูลที่
 * ResolvesProductAttributeValues::mappedBrandOptionId() (ใช้โดยทุก
 * marketplace ProductSyncService ตอน push สินค้าจริง) อ่านตรงจากตารางนี้แล้ว
 *
 * Helper เรื่อง translation/audit/code-generation ด้านล่างเลียนแบบ
 * BusinessTypeController/BaseUnitController มาเกือบทั้งหมด ต่างกันตรงที่ Brand
 * มีชื่อแปลได้หลายภาษาจริง (เหมือน Category/BaseUnit) เลยต้อง sync ผ่าน
 * BrandTranslation แยกออกมาแทนที่จะเป็นคอลัมน์ name เดียว
 */
class BrandController extends Controller
{
    /**
     * ตัว platform ที่รองรับสำหรับ marketplaceBrandSearch()/
     * marketplaceBrandLookup() ด้านล่าง — คู่หูของ CategoryController::
     * MARKETPLACE_CATEGORY_MODELS แต่สำหรับ brand แทน brand ของแต่ละ
     * marketplace เป็น flat list ไม่ใช่ tree (ไม่เหมือน category) เลยไม่ต้อง
     * มี children()/path() แบบนั้น มีแค่ search + lookup-by-id ก็พอ
     */
    private const MARKETPLACE_BRAND_MODELS = [
        'shopee' => ShopeeBrand::class,
        'lazada' => LazadaBrand::class,
        'tiktok' => TikTokBrand::class,
        'woocommerce' => WooCommerceBrand::class,
    ];

    private function brandAttribute(): Attribute
    {
        return Attribute::where('code', 'pbrand')->firstOrFail();
    }

    /**
     * ค้นหาแบรนด์ของ marketplace หนึ่งตัวโดยชื่อ — ใช้โดยตัวเลือกแบรนด์แบบ
     * search ของแต่ละ marketplace ใน Edit Product (resources/js/components/
     * marketplace-brand-picker.tsx) เฉพาะ Shopee เท่านั้นที่รับ `category_id`
     * เพิ่ม (informational, ไม่ใช่ FK จริง — ดู docblock ของ ShopeeBrand) เพื่อ
     * กรองให้ตรงกับหมวดหมู่ Shopee ที่สินค้านี้ resolve ไว้อยู่แล้ว ตาม UX เดียว
     * กับที่ shopeeBrandsForCategory() ด้านล่างใช้อยู่ก่อนแล้วสำหรับหน้า mapping
     */
    public function marketplaceBrandSearch(Request $request, string $platform): JsonResponse
    {
        abort_unless(array_key_exists($platform, self::MARKETPLACE_BRAND_MODELS), 404);

        $query = trim((string) $request->query('q', ''));
        if ($query === '') {
            return response()->json([]);
        }

        $model = self::MARKETPLACE_BRAND_MODELS[$platform];
        $categoryId = $platform === 'shopee' ? ($request->integer('category_id') ?: null) : null;

        $results = $model::query()
            ->where('name', 'like', "%{$query}%")
            ->when($categoryId, fn ($q) => $q->where('category_id', $categoryId))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name']);

        return response()->json($results);
    }

    /**
     * ชื่อของแบรนด์ marketplace หนึ่งตัวจาก id — ใช้แสดงชื่อของค่าที่เคยเลือกไว้
     * แล้วในกล่อง trigger ของ picker (เก็บแค่ id ไว้บน product เอง เลยต้อง
     * resolve ชื่อกลับมาแสดงทีหลัง)
     */
    public function marketplaceBrandLookup(Request $request, string $platform): JsonResponse
    {
        abort_unless(array_key_exists($platform, self::MARKETPLACE_BRAND_MODELS), 404);

        $id = $request->integer('id');
        $model = self::MARKETPLACE_BRAND_MODELS[$platform];
        $brand = $id ? $model::find($id, ['id', 'name']) : null;

        return response()->json($brand ? ['id' => $brand->id, 'name' => $brand->name] : null);
    }

    /**
     * value (code ของแบรนด์) => จำนวนสินค้าที่ไม่ซ้ำกัน สำหรับ badge
     * "products_count" บน index() เพราะต้อง scan product_values ทุกครั้งที่โหลด
     * เลยแคชไว้ด้วย TTL สั้นๆ แทนที่จะไม่แคชเลย — เลือกใช้ TTL ธรรมดาแทนการ
     * invalidate ตาม event เพราะแถว ProductValue ของ pbrand ถูกเขียนจากหลายจุด
     * มาก (สร้าง/แก้ไขสินค้า, import จำนวนมาก, sync กับ marketplace) ดังนั้นยอมให้
     * ตัวเลขบน badge เก่าไปสักไม่กี่นาทีปลอดภัยกว่าการพลาดจุดที่ต้อง invalidate
     * ตรงไหนสักที่
     */
    private function brandProductCounts(int $attributeId): \Illuminate\Support\Collection
    {
        return Cache::remember(
            "brands.product_counts:{$attributeId}",
            now()->addMinutes(10),
            fn () => ProductValue::where('attribute_id', $attributeId)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->select('value', DB::raw('count(distinct product_id) as cnt'))
                ->groupBy('value')
                ->pluck('cnt', 'value')
        );
    }

    public function index(Request $request): Response
    {
        $attribute = $this->brandAttribute();

        $search = $request->input('search');
        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        // รูปแบบเดียวกับตัวกรอง platform ของ CategoryController::index()
        $platformFilter = $request->input('platform');
        $platformColumns = [
            'shopee' => 'shopee_brand_id',
            'woocommerce' => 'woocommerce_brand_id',
            'lazada' => 'lazada_brand_id',
            'tiktok' => 'tiktok_brand_id',
        ];

        $brands = Brand::query()
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('slug', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            })
            ->when($platformFilter, function ($query, $platformFilter) use ($platformColumns) {
                if ($platformFilter === 'unmapped') {
                    foreach ($platformColumns as $column) {
                        $query->whereNull($column);
                    }
                } elseif ($platformFilter === 'mapped') {
                    $query->where(function ($q) use ($platformColumns) {
                        foreach ($platformColumns as $column) {
                            $q->orWhereNotNull($column);
                        }
                    });
                } elseif (isset($platformColumns[$platformFilter])) {
                    $query->whereNotNull($platformColumns[$platformFilter]);
                }
            })
            ->get();

        // ลิสต์แบรนด์มีขนาดเล็ก (หลักสิบ ไม่ใช่หลักพัน) — นับ/เรียงลำดับใน PHP หลังจาก
        // fetch มาครั้งเดียวง่ายกว่าและเร็วพอ แถมยังเลี่ยง SQL subquery สำหรับนับที่
        // ต้อง join กับสิ่งที่ไม่ใช่ Eloquent relation จริงๆ ได้ด้วย
        // (ProductValue.value = Brand.code ไม่ใช่ FK)
        $counts = $this->brandProductCounts($attribute->id);

        // `name` ดิบเป็นแค่ fallback ของ locale เริ่มต้นของแอป — หน้า list เดิม
        // ส่ง $brand->name ตรงๆ ไม่เคย resolve ตาม locale ปัจจุบันเลย ทับด้วย
        // คำแปลของ locale ปัจจุบันตรงนี้ก่อนส่งออกไป ถ้ามี (ไม่งั้นคงค่าดิบไว้
        // เป็น fallback) — ใช้ตัวเดียวกันทั้ง admin_label ของแถวเอง และ
        // parent_name (ชื่อ brand แม่ที่อ้างอิงไว้ ก็ควรเป็น locale เดียวกัน)
        $localeId = Locale::idForCode(app()->getLocale());
        $resolveBrandLabel = function (Brand $brand) use ($localeId) {
            $label = $localeId ? $brand->translations->firstWhere('locale_id', $localeId)?->label : null;

            return ($label !== null && trim($label) !== '') ? $label : $brand->name;
        };
        $nameById = $brands->mapWithKeys(fn (Brand $b) => [$b->id => $resolveBrandLabel($b)]);

        $rows = $brands->map(function (Brand $brand) use ($counts, $nameById, $resolveBrandLabel) {
            return [
                'id' => $brand->id,
                'code' => $brand->code,
                'admin_label' => $resolveBrandLabel($brand),
                'slug' => $brand->slug,
                'description' => $brand->description,
                'products_count' => (int) ($counts[$brand->code] ?? 0),
                'thumbnail_url' => AttributeValueFormatter::resolveStorageUrl($brand->thumbnail),
                'parent_id' => $brand->parent_id,
                'parent_name' => $brand->parent_id ? ($nameById[$brand->parent_id] ?? null) : null,
                'mapped_platforms' => collect([
                    'shopee' => $brand->shopee_brand_id,
                    'woocommerce' => $brand->woocommerce_brand_id,
                    'lazada' => $brand->lazada_brand_id,
                    'tiktok' => $brand->tiktok_brand_id,
                ])->filter()->keys()->values()->all(),
            ];
        });

        $sortableColumns = ['admin_label', 'description', 'slug', 'products_count'];
        $sortField = $request->input('sort');
        $sortDir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        if ($sortField && in_array($sortField, $sortableColumns, true)) {
            $rows = $sortDir === 'desc' ? $rows->sortByDesc($sortField) : $rows->sortBy($sortField);
        } else {
            $rows = $rows->sortBy('admin_label');
        }
        $rows = $rows->values();

        $page = (int) $request->input('page', 1);
        $paginated = new LengthAwarePaginator(
            $rows->forPage($page, $perPage)->values(),
            $rows->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()],
        );

        return Inertia::render('catalog/brands/index', [
            'brands' => $paginated,
            'parentOptions' => $this->parentOptionsList(),
            'attributeId' => $attribute->id,
            'filters' => [
                'search' => $search ?? '',
                'sort' => $sortField ?? '',
                'dir' => $sortField ? $sortDir : '',
                'platform' => $platformFilter ?? '',
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/brands/create', [
            'parentOptions' => $this->parentOptionsList(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'parent_id' => ['nullable', Rule::exists('brands', 'id')],
        ]);

        $translations = $validated['translations'] ?? [];
        $name = $this->resolveName($translations, $validated['admin_label'] ?? null);
        $thumbnailPath = $request->hasFile('thumbnail') ? $request->file('thumbnail')->store('brand-thumbnails', 'public') : null;

        $brand = CodeGenerator::createWithRetry(
            'brands',
            'brand',
            fn ($code) => Brand::create([
                'code' => $code,
                'parent_id' => $validated['parent_id'] ?? null,
                'name' => $name ?? $code,
                'slug' => $validated['slug'] ?? null,
                'description' => $validated['description'] ?? null,
                'thumbnail' => $thumbnailPath,
            ]),
        );

        $this->syncTranslations($brand, $translations);
        $this->autoTranslate($brand, $translations);

        AuditLog::record('brand_created', $this->brandAttribute(), null, $this->auditFields($brand));

        return to_route('catalog.brands.index')->with('success', 'Brand added successfully.');
    }

    public function edit(Brand $brand): Response
    {
        $translations = $brand->translations
            ->mapWithKeys(fn (BrandTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();

        return Inertia::render('catalog/brands/edit', [
            'brand' => [
                'id' => $brand->id,
                'code' => $brand->code,
                'admin_label' => $brand->name,
                'slug' => $brand->slug,
                'description' => $brand->description,
                'parent_id' => $brand->parent_id,
                'thumbnail_url' => AttributeValueFormatter::resolveStorageUrl($brand->thumbnail),
                // Brand-level marketplace mapping (each platform's own brand id).
                // The picker resolves the name from the id on its own.
                'shopee_brand_id' => $brand->shopee_brand_id,
                'lazada_brand_id' => $brand->lazada_brand_id,
                'tiktok_brand_id' => $brand->tiktok_brand_id,
                'woocommerce_brand_id' => $brand->woocommerce_brand_id,
            ],
            'translations' => $translations,
            'parentOptions' => $this->parentOptionsList(excludeId: $brand->id),
        ]);
    }

    public function update(Request $request, Brand $brand): RedirectResponse
    {
        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'parent_id' => [
                'nullable',
                Rule::exists('brands', 'id'),
                Rule::notIn([$brand->id]),
            ],
            'shopee_brand_id' => ['nullable', 'integer', Rule::exists('shopee_brands', 'id')],
            'lazada_brand_id' => ['nullable', 'integer', Rule::exists('lazada_brands', 'id')],
            'tiktok_brand_id' => ['nullable', 'integer', Rule::exists('tiktok_brands', 'id')],
            'woocommerce_brand_id' => ['nullable', 'integer', Rule::exists('woocommerce_brands', 'id')],
        ]);

        $translations = $validated['translations'] ?? [];

        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->store('brand-thumbnails', 'public')
            : $brand->thumbnail;

        $oldFields = $this->auditFields($brand);

        $brand->update([
            'parent_id' => $validated['parent_id'] ?? null,
            'name' => $this->resolveName($translations, $validated['admin_label'] ?? null) ?? $brand->name,
            'slug' => $validated['slug'] ?? null,
            'description' => $validated['description'] ?? null,
            'thumbnail' => $thumbnailPath,
            'shopee_brand_id' => $validated['shopee_brand_id'] ?? null,
            'lazada_brand_id' => $validated['lazada_brand_id'] ?? null,
            'tiktok_brand_id' => $validated['tiktok_brand_id'] ?? null,
            'woocommerce_brand_id' => $validated['woocommerce_brand_id'] ?? null,
        ]);

        $this->syncTranslations($brand, $translations);
        $this->autoTranslate($brand, $translations);

        $newFields = $this->auditFields($brand->fresh());
        if ($oldFields !== $newFields) {
            AuditLog::record('brand_updated', $this->brandAttribute(), $oldFields, $newFields);
        }

        return back()->with('success', 'Brand updated successfully.');
    }

    public function destroy(Brand $brand): RedirectResponse
    {
        $oldFields = $this->auditFields($brand);
        $brand->delete();

        AuditLog::record('brand_deleted', $this->brandAttribute(), $oldFields, null);

        return back()->with('success', 'Brand deleted successfully.');
    }

    // หน้า/เมธอด marketplaceSync() แบบฮับเดิม (brands/marketplace-sync.tsx)
    // ถูกลบไปแล้ว — props ทั้งสองตัวของมัน (lastSyncedAt/activeSyncJobs) และทุกอย่าง
    // ที่มันลิงก์ไป ตอนนี้ย้ายไปอยู่ที่ CategoryController::marketplaceSync() /
    // categories/marketplace-sync.tsx แทนแล้ว

    /**
     * เข้าคิว (queue) การรีเฟรชแคช shopee_brands แทนที่จะรันตรงๆ ทันที — ต่างจาก
     * CategoryController::syncShopeeCategories() (เรียกครั้งเดียวได้ต้นไม้หมวดหมู่
     * ทั้งหมดของ Shopee เลย) ตรงที่ get_brand_list ของ Shopee จะจำกัดแค่ 1
     * category_id ต่อการเรียก 1 ครั้ง แถมอย่างน้อยก็มีหมวดหมู่ที่แมปไว้จริงในร้านนี้
     * ที่มีแบรนด์อยู่ข้างใต้เกิน 10,000 แบรนด์ (ทดสอบจริงแล้ว has_next_page ยังเป็น
     * true อยู่แม้เลย offset 9950 ไปแล้ว) ดังนั้นการ sync แบบเต็มรูปแบบจึงเป็นงาน
     * ที่ต้องรอ network หลายนาที เกินเวลา timeout ของ web request ไปมาก
     * SyncShopeeBrandsJob เป็นตัวที่ทำ loop ดึงข้อมูลจริงๆ ส่วนตรงนี้แค่เช็คเงื่อนไข
     * เบื้องต้นแบบเร็วๆ แล้วส่ง JobTracker id กลับไปให้ frontend เอาไป poll ผ่าน
     * shopeeBrandSyncStatus()
     */
    public function syncShopeeBrands(Request $request): JsonResponse
    {
        $account = ShopeeSellerAccount::first();
        if (! $account) {
            return response()->json(['message' => 'No Shopee seller account found to authenticate the sync.'], 422);
        }

        $categoryIds = Category::whereNotNull('shopee_category_id')->distinct()->pluck('shopee_category_id');
        if ($categoryIds->isEmpty()) {
            return response()->json(['message' => 'No PIM categories are mapped to a Shopee category yet — map categories first (Categories > Marketplace Sync > Shopee), then sync brands.'], 422);
        }

        $tracker = JobTracker::create([
            'job_type' => 'brand_sync',
            'entity_type' => 'shopee_brands',
            'config_code' => 'shopee',
            'status' => 'pending',
            'user_id' => $request->user()?->id,
        ]);

        SyncShopeeBrandsJob::dispatch($tracker->id);

        return response()->json(['job_tracker_id' => $tracker->id]);
    }

    /**
     * เข้าคิว (queue) การรีเฟรชแคช lazada_brands — SyncLazadaBrandsJob เป็นตัวที่
     * ทำ loop ดึงข้อมูลจริงๆ ตรงนี้แค่ส่ง JobTracker id กลับไป ต่างจาก
     * syncShopeeBrands() ตรงที่ไม่มีเงื่อนไข "ต้องแมปหมวดหมู่ก่อน" เลย เพราะ
     * /category/brands/query ของ Lazada ไม่ได้ผูกกับหมวดหมู่ไหนเลย (เช็คจากของจริง
     * แล้ว endpoint นี้ไม่มี parameter หมวดหมู่ให้ใส่) เลยดึงแคตตาล็อกแบรนด์ทั้งหมด
     * กว่า 153,000 รายการมาแบบไม่มีเงื่อนไขใดๆ
     */
    public function syncLazadaBrands(Request $request): JsonResponse
    {
        $account = LazadaSellerAccount::active()->first();
        if (! $account) {
            return response()->json(['message' => 'No active Lazada seller account found to authenticate the sync.'], 422);
        }

        $tracker = JobTracker::create([
            'job_type' => 'brand_sync',
            'entity_type' => 'lazada_brands',
            'config_code' => 'lazada',
            'status' => 'pending',
            'user_id' => $request->user()?->id,
        ]);

        SyncLazadaBrandsJob::dispatch($tracker->id);

        return response()->json(['job_tracker_id' => $tracker->id]);
    }

    /**
     * เข้าคิว (queue) การรีเฟรชแคช tiktok_brands — SyncTikTokBrandsJob เป็นตัวที่
     * ทำ loop ดึงข้อมูลจริงๆ ไม่มีเงื่อนไข "ต้องแมปหมวดหมู่ก่อน" แบบเดียวกับ Lazada:
     * category_id ของ TikTokClient::getBrands() เป็น optional ถ้าไม่ใส่ก็จะได้
     * ลิสต์แบรนด์ทั้งหมดของร้านกลับมา — เช็คจากของจริงแล้วเมื่อ 2026-08-21 ยังมี
     * ถึง 10,000 รายการสำหรับ account นี้ เลยต้องเข้าคิวแทนที่จะรันแบบ synchronous
     */
    public function syncTiktokBrands(Request $request): JsonResponse
    {
        $account = TikTokSellerAccount::first();
        if (! $account) {
            return response()->json(['message' => 'No TikTok seller account found to authenticate the sync.'], 422);
        }

        $tracker = JobTracker::create([
            'job_type' => 'brand_sync',
            'entity_type' => 'tiktok_brands',
            'config_code' => 'tiktok',
            'status' => 'pending',
            'user_id' => $request->user()?->id,
        ]);

        SyncTikTokBrandsJob::dispatch($tracker->id);

        return response()->json(['job_tracker_id' => $tracker->id]);
    }

    /**
     * ถูก poll จากหน้า marketplace-sync ตอนมี sync ที่เข้าคิวไว้ (Shopee, Lazada,
     * หรือ TikTok) กำลังรันอยู่ — ตั้งใจให้อยู่ใน controller นี้ (แทนที่จะใช้ route
     * JobTrackerController::status() แบบทั่วไปของ import/export) เพราะ job นี้
     * ไม่ได้ผูกกับ ImportConfig/ExportConfig และไม่ควรไปปนอยู่ในลิสต์ job ที่ไม่
     * เกี่ยวข้องกันนั้น ทำแบบ generic ตาม job_type แทนที่จะเจาะจงแพลตฟอร์มใดแพลตฟอร์ม
     * หนึ่ง — เดิมชื่อ shopeeBrandSyncStatus() ตอนที่ Shopee เป็นแพลตฟอร์มเดียวที่
     * เข้าคิว แต่ตัวโค้ดจริงๆ ไม่เคยเช็คเลยว่าเป็นแพลตฟอร์มไหน เลยให้ทุกแพลตฟอร์มอื่น
     * ที่เข้าคิวใช้ตัวนี้ร่วมกันได้เลยโดยไม่ต้องแก้อะไร
     */
    public function brandSyncStatus(JobTracker $jobTracker): JsonResponse
    {
        abort_unless($jobTracker->job_type === 'brand_sync', 404);

        return response()->json([
            'status' => $jobTracker->status,
            'total_rows_processed' => $jobTracker->total_rows_processed,
            'total_records_created' => $jobTracker->total_records_created,
            'completed_at' => $jobTracker->completed_at?->toIso8601String(),
            'error_log' => $jobTracker->error_log,
        ]);
    }

    /**
     * ขอให้ sync ที่กำลังรันอยู่ (Shopee, Lazada, หรือ TikTok) หยุดทำงาน — ทำงาน
     * เหมือนกับการส่งสัญญาณ cancel_requested_at ของ
     * JobTrackerController::cancel() แต่แยกเป็น JSON endpoint ของตัวเองด้วยเหตุผล
     * เดียวกับ brandSyncStatus() ด้านบน จะมีผลจริงก็ต่อเมื่อ job เช็คสถานะรอบถัดไป
     * เท่านั้น (ดู progress-flush interval ของแต่ละ job) เพราะฉะนั้น tracker อาจยัง
     * โชว์สถานะ 'processing' ต่อไปอีกสักครู่หลังจากเรียกตัวนี้แล้ว
     */
    public function cancelBrandSync(JobTracker $jobTracker): JsonResponse
    {
        abort_unless($jobTracker->job_type === 'brand_sync', 404);
        abort_unless(in_array($jobTracker->status, ['pending', 'processing'], true), 422);

        if (! $jobTracker->cancel_requested_at) {
            $jobTracker->update(['cancel_requested_at' => now()]);
        }

        return response()->json(['message' => 'Cancellation requested — the sync will stop shortly.']);
    }

    /**
     * รีเฟรชแคช woocommerce_brands ในระบบ — ต่างจาก Shopee ตรงที่ตัวนี้รันแบบ
     * synchronous เลย (ไม่ต้องใช้ JobTracker/queued job): endpoint Product
     * Brands ของ WooCommerce จะคืนข้อมูลทั้งหมดมาในไม่กี่หน้า (เช็คจากของจริงแล้ว
     * เมื่อ 2026-08-21 ร้านจริงมีแบรนด์แค่ 4 แบรนด์เท่านั้น) เลยห่างไกลจากขนาดที่
     * เคยบังคับให้ต้องสร้าง SyncShopeeBrandsJob ขึ้นมามาก ทำงานเหมือนกับ
     * CategoryController::syncWoocommerceCategories() เป๊ะๆ — ใช้รูปแบบ
     * pagination แบบ do/while-จนกว่าจะได้หน้าที่มีข้อมูลน้อยลงเหมือนกัน
     */
    public function syncWoocommerceBrands(): RedirectResponse
    {
        try {
            $client = new WooCommerceClient();
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        $rows = [];
        $page = 1;
        do {
            $fetched = $client->getBrands($page);
            foreach ($fetched as $node) {
                $rows[] = [
                    'id' => $node['id'],
                    'name' => $node['name'],
                    'slug' => $node['slug'] ?? null,
                ];
            }
            $page++;
        } while (count($fetched) === 100);

        $now = now();
        foreach (array_chunk($rows, 500) as $chunk) {
            WooCommerceBrand::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['name', 'slug', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($rows).' WooCommerce brands.');
    }

    // ไม่มี searchWoocommerceBrands()/WooCommerceBrandPicker,
    // searchLazadaBrands()/LazadaBrandPicker, หรือ searchTiktokBrands()/
    // TikTokBrandPicker แล้ว — ตอนนี้ตาราง Brands ของทุกแพลตฟอร์มแมปกลับด้าน
    // (เลือก PIM brand ให้กับแถวแบรนด์ของ marketplace ผ่าน PimBrandPicker →
    // searchPimBrands() ด้านล่าง) เหมือนกับที่ Shopee ทำเป็นเจ้าแรก

    // ไม่มี searchMarketplaceBrands()/serializeMarketplaceBrands() แล้วเช่นกัน —
    // ตัวค้นหาแบรนด์ของ marketplace ตามชื่อของทุกแพลตฟอร์มถูกลบไปแล้ว (ดูคอมเมนต์
    // ด้านบน) ส่วนการจัดการ id 19 หลักของ TikTok แบบเก็บเป็น string
    // (JSON.parse ของ JS จะปัดเศษเงียบๆ เมื่อค่าเกิน Number.MAX_SAFE_INTEGER —
    // เช็คจากของจริงแล้ว 7417026736480880390 จะกลายเป็น 7417026736480881000
    // หลัง parse) ตอนนี้ย้ายไปอยู่ใน tiktokBrandsList() ด้านล่างโดยตรงแทน

    public function bulkMapShopeeBrand(Request $request): RedirectResponse|JsonResponse
    {
        return $this->bulkMapMarketplaceBrand($request, 'shopee_brand_id', ShopeeBrand::class, 'brand_shopee_mapped');
    }

    /**
     * เหมือนกับ syncShopeeBrands() ด้านล่าง แต่ทำแค่หมวดหมู่ Shopee เดียว — เป็น
     * action ของแถว "Sync brand" บนหน้า categories/shopee-mapping.tsx ตอนนี้ที่
     * การแมปหมวดหมู่กับการแมปแบรนด์อยู่หน้าเดียวกันแล้ว (ดูเหตุผลได้ที่ docblock
     * ของหน้านั้น: get_brand_list ผูกกับหมวดหมู่อยู่แล้ว การดูแบรนด์ของหมวดหมู่นั้น
     * ก็เลยสมเหตุสมผลที่สุดตรงจุดที่กำลังดูหมวดหมู่นั้นอยู่พอดี)
     */
    public function syncShopeeBrandsForCategory(Request $request): JsonResponse
    {
        $account = ShopeeSellerAccount::first();
        if (! $account) {
            return response()->json(['message' => 'No Shopee seller account found to authenticate the sync.'], 422);
        }

        $validated = $request->validate([
            'shopee_category_id' => ['required', 'integer', 'exists:shopee_categories,id'],
        ]);

        $tracker = JobTracker::create([
            'job_type' => 'brand_sync',
            'entity_type' => 'shopee_brands',
            'config_code' => 'shopee',
            'status' => 'pending',
            'user_id' => $request->user()?->id,
        ]);

        SyncShopeeBrandsJob::dispatch($tracker->id, [$validated['shopee_category_id']]);

        return response()->json(['job_tracker_id' => $tracker->id]);
    }

    /**
     * แบรนด์ Shopee ที่แคชไว้สำหรับหมวดหมู่หนึ่งๆ (ดูหมายเหตุของ ShopeeCategory ที่
     * บอกว่าคอลัมน์นี้ "ใช้บอกข้อมูลเฉยๆ ไม่ใช่ FK จริง" — ที่ list ออกมาก็คือสิ่งที่
     * sync ล่าสุดของหมวดหมู่นั้นเจอจริงๆ) แต่ละตัวจะแนบมาด้วยว่า PIM brand ไหนแมป
     * อยู่ (ถ้ามี) เป็นข้อมูลหนุนหลังคอลัมน์ "จับคู่แบรนด์กับ PIM" บนตาราง Shopee
     * Brands แบบละเอียดในหน้า categories/shopee-mapping.tsx (จะเปลี่ยนตามแถว
     * หมวดหมู่ที่เลือกไว้ด้านบนมัน)
     */
    public function shopeeBrandsForCategory(Request $request, int $shopeeCategoryId): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        // ใช้ paginate ไม่ได้ get() มาทีเดียว — ลิสต์แบรนด์ของหมวดหมู่หนึ่งๆ อาจมีถึง
        // หลักหมื่น (เช็คจากของจริงแล้ว 12,102 รายการสำหรับหมวดหมู่จริงหมวดหนึ่ง
        // หลังจากแก้ pagination-cursor ใน SyncShopeeBrandsJob ให้ดึงมาได้ครบจริงๆ)
        // การส่งและ render ข้อมูลเยอะขนาดนั้นทีเดียวเป็นสาเหตุที่ทำให้ตารางนี้โหลดช้า
        // ตอนนี้ frontend เลยขอทีละหน้า เหมือนกับตาราง categories ด้านบนมัน
        $query = ShopeeBrand::where('category_id', $shopeeCategoryId);

        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $paginated = $query->orderBy('name')->paginate($perPage)->withQueryString();

        $mappedByBrandId = Brand::whereIn('shopee_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'name', 'shopee_brand_id'])
            ->keyBy('shopee_brand_id');

        $rows = $paginated->getCollection()->map(fn (ShopeeBrand $brand) => [
            'id' => $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->name]
                : null,
        ]);

        return response()->json([
            'data' => $rows->values(),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
        ]);
    }

    /**
     * endpoint สำหรับค้นหาที่หนุนหลัง Autocomplete ของ PIM brand ทั้งบนตาราง Brands
     * ของ Shopee และ Lazada (categories/shopee-mapping.tsx,
     * categories/lazada-mapping.tsx) — เป็นภาพสะท้อนกลับด้านของ
     * searchTiktokBrands()/searchWoocommerceBrands() ด้านล่าง: ตัวเหล่านั้นค้นหา
     * แคชแบรนด์ของ marketplace ตามชื่อ ส่วนตัวนี้ค้นหาแบรนด์ของเราเอง (`brands`)
     * ตามชื่อ เพราะสองตารางนั้นแมปกลับด้าน (เลือก PIM brand ให้กับแถว
     * แบรนด์ของ marketplace ไม่ใช่กลับด้านกัน — ส่วนหน้าแมปแบรนด์ของ
     * TikTok/WooCommerce เองยังทำแบบเดิมอยู่)
     */
    public function searchPimBrands(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $brands = Brand::query()
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($q2) use ($query) {
                    $q2->where('name', 'like', "%{$query}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$query}%"));
                });
            })
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name']);

        return response()->json(['data' => $brands->map(fn (Brand $b) => ['id' => $b->id, 'name' => $b->name])]);
    }

    /**
     * แบรนด์ของ WooCommerce แบบ paginate + ค้นหาได้ แต่ละตัวจะแนบมาด้วยว่า PIM
     * brand ไหนแมปอยู่ (ถ้ามี) เป็นข้อมูลหนุนหลังตาราง Brands บนหน้า
     * categories/woocommerce-mapping.tsx — ทำงานเหมือนกับ lazadaBrandsList()
     * เป๊ะๆ ลิสต์แบรนด์ของ WooCommerce เองมีขนาดเล็กมาก (เช็คจากของจริงแล้วมีแค่
     * 4 แบรนด์สำหรับร้านนี้) pagination เลยแทบไม่มีผลอะไร แต่ก็ยังคงรูปแบบไว้
     * เหมือนกับลิสต์ของทุกแพลตฟอร์มอื่น
     */
    public function woocommerceBrandsList(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $query = WooCommerceBrand::query();

        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $paginated = $query->orderBy('name')->paginate($perPage)->withQueryString();

        $mappedByBrandId = Brand::whereIn('woocommerce_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'name', 'woocommerce_brand_id'])
            ->keyBy('woocommerce_brand_id');

        $rows = $paginated->getCollection()->map(fn (WooCommerceBrand $brand) => [
            'id' => $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->name]
                : null,
        ]);

        return response()->json([
            'data' => $rows->values(),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
        ]);
    }

    public function bulkMapWoocommerceBrand(Request $request): RedirectResponse|JsonResponse
    {
        return $this->bulkMapMarketplaceBrand($request, 'woocommerce_brand_id', WooCommerceBrand::class, 'brand_woocommerce_mapped');
    }

    /**
     * แบรนด์ของ Lazada แบบ paginate + ค้นหาได้ แต่ละตัวจะแนบมาด้วยว่า PIM brand
     * ไหนแมปอยู่ (ถ้ามี) เป็นข้อมูลหนุนหลังคอลัมน์ "จับคู่กับแบรนด์ PIM" บนตาราง
     * Lazada Brands ในหน้า categories/lazada-mapping.tsx — ทำงานเหมือนกับ
     * BrandController::shopeeBrandsForCategory() เป๊ะๆ (แถว = แบรนด์ของ
     * marketplace, มี PimBrandPicker อยู่ในคอลัมน์ mapping) แค่ไม่มีการจำกัดขอบเขต
     * ด้วยหมวดหมู่: แคตตาล็อกแบรนด์ของ Lazada ไม่ได้ผูกกับหมวดหมู่เลย (ดู docblock
     * ของ syncLazadaBrands()) ตัวนี้เลยขับเคลื่อนด้วย route param ไม่ได้ — ใช้การ
     * search/pagination round trip ของตัวเองแทน
     *
     * ใช้รูปแบบยึดแถว (row-centric) แบบนี้ (ไม่ใช่รูปแบบยึด PIM-option แบบเดิมที่
     * buildBrandMappingData() ซึ่งตอนนี้ลบไปแล้วเคยสร้าง) — เพราะรูปแบบเดิมของ
     * helper ตัวนั้นที่ "ไล่ดูลิสต์ PIM brand แล้วเลือกแบรนด์ของ marketplace ให้แต่ละตัว"
     * มันอ่านย้อนกลับด้านเมื่อวางไว้ข้างๆ ตาราง Brands ของ Shopee เองที่อยู่ด้านบนใน
     * หน้าเดียวกัน ซึ่งไปคนละทางกัน (ตอนนี้ตาราง Brands ของทุกแพลตฟอร์มใช้รูปแบบ
     * ยึดแถวแบบนี้เหมือนกันหมดแล้ว)
     */
    public function lazadaBrandsList(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $query = LazadaBrand::query();

        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $paginated = $query->orderBy('name')->paginate($perPage)->withQueryString();

        $mappedByBrandId = Brand::whereIn('lazada_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'name', 'lazada_brand_id'])
            ->keyBy('lazada_brand_id');

        $rows = $paginated->getCollection()->map(fn (LazadaBrand $brand) => [
            'id' => $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->name]
                : null,
        ]);

        return response()->json([
            'data' => $rows->values(),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
        ]);
    }

    public function bulkMapLazadaBrand(Request $request): RedirectResponse|JsonResponse
    {
        return $this->bulkMapMarketplaceBrand($request, 'lazada_brand_id', LazadaBrand::class, 'brand_lazada_mapped');
    }

    /**
     * แบรนด์ของ TikTok แบบ paginate + ค้นหาได้ แต่ละตัวจะแนบมาด้วยว่า PIM brand
     * ไหนแมปอยู่ (ถ้ามี) เป็นข้อมูลหนุนหลังตาราง Brands บนหน้า
     * categories/tiktok-mapping.tsx — ทำงานเหมือนกับ lazadaBrandsList() เป๊ะๆ
     * (TikTokBrand เป็นโครงสร้างแบน ไม่มี category_id เหมือนกับ LazadaBrand —
     * ดู docblock ของ model นั้น)
     */
    public function tiktokBrandsList(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $query = TikTokBrand::query();

        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $paginated = $query->orderBy('name')->paginate($perPage)->withQueryString();

        // brand id ของ TikTok เองมีขนาดใหญ่พอ (19 หลัก เช็คจากของจริงแล้ว) จนต้อง
        // ระวัง — PHP native int ยังเก็บ/คืนค่าได้ครบถ้วนไม่มีปัดเศษ แต่ JSON.parse
        // ของ JS ทำไม่ได้ (เช็คจากของจริงแล้ว 7417026736480880390 จะกลายเป็น
        // 7417026736480881000 หลัง parse) เลยส่งเป็น string ตรงนี้เพื่อเลี่ยงปัญหานั้น
        $mappedByBrandId = Brand::whereIn('tiktok_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'name', 'tiktok_brand_id'])
            ->keyBy('tiktok_brand_id');

        $rows = $paginated->getCollection()->map(fn (TikTokBrand $brand) => [
            'id' => (string) $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->name]
                : null,
        ]);

        return response()->json([
            'data' => $rows->values(),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
        ]);
    }

    public function bulkMapTiktokBrand(Request $request): RedirectResponse|JsonResponse
    {
        return $this->bulkMapMarketplaceBrand($request, 'tiktok_brand_id', TikTokBrand::class, 'brand_tiktok_mapped');
    }

    /**
     * @param  class-string<ShopeeBrand|WooCommerceBrand|LazadaBrand|TikTokBrand>  $marketplaceModel
     */
    private function bulkMapMarketplaceBrand(Request $request, string $fkColumn, string $marketplaceModel, string $auditEvent): RedirectResponse|JsonResponse
    {
        $attribute = $this->brandAttribute();
        $table = (new $marketplaceModel())->getTable();

        $validated = $request->validate([
            'mappings' => ['required', 'array'],
            'mappings.*.option_id' => ['required', 'integer', Rule::exists('brands', 'id')],
            'mappings.*.marketplace_brand_id' => ['nullable', 'integer', Rule::exists($table, 'id')],
        ]);

        $updated = 0;

        foreach ($validated['mappings'] as $mapping) {
            $brand = Brand::find($mapping['option_id']);
            if (! $brand) {
                continue;
            }

            // แปลงเป็น int ก่อนเทียบ/บันทึก — โดยเฉพาะ TikTok ที่ frontend ส่งค่านี้มา
            // เป็น numeric string (ดูเหตุผลที่ docblock ของ tiktokBrandsList())
            // ซึ่งถ้าไม่แปลงจะไม่มีวันเท่ากับ int แบบ strict ที่ PHP/Postgres คืนมา
            // ให้คอลัมน์นี้อยู่แล้ว ทำให้เงื่อนไข skip "แมปค่านี้อยู่แล้ว" ด้านล่างไม่มีวัน
            // ทำงาน PHP native int เก็บค่า id พวกนี้ได้แม่นยำ (เช็คจากของจริงแล้ว
            // id 19 หลักของ TikTok เก็บ/คืนค่าได้ครบไม่มีปัดเศษ) เพราะฉะนั้นการ
            // normalize แบบนี้ปลอดภัยสำหรับทุกแพลตฟอร์ม ไม่ใช่แค่ TikTok — ส่วนอีก
            // 3 แพลตฟอร์มที่เหลือก็ส่ง/รับเป็น int ธรรมดาอยู่แล้วทุกวันนี้
            $newId = isset($mapping['marketplace_brand_id']) ? (int) $mapping['marketplace_brand_id'] : null;
            if ($brand->{$fkColumn} === $newId) {
                continue;
            }

            $oldId = $brand->{$fkColumn};
            $brand->update([$fkColumn => $newId]);

            AuditLog::record(
                $auditEvent,
                $attribute,
                ["brand#{$brand->id}.{$fkColumn}" => $oldId],
                ["brand#{$brand->id}.{$fkColumn}" => $newId],
            );
            $updated++;
        }

        // ตัวเลือกแบรนด์รายหมวดหมู่ที่ฝังอยู่ในหน้า categories/shopee-mapping.tsx
        // จะเรียก endpoint นี้ผ่าน fetch ธรรมดา (Accept: application/json) แทนที่จะ
        // เป็นการ visit แบบ Inertia — เพราะมันบันทึกทีละตัวเลือกแบบ inline อยู่ใน
        // cell ของตาราง ถ้าต้อง redirect ทั้งหน้า/แสดง toast แบบ round trip เต็มรูปแบบ
        // จะดูสะดุดเกินไป ส่วนตัวเรียกอื่นๆ ที่เหลือเป็น Inertia POST จริงๆ
        // (ไม่มี Accept header เป็น json ชัดเจน) เลยไม่กระทบ response ของพวกนั้นเลย
        if ($request->wantsJson()) {
            return response()->json(['updated' => $updated]);
        }

        return back()->with('success', "Updated {$updated} brand mapping(s).");
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    private function parentOptionsList(?int $excludeId = null): array
    {
        return Brand::query()
            ->when($excludeId, fn ($q, $excludeId) => $q->where('id', '!=', $excludeId))
            ->get(['id', 'name'])
            ->map(fn (Brand $brand) => ['id' => $brand->id, 'name' => $brand->name])
            ->values()
            ->all();
    }

    /**
     * ทำงานเหมือนกับ BaseUnitController::auditFields() — ใช้ prefix
     * brand#{id}.* ขยายเพิ่มด้วยคอลัมน์แบรนด์เฉพาะทาง เพื่อให้ไปโชว์ในแท็บ
     * History ของ Attribute แม่ด้วย
     */
    private function auditFields(Brand $brand): array
    {
        $prefix = "brand#{$brand->id}";

        return collect($brand->only([
            'code', 'name', 'slug', 'description', 'thumbnail', 'parent_id',
            'shopee_brand_id', 'lazada_brand_id', 'tiktok_brand_id', 'woocommerce_brand_id',
        ]))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }

    /**
     * คัดลอกมาจาก BaseUnitController::resolveName() — ทำให้คอลัมน์ `name`
     * ตรงกับคำแปลของ locale เริ่มต้นของแอปเสมอ
     */
    private function resolveName(array $translations, ?string $adminLabel): ?string
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));

        if ($defaultLocaleId !== null && ! empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');
        if ($firstNonEmpty !== null) {
            return trim($firstNonEmpty);
        }

        return $adminLabel !== null && trim($adminLabel) !== '' ? trim($adminLabel) : null;
    }

    /**
     * คัดลอกมาจาก BaseUnitController::autoTranslate() — ยึดตามแฟล็ก
     * "AI translate" ของ attribute แม่ (pbrand) เหมือนกับ option อื่นๆ ทุกตัวที่
     * อยู่ข้างใต้มัน
     */
    private function autoTranslate(Brand $brand, array $translations): void
    {
        $attribute = $this->brandAttribute();
        if (! $attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        TranslationTracking::dispatchLabels(
            BrandTranslation::class,
            'brand_id',
            $brand->id,
            $sourceLocaleId,
            $sourceLabel,
            'brands',
            $brand->code,
            auth()->id(),
        );
    }

    /**
     * คัดลอกมาจาก BaseUnitController::resolveAutoTranslateSource()
     *
     * @param  array<int|string, mixed>  $translations
     * @return array{0: int|null, 1: string}
     */
    private function resolveAutoTranslateSource(array $translations): array
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));
        $defaultLabel = trim((string) ($translations[$defaultLocaleId] ?? ''));

        if ($defaultLocaleId !== null && $defaultLabel !== '') {
            return [$defaultLocaleId, $defaultLabel];
        }

        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';
            if ($label !== '') {
                return [(int) $localeId, $label];
            }
        }

        return [null, ''];
    }

    /**
     * คัดลอกมาจาก BaseUnitController::syncTranslations()
     */
    private function syncTranslations(Brand $brand, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                BrandTranslation::where('brand_id', $brand->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            BrandTranslation::updateOrCreate(
                ['brand_id' => $brand->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
