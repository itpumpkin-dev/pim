<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Jobs\AutoTranslateLabelsJob;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\CategoryField;
use App\Models\CategoryTranslation;
use App\Models\LazadaCategory;
use App\Models\LazadaSellerAccount;
use App\Models\Locale;
use App\Models\ShopeeBrand;
use App\Models\ShopeeCategory;
use App\Models\ShopeeSellerAccount;
use App\Models\TikTokCategory;
use App\Models\TikTokSellerAccount;
use App\Models\WooCommerceCategory;
use App\Services\Catalog\AttributeValueFormatter;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use App\Services\ImportExport\SpreadsheetWriter;
use App\Services\Lazada\LazadaClient;
use App\Services\Shopee\ShopeeClient;
use App\Services\TikTok\TikTokClient;
use App\Services\WooCommerce\WooCommerceClient;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class CategoryController extends Controller
{
    use HasVersionHistory;

    /**
     * ค่า "Display type" ของ WooCommerce เองสำหรับหมวดหมู่สินค้า — ดูที่หน้า
     * create/edit ของ categories ซึ่งเลียนแบบฟอร์ม "Add new category" ของ
     * WooCommerce เก็บไว้ตามค่าจริงเป๊ะๆ (ไม่แปล/ไม่เปลี่ยนชื่อ) เพื่อให้ยังใช้ต่อได้
     * ตรงๆ ถ้าวันหลังมีฟีเจอร์ push หมวดหมู่กลับไป
     */
    private const DISPLAY_TYPES = ['default', 'products', 'subcategories', 'both'];

    /**
     * ตัว platform ที่รองรับสำหรับ marketplaceCategoryChildren()/
     * marketplaceCategoryPath() ด้านล่าง — ต้นไม้ของแต่ละ marketplace เอง
     * (ไม่ใช่ PIM category tree ของ tree() ด้านบน) ที่ผูกกับหน้า "Marketplace
     * Categories" ของ Edit Product ตัวไม้พวกนี้ใหญ่เกินกว่าจะส่งทั้งต้นแบบ
     * nested JSON เหมือน tree() ได้ (shopee_categories/lazada_categories/
     * tiktok_categories/woocommerce_categories มีหลักพันแถวต่อตัว เทียบกับ
     * ~1,100 ของ PIM category เอง) เลยต้องโหลดทีละ level ตาม parent_id แทน
     */
    private const MARKETPLACE_CATEGORY_MODELS = [
        'shopee' => ShopeeCategory::class,
        'lazada' => LazadaCategory::class,
        'tiktok' => TikTokCategory::class,
        'woocommerce' => WooCommerceCategory::class,
    ];

    /**
     * แสดงลิสต์หมวดหมู่ทั้งหมด
     */
    public function index(Request $request): Response
    {
        $search = $request->input('search');

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $filterColumns = [
            'code' => ['label' => 'Code', 'type' => 'string', 'filterable' => true],
            'name' => ['label' => 'Name', 'type' => 'string', 'filterable' => true],
            'description' => ['label' => 'Description', 'type' => 'string', 'filterable' => true],
            'is_active' => ['label' => 'Active', 'type' => 'boolean', 'filterable' => true],
        ];

        // `name` เป็นคอลัมน์ fallback ที่ไม่ขึ้นกับภาษา (ดู accessor
        // Category::name()) — สิ่งที่หน้าลิสต์โชว์จริงๆ คือ label ที่แปลแล้วของแต่ละ
        // หมวดหมู่ ซึ่งอยู่คนละตารางแยกต่างหาก (translations) ถ้าค้นหาด้วยชื่อจาก
        // คอลัมน์ดิบอย่างเดียว จะพลาดแทบทุกการค้นหาที่ตรงกับชื่อที่ผู้ใช้เห็นจริงๆ
        // เพราะฉะนั้นทั้งช่องค้นหาแบบพิมพ์อิสระและตัวกรองคอลัมน์ `name` จะเช็คกับ
        // ตาราง translations ด้วย ส่วน `name` จะถูกตัดออกจากรอบกรองแบบทั่วไปตาม
        // คอลัมน์ด้านล่าง เพื่อไม่ให้ไปกรองซ้ำ (แบบผิดๆ) ด้วยคอลัมน์ดิบอีกที
        // แคสต์เป็น array ไม่ใช่แค่ตั้งดีฟอลต์เป็น `[]` เฉยๆ — ดูคอมเมนต์ของ
        // GridManager::getData(): ถ้า query param `?filters=` ว่างเปล่าจะมาถึงตรงนี้
        // เป็น null จริงๆ (จาก middleware ConvertEmptyStringsToNull ของ Laravel)
        // ซึ่งถ้าไม่แคสต์ก่อน การเรียก array_key_exists() ด้านล่างจะ fatal ทันที
        $originalFilters = (array) $request->input('filters', []);
        $nameFilter = $originalFilters['name'] ?? null;

        // ตั้งค่าดีฟอลต์ให้ลิสต์โชว์แค่หมวดหมู่ที่ active เท่านั้น — ไม่งั้นหมวดหมู่เก่า
        // ราวๆ 1,086 รายการที่ถูกปิดใช้งานตอนไปเทียบกับลิสต์หมวดหมู่จริงของ
        // WooCommerce (ดู migration ของ is_active) จะเต็มหน้าไปหมด จะตั้งดีฟอลต์
        // นี้ก็ต่อเมื่อ request ไม่ได้ส่งตัวกรอง `is_active` มาเลย (โหลดครั้งแรก /
        // เคลียร์ตัวกรอง) ถ้าผู้ใช้เลือกเองผ่าน filter drawer อย่างชัดเจน (รวมถึงเลือก
        // "No" เพื่อดูตัวที่ไม่ active) จะชนะดีฟอลต์นี้เสมอ ใส่ค่าลงใน
        // $originalFilters เลย (ไม่ใช่แค่ใน $filtersWithoutName ที่ใช้แค่ query ด้านล่าง)
        // เพื่อให้ UI ของ filter drawer เองสะท้อนดีฟอลต์นี้เป็น chip "Active: Yes"
        // ที่ active อยู่ ไม่ใช่กรองไปเงียบๆ โดยไม่มีอะไรโชว์ว่าถูกเลือกอยู่
        if (! array_key_exists('is_active', $originalFilters)) {
            $originalFilters['is_active'] = '1';
        }
        $filtersWithoutName = collect($originalFilters)->except('name')->all();

        // ดึงหมวดหมู่มาพร้อม parent เพื่อโชว์ในลิสต์ ดึงจำนวนนับมาด้วยเพื่อให้ตอน
        // ยืนยันลบสามารถเตือนได้ว่าลบไปแล้วจะกระทบอะไรบ้างจริงๆ (children จะกลายเป็น
        // ลูกกำพร้า, ลิงก์กับสินค้าจะ cascade ตามไปด้วย) และเพื่อให้เอา
        // `products_count` ไปเรียงลำดับได้ด้านล่าง (เป็นคอลัมน์ alias จาก
        // withCount() — Postgres อนุญาตให้ ORDER BY อ้างถึง alias ของ SELECT ได้
        // ต่างจาก HAVING ที่ทำไม่ได้)
        // The list shows top-level categories only. Drilling into a root
        // (?parent=<id>) shows that root's direct children (subcategories).
        // A free-text search spans every level so deeper nodes stay findable.
        $parentId = $request->integer('parent') ?: null;
        $parentCategory = $parentId ? Category::find($parentId, ['id', 'name', 'parent_id']) : null;

        $query = Category::with('parent')
            ->withCount(['children', 'products'])
            ->when($parentId, fn ($q) => $q->where('parent_id', $parentId))
            ->when(!$parentId && !$search, fn ($q) => $q->whereNull('parent_id'))
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('code', 'like', "%{$search}%")
                        ->orWhere('name', 'like', "%{$search}%")
                        ->orWhere('description', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            })
            ->when($nameFilter, function ($query, $nameFilter) {
                $query->where(function ($q) use ($nameFilter) {
                    $q->where('name', 'like', "%{$nameFilter}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$nameFilter}%"));
                });
            });

        GridManager::applyFilters($query, $filterColumns, $filtersWithoutName);

        // เรียงลำดับแบบคลิกที่หัวคอลัมน์ ตามรูปแบบเดียวกับที่ getData() ของ
        // GridManager เองใช้กับ grid ที่ตั้งค่าด้วย YAML (Products, ...) — ใช้แบบ
        // whitelist แทนที่จะส่ง $request->input('sort') เข้า orderBy() ตรงๆ
        // เพราะแบบนั้นจะเปิดช่องให้ใส่คอลัมน์/expression อะไรก็ได้เข้ามา `name` จะ
        // เรียงตามคอลัมน์ fallback แบบดิบ (ดูคอมเมนต์ `$nameFilter` ด้านบน)
        // ไม่ใช่ label ที่แปลแล้ว เป็นข้อจำกัดเดียวกับที่ช่องค้นหาแบบพิมพ์อิสระของ
        // คอลัมน์นี้ยอมรับอยู่แล้ว จนกว่าจะมีการเรียงตาม locale จริงๆ
        $sortableColumns = ['code', 'name', 'description', 'slug', 'products_count'];
        $sortField = $request->input('sort');
        $sortDir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        if ($sortField && in_array($sortField, $sortableColumns, true)) {
            $query->orderBy($sortField, $sortDir);
        } else {
            $query->orderBy('code', 'asc');
        }

        $categories = $query->paginate($perPage)->withQueryString();

        // แปลง path ดิบใน storage เป็น public URL ใช้การ resolve แบบเดียวกับที่
        // preview thumbnail ของหน้า edit หมวดหมู่ใช้ (CategoryController::edit())
        $categories->getCollection()->transform(function (Category $category) {
            $category->thumbnail_url = AttributeValueFormatter::resolveStorageUrl($category->thumbnail);

            return $category;
        });

        return Inertia::render('catalog/categories/index', [
            'categories' => $categories,
            'parentCategory' => $parentCategory,
            'filters' => [
                'search' => $request->input('search', ''),
                'filters' => $originalFilters,
                'sort' => $sortField && in_array($sortField, $sortableColumns, true) ? $sortField : 'code',
                'dir' => $sortField && in_array($sortField, $sortableColumns, true) ? $sortDir : 'asc',
            ],
            'filterColumns' => $filterColumns,
        ]);
    }

    /**
     * ดาวน์โหลดต้นไม้หมวดหมู่ของแอปนี้เองเป็น CSV — รูปแบบ/จุดประสงค์เดียวกับ
     * exportWoocommerceCategories() ด้านล่าง แต่ใช้ตาราง `categories` ของเราเอง
     * แทนที่จะเป็นแคช woocommerce_categories ที่ sync มา จะ export ต้นไม้ทั้งหมด
     * เสมอ ไม่สนใจสถานะ search/filter/sort ปัจจุบันของหน้าลิสต์ (ใช้ขอบเขต
     * "export ทุกอย่าง" แบบเดียวกับ exportWoocommerceCategories()) เพราะไฟล์นี้
     * ตั้งใจให้เป็นไฟล์อ้างอิง/สำรองข้อมูลแบบเต็ม ไม่ใช่ export ตามมุมมองที่กรองไว้
     */
    public function exportCategories(): BinaryFileResponse
    {
        $categories = Category::with('parent')->withCount(['children', 'products'])->orderBy('name')->get();

        $rows = $categories->map(fn (Category $category) => [
            'Code' => $category->code,
            'Name' => $category->name,
            'Slug' => $category->slug ?? '',
            'Parent' => $category->parent?->name ?? '',
            'Description' => $category->description ?? '',
            // รองรับได้ทั้ง thumbnail ที่อัปโหลดในเครื่อง (เป็น path ใน storage)
            // และตัวที่นำเข้ามาผ่าน importFromWoocommerce() (เป็น absolute URL
            // ของ pumpkin.co.th อยู่แล้ว) — ใช้การ resolve แบบเดียวกับ preview
            // thumbnail ของหน้าลิสต์/edit
            'Thumbnail' => AttributeValueFormatter::resolveStorageUrl($category->thumbnail) ?? '',
            'Display Type' => $category->display_type,
            'Products Count' => $category->products_count,
            'Is Leaf' => $category->children_count === 0 ? 'Yes' : 'No',
        ])->all();

        $tempPath = sys_get_temp_dir().'/pim_categories_'.Str::uuid().'.csv';
        SpreadsheetWriter::write($tempPath, 'csv', ['Code', 'Name', 'Slug', 'Parent', 'Description', 'Thumbnail', 'Display Type', 'Products Count', 'Is Leaf'], $rows, ',');

        $downloadName = 'pim-categories-'.now()->format('Ymd_His').'.csv';

        return response()->download($tempPath, $downloadName)->deleteFileAfterSend(true);
    }

    /**
     * แสดงฟอร์มสำหรับสร้างหมวดหมู่ใหม่
     */
    public function create(Request $request): Response
    {
        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        return Inertia::render('catalog/categories/create', [
            'categoryFields' => $categoryFields,
            'rootCategories' => Category::whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'defaultParentId' => $request->integer('parent') ?: null,
        ]);
    }

    /**
     * บันทึกหมวดหมู่ที่สร้างใหม่ลง storage
     */
    public function store(Request $request): RedirectResponse
    {
        $categoryFields = CategoryField::where('status', true)->get();

        $rules = [
            'code' => ['nullable', 'string', 'max:100', Rule::unique('categories', 'code')],
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'is_ai_translate' => ['boolean'],
            'description' => ['nullable', 'string'],
            // The Categories page only manages roots + subcategories — a
            // category's parent must be a root. The leaf level (product
            // groups) is created on its own page (ProductGroupController).
            'parent_id' => ['nullable', Rule::exists('categories', 'id')->whereNull('parent_id')],
            'additional_data' => ['nullable', 'array'],
            'slug' => ['nullable', 'string', 'max:255'],
            'display_type' => ['nullable', Rule::in(self::DISPLAY_TYPES)],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'is_active' => ['boolean'],
        ];

        foreach ($categoryFields as $field) {
            $fieldKey = "additional_data.{$field->code}";
            $fieldRules = [];
            $fieldRules[] = $field->is_required ? 'required' : 'nullable';

            if ($field->type === 'Text') {
                $fieldRules[] = 'string';
                $fieldRules[] = 'max:255';
            } elseif ($field->type === 'Textarea') {
                $fieldRules[] = 'string';
            } elseif ($field->type === 'Select') {
                $fieldRules[] = 'string';
            } elseif ($field->type === 'Image') {
                $fieldRules[] = 'image';
                $fieldRules[] = 'max:4096';
            } elseif ($field->type === 'File') {
                $fieldRules[] = 'file';
                $fieldRules[] = 'max:10240';
            }

            $rules[$fieldKey] = $fieldRules;
        }

        $validated = $request->validate($rules);
        $validated['additional_data'] = $this->storeUploadedFields($request, $categoryFields, $validated['additional_data'] ?? []);
        $thumbnailPath = $request->hasFile('thumbnail') ? $request->file('thumbnail')->store('category-thumbnails', 'public') : null;

        $translations = $validated['translations'] ?? [];

        $typedCode = trim((string) ($validated['code'] ?? ''));

        // Shared attributes for both the hand-typed-code and the
        // auto-generated-code paths below.
        $attributes = fn (string $code) => [
            'code' => $code,
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $code),
            'slug' => $validated['slug'] ?? null,
            'display_type' => $validated['display_type'] ?? 'default',
            'thumbnail' => $thumbnailPath,
            'is_active' => $request->boolean('is_active', true),
            'description' => $validated['description'],
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'parent_id' => $validated['parent_id'],
            'additional_data' => $validated['additional_data'],
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ];

        // A hand-typed code is the ERP category code (e.g. a025001) that
        // ProductCategoryLinker matches products against; use it verbatim.
        // Otherwise fall back to an auto-generated category_N code.
        $category = $typedCode !== ''
            ? Category::create($attributes($typedCode))
            : CodeGenerator::createWithRetry('categories', 'category', fn ($code) => Category::create($attributes($code)));

        $this->syncTranslations($category, $translations);
        $this->autoTranslate($category, $translations);

        $newTranslations = $this->currentTranslations($category);
        if (! empty($newTranslations)) {
            AuditLog::record('labels_set', $category, null, $newTranslations);
        }

        Category::bumpTreeCacheVersion();

        return to_route('catalog.categories.index')->with('success', 'Category created successfully.');
    }

    /**
     * ฟิลด์หมวดหมู่ประเภท Image/File จะมาถึงเป็น instance ของ UploadedFile ดิบๆ
     * อยู่ใน `additional_data` (คอลัมน์ JSON ที่ cast เป็น array ธรรมดา) — ถ้าเก็บ
     * แบบนั้นตรงๆ จะ serialize ออกมาเป็น `{}` เพราะ UploadedFile ไม่มี public
     * property เลย เลยต้องแทนที่แต่ละอันด้วย path ที่เก็บไว้จริง ถ้าฟิลด์ไหนไม่มี
     * ไฟล์ใหม่อัปโหลดมา ก็ fallback ไปใช้ path เดิมที่เคยเก็บไว้ใน `$existing`
     * (กรณี update) หรือตัดฟิลด์นั้นทิ้งไปเลย (กรณี create — ไม่มีอะไรให้ fallback)
     */
    private function storeUploadedFields(Request $request, Collection $categoryFields, array $additionalData, ?Category $existing = null): array
    {
        foreach ($categoryFields as $field) {
            if (! in_array($field->type, ['Image', 'File'], true)) {
                continue;
            }

            $fieldKey = "additional_data.{$field->code}";

            if ($request->hasFile($fieldKey)) {
                $additionalData[$field->code] = $request->file($fieldKey)->store('category-fields', 'public');
            } elseif ($existing) {
                $additionalData[$field->code] = $existing->additional_data[$field->code] ?? null;
            } else {
                unset($additionalData[$field->code]);
            }
        }

        return $additionalData;
    }

    /**
     * แสดงฟอร์มสำหรับแก้ไขหมวดหมู่ที่ระบุ
     */
    public function edit(Category $category): Response|RedirectResponse
    {
        // Level-3 categories are product groups — they have their own editor
        // with Category + Subcategory pickers. Bounce there so this page only
        // ever deals with roots and subcategories.
        $parent = $category->parent_id ? Category::find($category->parent_id) : null;
        if ($parent && $parent->parent_id !== null) {
            return to_route('catalog.productGroups.edit', $category->id);
        }

        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        // หมวดหมู่ที่ไม่มีแถว CategoryTranslation เลยสักแถว (เช่นทุกตัวที่สร้างผ่าน
        // importFromWoocommerce()/CategoryRowImporter ซึ่งเขียนแค่คอลัมน์ `name`
        // ดิบๆ เท่านั้น) ถ้าไม่ทำอะไรเพิ่มจะโชว์ช่อง Name ว่างเปล่าสำหรับ locale
        // ปัจจุบันของแอดมิน ทั้งที่ accessor ของ Category::name() เองก็ fallback
        // ไปใช้คอลัมน์ดิบตัวเดียวกันนี้อยู่แล้วเวลาโชว์ที่อื่นๆ ทุกจุด เลยเลียนแบบ
        // fallback แบบเดียวกันนี้ตรงนี้ด้วย แต่ใช้แค่กับค่าเริ่มต้นของฟอร์มในหน้านี้
        // เท่านั้น — ไม่เอาไปใช้กับผู้เรียก currentTranslations() ตัวอื่น (เช่น diff
        // audit ก่อน/หลังของ store()/update()) เพราะถ้าใส่ค่าสมมติเข้าไปตรงนั้นจะ
        // ทำให้ดูเหมือนมีการเปลี่ยนคำแปลจริงๆ ทั้งที่ไม่ได้เปลี่ยน
        $translations = $this->currentTranslations($category);
        $activeLocaleId = Locale::idForCode(app()->getLocale());
        if ($activeLocaleId && trim((string) ($translations[$activeLocaleId] ?? '')) === '') {
            $rawName = trim((string) $category->getRawOriginal('name'));
            if ($rawName !== '') {
                $translations[$activeLocaleId] = $rawName;
            }
        }

        return Inertia::render('catalog/categories/edit', [
            'category' => $category,
            'thumbnailUrl' => AttributeValueFormatter::resolveStorageUrl($category->thumbnail),
            'translations' => $translations,
            'categoryFields' => $categoryFields,
            'rootCategories' => Category::whereNull('parent_id')->where('id', '!=', $category->id)->orderBy('name')->get(['id', 'name']),
            // Direct children shown as a quick-jump list on the edit page.
            'subcategories' => $category->children()->orderBy('code')->get(['id', 'code', 'name', 'is_active']),
            'canViewHistory' => auth()->user()?->hasPermission('categories', 'view_history') ?? false,
        ]);
    }

    public function history(Category $category): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($category)]);
    }

    /**
     * ต้นไม้หมวดหมู่ทั้งหมดแบบ nested — ใช้โดยตัวเลือกแบบ tree เลือกได้หลายอันของ
     * หน้าแก้ไขสินค้า และตัวเลือก parent ของหน้า create/edit หมวดหมู่ `exclude`
     * (ไม่บังคับ) จะตัดหมวดหมู่นั้นและ subtree ทั้งหมดของมันออก เพื่อไม่ให้หมวดหมู่ที่
     * กำลังแก้ไขอยู่ถูกเลือกเป็น parent ของตัวมันเองได้
     *
     * การสร้างต้นไม้นี้ใหม่ทั้งหมด (eager load แบบ recursive + resolve `name`
     * ทีละ node ทั่วทั้ง ~1,100 หมวดหมู่) วัดได้ประมาณ 365ms และ payload 164KB
     * แถม tree picker ก็ดึงข้อมูลนี้ใหม่ทุกครั้งที่เปิดหน้า Edit Product เลย — เพราะ
     * งั้นต้นไม้แบบ *ไม่กรอง* จะถูกแคชไว้แยกตาม locale โดยใช้ version เป็น key
     * (version จะถูกเพิ่มใน store()/update()/destroy() — ดู
     * Category::bumpTreeCacheVersion()) ทุกครั้งที่รูปร่างของต้นไม้หรือ label อาจ
     * เปลี่ยนไป ส่วน `exclude` จะเอาไปใช้กับ array ที่แคชไว้ทีหลัง ไม่ได้เป็นส่วนหนึ่ง
     * ของ cache key เพราะถ้าฝังเข้าไปด้วยจะทำให้แคชแตกเป็นชิ้นๆ ตามหมวดหมู่ที่เคย
     * ถูกแก้ไขทุกตัว
     */
    public function tree(Request $request): JsonResponse
    {
        $excludeId = $request->integer('exclude') ?: null;
        $cacheKey = 'category-tree:'.Category::treeCacheVersion().':'.app()->getLocale();

        $tree = Cache::remember($cacheKey, now()->addHours(6), function () {
            $roots = Category::whereNull('parent_id')->with('recursiveChildren')->orderBy('name')->get();

            $map = function (Category $category) use (&$map) {
                return [
                    'id' => $category->id,
                    'code' => $category->code,
                    'name' => $category->name,
                    // คำนวณแบบเดียวกับคอลัมน์ mapped_platforms ของ
                    // CategoryController::index() — ทำให้ CategoryCascadeSelect
                    // ของหน้าแก้ไขสินค้าโชว์ได้ว่าแต่ละระดับที่เลือกไว้แมปกับ
                    // marketplace ไหนอยู่แล้วบ้าง (ดู docblock ของ component นั้นเอง)
                    'mapped_platforms' => collect([
                        'lazada' => $category->lazada_category_id,
                        'shopee' => $category->shopee_category_id,
                        'tiktok' => $category->tiktok_category_id,
                        'woocommerce' => $category->woocommerce_category_id,
                    ])->filter()->keys()->values()->all(),
                    'children' => $category->recursiveChildren->map($map)->filter()->values(),
                ];
            };

            return $roots->map($map)->filter()->values();
        });

        if ($excludeId) {
            $tree = $this->excludeFromTree($tree, $excludeId);
        }

        return response()->json($tree);
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $nodes
     * @return Collection<int, array<string, mixed>>
     */
    private function excludeFromTree(Collection $nodes, int $excludeId): Collection
    {
        return $nodes
            ->reject(fn (array $node) => $node['id'] === $excludeId)
            ->map(function (array $node) use ($excludeId) {
                $node['children'] = $this->excludeFromTree($node['children'], $excludeId);

                return $node;
            })
            ->values();
    }

    /**
     * โหลด node ลูกของ marketplace category tree ทีละ level (parent_id=null
     * คือ root) — คู่หูของ tree() ด้านบนแต่โหลดแบบ lazy แทนที่จะส่งทั้งต้นไม้
     * เดียว ใช้โดยตัวเลือกหมวดหมู่แบบ multi-column ของแต่ละ marketplace ใน
     * Edit Product (resources/js/components/marketplace-category-picker.tsx)
     */
    public function marketplaceCategoryChildren(Request $request, string $platform): JsonResponse
    {
        abort_unless(array_key_exists($platform, self::MARKETPLACE_CATEGORY_MODELS), 404);

        $parentId = $request->integer('parent_id') ?: null;
        $model = self::MARKETPLACE_CATEGORY_MODELS[$platform];

        $nodes = $model::where('parent_id', $parentId)
            ->orderBy('name')
            ->get(['id', 'parent_id', 'name', 'is_leaf'])
            ->map(fn ($node) => [
                'id' => $node->id,
                'name' => $node->name,
                'is_leaf' => (bool) $node->is_leaf,
            ]);

        return response()->json($nodes);
    }

    /**
     * ค้นหาชื่อ leaf category ของ marketplace หนึ่งตัว (เฉพาะ is_leaf=true —
     * มีแต่ leaf เท่านั้นที่เลือกเป็น category จริงของสินค้าได้) พร้อมชื่อ parent
     * ชั้นเดียว (ไม่ใช่ path เต็ม — ต้นไม้พวกนี้ใหญ่เกินกว่าจะ resolve path เต็ม
     * ให้ผลค้นหาทุกแถวโดยไม่กระทบ performance) ให้พอเห็น context คร่าวๆ
     */
    public function marketplaceCategorySearch(Request $request, string $platform): JsonResponse
    {
        abort_unless(array_key_exists($platform, self::MARKETPLACE_CATEGORY_MODELS), 404);

        $query = trim((string) $request->query('q', ''));
        if ($query === '') {
            return response()->json([]);
        }

        $model = self::MARKETPLACE_CATEGORY_MODELS[$platform];

        $results = $model::where('is_leaf', true)
            ->where('name', 'like', "%{$query}%")
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'parent_id']);

        $parentNames = $model::whereIn('id', $results->pluck('parent_id')->filter()->unique())->pluck('name', 'id');

        return response()->json($results->map(fn ($node) => [
            'id' => $node->id,
            'name' => $node->name,
            'parent_name' => $node->parent_id ? ($parentNames[$node->parent_id] ?? null) : null,
        ]));
    }

    /**
     * root-to-node path ของ marketplace category id หนึ่งตัว (เดินขึ้นตาม
     * parent_id) — ใช้แสดง breadcrumb ของค่าที่เลือกไว้แล้ว (ทั้งตอนโชว์เฉยๆ
     * และตอนเปิด picker เพื่อ preload คอลัมน์ให้ตรงกับที่เคยเลือกไว้)
     */
    public function marketplaceCategoryPath(Request $request, string $platform): JsonResponse
    {
        abort_unless(array_key_exists($platform, self::MARKETPLACE_CATEGORY_MODELS), 404);

        $id = $request->integer('id');
        $model = self::MARKETPLACE_CATEGORY_MODELS[$platform];

        $path = [];
        $node = $id ? $model::find($id, ['id', 'parent_id', 'name']) : null;
        while ($node) {
            array_unshift($path, ['id' => $node->id, 'name' => $node->name]);
            $node = $node->parent_id ? $model::find($node->parent_id, ['id', 'parent_id', 'name']) : null;
        }

        return response()->json($path);
    }

    /**
     * อัปเดตหมวดหมู่ที่ระบุลง storage
     */
    public function update(Request $request, Category $category): RedirectResponse
    {
        $categoryFields = CategoryField::where('status', true)->get();

        $rules = [
            // `code` is set once at creation and never editable afterwards —
            // it is the key ProductCategoryLinker matches products on. Any
            // `code` sent by an edit form is ignored.
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'is_ai_translate' => ['boolean'],
            'description' => ['nullable', 'string'],
            // A category's parent must be a root (Categories page manages the
            // top two levels only) — unless this row is itself a product group
            // being edited elsewhere, in which case parent_id isn't posted.
            'parent_id' => ['nullable', Rule::exists('categories', 'id')->whereNull('parent_id')],
            'additional_data' => ['nullable', 'array'],
            'slug' => ['nullable', 'string', 'max:255'],
            'display_type' => ['nullable', Rule::in(self::DISPLAY_TYPES)],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'is_active' => ['boolean'],
        ];

        foreach ($categoryFields as $field) {
            $fieldKey = "additional_data.{$field->code}";
            $fieldRules = [];

            // ช่องอัปโหลดไฟล์จะเติมค่าไว้ล่วงหน้าไม่ได้เลยด้วยเหตุผลด้านความเป็นส่วนตัว/
            // ความปลอดภัย เลยโชว์เป็นค่าว่างเสมอในฟอร์ม edit — ถ้าบังคับ `required`
            // แบบไม่มีเงื่อนไขจะทำให้ต้องอัปโหลดใหม่ทุกครั้งที่ save เลยบังคับก็ต่อเมื่อ
            // ยังไม่มีไฟล์เก็บไว้จริงๆ เท่านั้น
            $hasExistingFile = in_array($field->type, ['Image', 'File'], true)
                && ! empty($category->additional_data[$field->code] ?? null);

            $fieldRules[] = ($field->is_required && ! $hasExistingFile) ? 'required' : 'nullable';

            if ($field->type === 'Text') {
                $fieldRules[] = 'string';
                $fieldRules[] = 'max:255';
            } elseif ($field->type === 'Textarea') {
                $fieldRules[] = 'string';
            } elseif ($field->type === 'Select') {
                $fieldRules[] = 'string';
            } elseif ($field->type === 'Image') {
                $fieldRules[] = 'image';
                $fieldRules[] = 'max:4096';
            } elseif ($field->type === 'File') {
                $fieldRules[] = 'file';
                $fieldRules[] = 'max:10240';
            }

            $rules[$fieldKey] = $fieldRules;
        }

        $validated = $request->validate($rules);
        $validated['additional_data'] = $this->storeUploadedFields($request, $categoryFields, $validated['additional_data'] ?? [], $category);

        // กันไว้อย่างชัดเจนไม่ให้เลือกตัวเอง หรือลูกหลานของตัวเอง เป็น parent —
        // ไม่ว่าแบบไหนก็จะสร้าง cycle ขึ้นมา และ Category::recursiveChildren()
        // ไม่มีการป้องกัน cycle เลย เพราะฉะนั้นถ้ามีแถวที่อ้างอิงตัวเองแบบนี้จะทำให้
        // การโหลดต้นไม้ทุกครั้งต่อจากนี้ค้างไปเลย
        if ($validated['parent_id']) {
            if ((int) $validated['parent_id'] === $category->id) {
                return back()->withErrors(['parent_id' => 'A category cannot be its own parent.']);
            }

            // โหลดครั้งเดียวผ่าน relation `recursiveChildren` แบบ eager แทนที่จะ
            // ไล่ `children` ทีละ node ซึ่งจะยิง query 1 ครั้งต่อ 1 ลูกหลาน ทุกครั้งที่
            // save สำหรับหมวดหมู่ที่มี subtree ขนาดใหญ่
            $category->loadMissing('recursiveChildren');

            $descendantIds = [];
            $collectDescendants = function (Category $cat) use (&$collectDescendants, &$descendantIds) {
                foreach ($cat->recursiveChildren as $child) {
                    $descendantIds[] = $child->id;
                    $collectDescendants($child);
                }
            };
            $collectDescendants($category);

            if (in_array((int) $validated['parent_id'], $descendantIds, true)) {
                return back()->withErrors(['parent_id' => 'Cannot select a subcategory as parent.']);
            }
        }

        $translations = $validated['translations'] ?? [];
        $oldTranslations = $this->currentTranslations($category);

        // ใช้กติกาเดียวกับฟิลด์หมวดหมู่ Image/File ด้านบน (storeUploadedFields())
        // คือ "เก็บของเดิมไว้ ถ้าไม่มีไฟล์ใหม่อัปโหลดมา" — ช่องนี้โชว์เป็นค่าว่างเสมอใน
        // ฟอร์ม edit เพราะฉะนั้นการ save โดยไม่ได้เลือก thumbnail ใหม่ ไม่ควรลบ
        // ตัวที่เก็บไว้อยู่แล้วทิ้งไป
        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->store('category-thumbnails', 'public')
            : $category->thumbnail;

        $category->update([
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $category->code),
            'slug' => $validated['slug'] ?? null,
            'display_type' => $validated['display_type'] ?? 'default',
            'thumbnail' => $thumbnailPath,
            'is_active' => $request->boolean('is_active', true),
            'description' => $validated['description'],
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'parent_id' => $validated['parent_id'],
            'additional_data' => $validated['additional_data'] ?? [],
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($category, $translations);
        $this->autoTranslate($category, $translations);

        $newTranslations = $this->currentTranslations($category);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $category, $oldTranslations, $newTranslations);
        }

        Category::bumpTreeCacheVersion();

        return to_route('catalog.categories.index')->with('success', 'Category updated successfully.');
    }

    /**
     * แผนที่ locale_id => label แบบสดๆ (ไม่ผ่านแคช) สำหรับคำแปลปัจจุบันของ
     * หมวดหมู่นั้น — ใช้ snapshot สถานะก่อน/หลัง สำหรับ diff ของ audit
     */
    private function currentTranslations(Category $category): array
    {
        return $category->translations()->get()
            ->mapWithKeys(fn (CategoryTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();
    }

    private function resolveName(array $translations, ?string $name, ?string $code = null): string
    {
        $defaultLocaleId = Locale::where('code', config('app.locale'))->value('id');

        if ($defaultLocaleId !== null && ! empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');
        if ($firstNonEmpty !== null) {
            return trim($firstNonEmpty);
        }

        return $name ?? ($code !== null ? ucfirst($code) : 'Category');
    }

    /**
     * ถ้าเปิด "AI translate" ไว้ จะเข้าคิว job เพื่อเติมคำแปลล่วงหน้าให้ทุก locale
     * ที่ active ที่ยังไม่มีคำแปล — ใช้แพทเทิร์นเดียวกับ
     * AttributeController::autoTranslate()
     */
    private function autoTranslate(Category $category, array $translations): void
    {
        if (! $category->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        AutoTranslateLabelsJob::dispatch(
            CategoryTranslation::class,
            'category_id',
            $category->id,
            $sourceLocaleId,
            $sourceLabel,
        );
    }

    /**
     * เลือกว่าจะแปล "จาก" locale ไหน จะเลือก locale เริ่มต้นของแอปก่อนถ้ามีการ
     * กรอกไว้ แต่ถ้าไม่มีก็ fallback ไปใช้ locale ไหนก็ได้ที่มี label จริงๆ แทน — ดู
     * AttributeController::resolveAutoTranslateSource() ว่าทำไมการบังคับใช้แค่
     * locale เริ่มต้นเท่านั้นจะทำให้ auto-translation ถูกข้ามไปเงียบๆ สำหรับ
     * หมวดหมู่ที่ตั้งชื่อไว้แค่ภาษาอื่นเท่านั้น
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

    private function syncTranslations(Category $category, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                CategoryTranslation::where('category_id', $category->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            CategoryTranslation::updateOrCreate(
                ['category_id' => $category->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }

    /**
     * ลบหมวดหมู่ที่ระบุออกจาก storage
     */
    public function destroy(Category $category): RedirectResponse
    {
        // การลบหมวดหมู่จะทำให้ parent_id ของลูกๆ กลายเป็น null โดยอัตโนมัติ เพราะ constraint ของ DB
        $category->delete();

        Category::bumpTreeCacheVersion();

        return to_route('catalog.categories.index')->with('success', 'Category deleted successfully.');
    }

    /**
     * แท็บ sync/mapping หมวดหมู่กับ marketplace — ตั้งใจแยกไว้นอกหน้าลิสต์หมวดหมู่
     * เพราะเป็น action แบบ bulk สำหรับแอดมิน ไม่ใช่สิ่งที่ต้องแตะระหว่างเรียกดู
     * หมวดหมู่ตามปกติ
     */
    public function marketplaceSync(): Response
    {
        // ::max() เป็น aggregate query แบบดิบๆ เลยคืนค่าเป็น string ธรรมดาของ
        // DB driver แทนที่จะเป็น Carbon instance ที่ Eloquent cast ให้ — ไม่มี
        // timezone แนบมาด้วย เลยต้อง parse โดยระบุ timezone ของแอป (UTC) ให้
        // ชัดเจนก่อน serialize ไม่งั้นตัว parser วันที่ของ frontend จะอ่าน string
        // เปล่าๆ นี้ผิดเป็นเวลาท้องถิ่นไป
        $toIso = fn (?string $value) => $value ? Carbon::parse($value, 'UTC')->toISOString() : null;

        // เมื่อก่อนข้อมูลแบรนด์ (lastSyncedAt/activeSyncJobs) เคยอยู่ตรงนี้ด้วย —
        // ดู docblock ของ categories/marketplace-sync.tsx ว่าทำไมย้ายออกไปอีกครั้ง:
        // ตอนนี้การแมป/sync แบรนด์ย้ายไปอยู่ที่หน้า categories/{platform}-mapping.tsx
        // ของแต่ละแพลตฟอร์มเองทั้งหมดแล้ว (ครบทั้ง 4 แพลตฟอร์ม ไม่ใช่แค่
        // Shopee/Lazada) หน้าฮับนี้เลยเหลือแค่ข้อมูลหมวดหมู่อย่างเดียวพอ
        return Inertia::render('catalog/categories/marketplace-sync', [
            'lastSyncedAt' => [
                'lazada' => $toIso(LazadaCategory::max('updated_at')),
                'shopee' => $toIso(ShopeeCategory::max('updated_at')),
                'tiktok' => $toIso(TikTokCategory::max('updated_at')),
                'woocommerce' => $toIso(WooCommerceCategory::max('updated_at')),
            ],
        ]);
    }

    /**
     * รีเฟรชแคช lazada_categories ในระบบ จากต้นไม้หมวดหมู่จริงของ Lazada เพื่อไม่ให้
     * ตัวเลือก mapping ต้องเรียก API ของเขาทุกครั้งที่โหลดหน้า account ผู้ขายที่
     * active ตัวไหนก็ authenticate ตรงนี้ได้ — ต้นไม้เองไม่ได้ผูกกับร้านใดร้านหนึ่ง
     */
    public function syncLazadaCategories(Request $request): RedirectResponse
    {
        $account = LazadaSellerAccount::active()->first();
        if (! $account) {
            return back()->with('error', 'No active Lazada seller account found to authenticate the sync.');
        }

        $tree = (new LazadaClient($account))->getCategoryTree();

        $rows = [];
        $this->flattenLazadaCategoryNodes($tree['data'] ?? [], null, $rows);

        $now = now();
        foreach (array_chunk($rows, 500) as $chunk) {
            LazadaCategory::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['parent_id', 'name', 'is_leaf', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($rows).' Lazada categories.');
    }

    /**
     * ทำให้แบนแบบ depth-first เพื่อให้แถวของ parent อยู่ก่อนแถวลูกของมันเสมอใน
     * $rows — จำเป็นเพราะ lazada_categories.parent_id เป็น FK จริงๆ ที่ชี้กลับมา
     * ที่ตารางเดียวกัน ซึ่งถูกเช็คทีละแถวตอนแต่ละ chunk ของ upsert รันอยู่
     */
    private function flattenLazadaCategoryNodes(array $nodes, ?int $parentId, array &$rows): void
    {
        foreach ($nodes as $node) {
            $rows[] = [
                'id' => $node['category_id'],
                'parent_id' => $parentId,
                'name' => $node['name'],
                'is_leaf' => (bool) ($node['leaf'] ?? false),
            ];

            if (! empty($node['children'])) {
                $this->flattenLazadaCategoryNodes($node['children'], $node['category_id'], $rows);
            }
        }
    }

    /**
     * รีเฟรชแคช shopee_categories ในระบบ จากต้นไม้หมวดหมู่จริงของ Shopee
     * (v2.product.get_category) — จุดประสงค์เดียวกับ syncLazadaCategories()
     * ด้านบน ต่างจาก Lazada ตรงที่การเข้าถึง category-tree ของ Shopee ยังต้องใช้
     * shop_id + access_token อยู่ (ดู ShopeeClient) และ shopee_tokens ก็ไม่มี
     * คอลัมน์ is_active ให้กรอง account ได้ เลยใช้ shop ที่เชื่อมต่อไว้ตัวไหนก็ได้
     * มา authenticate ตรงนี้
     */
    public function syncShopeeCategories(Request $request): RedirectResponse
    {
        $account = ShopeeSellerAccount::first();
        if (! $account) {
            return back()->with('error', 'No Shopee seller account found to authenticate the sync.');
        }

        $client = new ShopeeClient($account);
        $tree = $client->getCategoryTree('en');
        // Second call for the Thai name of the same tree — v2.product.get_category
        // takes `language` per request, it doesn't return every language at
        // once, so this is a real second round-trip, not free. Keyed by
        // category_id below to merge back onto the English rows built above,
        // matching the same node set/order guarantee (Shopee's own catalog,
        // not paginated or filtered differently between the two calls).
        $nameThById = collect($client->getCategoryTree('th')['response']['category_list'] ?? [])
            ->mapWithKeys(fn (array $node) => [
                $node['category_id'] => $node['display_category_name'] ?? $node['original_category_name'],
            ]);

        $rows = collect($tree['response']['category_list'] ?? [])->map(function (array $node) use ($nameThById) {
            $parentId = (int) ($node['parent_category_id'] ?? 0);

            return [
                'id' => $node['category_id'],
                'parent_id' => $parentId > 0 ? $parentId : null,
                'name' => $node['display_category_name'] ?? $node['original_category_name'],
                'name_th' => $nameThById->get($node['category_id']),
                'is_leaf' => ! ($node['has_children'] ?? false),
            ];
        })->all();

        // Shopee คืน category_list มาแบบแบน (ไม่ nested เหมือนต้นไม้ของ Lazada)
        // และไม่รับประกันว่า parent จะอยู่ก่อนลูกของมันในลิสต์ — แต่
        // shopee_categories.parent_id เป็น FK ที่ชี้กลับมาที่ตัวเองจริงๆ ซึ่งจะถูก
        // เช็คทีละแถวใน chunk ของ upsert ด้านล่าง เลยต้องจัดเรียงแถวใหม่แบบ
        // depth-first ก่อน (ข้อกำหนดเดียวกับ flattenLazadaCategoryNodes())
        $byParent = [];
        foreach ($rows as $row) {
            $byParent[$row['parent_id'] ?? 0][] = $row;
        }

        $ordered = [];
        $walk = function (int $parentId) use (&$walk, &$byParent, &$ordered) {
            foreach ($byParent[$parentId] ?? [] as $row) {
                $ordered[] = $row;
                $walk($row['id']);
            }
        };
        $walk(0);

        $now = now();
        foreach (array_chunk($ordered, 500) as $chunk) {
            ShopeeCategory::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['parent_id', 'name', 'name_th', 'is_leaf', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($ordered).' Shopee categories.');
    }

    /**
     * รีเฟรชแคช tiktok_categories ในระบบ จากต้นไม้หมวดหมู่จริงของ TikTok Shop —
     * จุดประสงค์เดียวกับ syncLazadaCategories()/syncShopeeCategories() ด้านบน
     * response ของ TikTok เป็นแบบแบนเหมือนของ Shopee (ไม่รับประกันลำดับ ต้อง
     * จัดเรียงแบบ depth-first ก่อน upsert เหมือนกัน) แต่ให้ id/parent_id/is_leaf
     * มาตรงๆ ทีละแถวเหมือนของ Lazada (ไม่ต้องคำนวณแบบ has_children) — ดู
     * TikTokClient::getCategoryTree() ซึ่งการ sign request ยังไม่ได้ยืนยันกับการ
     * เรียกจริง (ดู docblock ของ class นั้น) การ sync นี้จะยัง fail อยู่จนกว่าจะตั้งค่า
     * TIKTOK_APP_KEY/TIKTOK_APP_SECRET เป็นค่าจริงและได้ยืนยันแล้ว
     */
    public function syncTikTokCategories(Request $request): RedirectResponse
    {
        $account = TikTokSellerAccount::first();
        if (! $account) {
            return back()->with('error', 'No TikTok seller account found to authenticate the sync.');
        }

        $client = new TikTokClient($account);
        // 'en-US' explicitly, even though it's not the default — `name` is
        // meant as the English name consistently across every *_categories
        // cache (see this migration: add_name_th_to_tiktok_categories_table).
        $tree = $client->getCategoryTree(locale: 'en-US');
        // Second call for the Thai name of the same tree, same two-call
        // shape as syncShopeeCategories() — TikTok's `locale` (like Shopee's
        // `language`) is a per-request param, it doesn't return every
        // language in one call. Explicit 'th-TH' rather than relying on
        // getCategoryTree()'s own default, so this keeps working even if
        // that default ever changes.
        $nameThById = collect($client->getCategoryTree(locale: 'th-TH')['data']['categories'] ?? [])
            ->mapWithKeys(fn (array $node) => [$node['id'] => $node['local_name']]);

        $rows = collect($tree['data']['categories'] ?? [])->map(fn (array $node) => [
            'id' => $node['id'],
            'parent_id' => ! empty($node['parent_id']) ? $node['parent_id'] : null,
            'name' => $node['local_name'],
            'name_th' => $nameThById->get($node['id']),
            'is_leaf' => (bool) ($node['is_leaf'] ?? false),
        ])->all();

        // ต้องจัดเรียงใหม่ด้วยเหตุผลเดียวกับ syncShopeeCategories() ด้านบน —
        // tiktok_categories.parent_id เป็น FK ที่ชี้กลับมาที่ตัวเองจริงๆ ซึ่งจะถูก
        // เช็คทีละแถวใน chunk ของ upsert แต่ลิสต์แบบแบนของ TikTok ไม่รับประกันว่า
        // parent จะอยู่ก่อนลูก
        $byParent = [];
        foreach ($rows as $row) {
            $byParent[$row['parent_id'] ?? 0][] = $row;
        }

        $ordered = [];
        $walk = function (int $parentId) use (&$walk, &$byParent, &$ordered) {
            foreach ($byParent[$parentId] ?? [] as $row) {
                $ordered[] = $row;
                $walk($row['id']);
            }
        };
        $walk(0);

        $now = now();
        foreach (array_chunk($ordered, 500) as $chunk) {
            TikTokCategory::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['parent_id', 'name', 'name_th', 'is_leaf', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($ordered).' TikTok categories.');
    }

    /**
     * รีเฟรชแคช woocommerce_categories ในระบบ จากหมวดหมู่สินค้าจริงของร้าน
     * WooCommerce (GET /wp-json/wc/v3/products/categories) — จุดประสงค์เดียวกับ
     * syncLazadaCategories()/syncShopeeCategories()/syncTikTokCategories()
     * ด้านบน ไม่ต้อง lookup seller-account (WooCommerceClient อ่านจาก
     * config('services.woocommerce') ตรงๆ — ดู docblock ของ class นั้น) ต่างจาก
     * Shopee/TikTok ตรงที่ response ของ WooCommerce ไม่มีแฟล็ก
     * has_children/is_leaf ให้เลย เลยต้องคำนวณเอาเองตรงนี้: id หมวดหมู่ไหนที่ไป
     * ปรากฏเป็น `parent` ของแถวอื่น ก็ไม่ใช่ leaf ใช้ pagination (WooCommerce
     * จำกัด per_page สูงสุด 100) และจัดเรียงแบบ depth-first ก่อน upsert เหมือน
     * Shopee/TikTok เพราะไม่รับประกันลำดับข้ามหน้าเหมือนกัน
     */
    public function syncWoocommerceCategories(Request $request): RedirectResponse
    {
        try {
            $client = new WooCommerceClient();
        } catch (\RuntimeException $e) {
            return back()->with('error', $e->getMessage());
        }

        $raw = [];
        $page = 1;
        do {
            $fetched = $client->getCategories($page);
            foreach ($fetched as $node) {
                $parentId = (int) ($node['parent'] ?? 0);
                $raw[] = [
                    'id' => $node['id'],
                    'parent_id' => $parentId > 0 ? $parentId : null,
                    'name' => $node['name'],
                    'slug' => $node['slug'] ?? null,
                    'description' => $node['description'] ?? null,
                    'thumbnail_url' => $node['image']['src'] ?? null,
                ];
            }
            $page++;
        } while (count($fetched) === 100);

        $parentIds = collect($raw)->pluck('parent_id')->filter()->unique();
        $rows = collect($raw)->map(fn ($row) => [...$row, 'is_leaf' => ! $parentIds->contains($row['id'])])->all();

        $byParent = [];
        foreach ($rows as $row) {
            $byParent[$row['parent_id'] ?? 0][] = $row;
        }

        $ordered = [];
        $walk = function (int $parentId) use (&$walk, &$byParent, &$ordered) {
            foreach ($byParent[$parentId] ?? [] as $row) {
                $ordered[] = $row;
                $walk($row['id']);
            }
        };
        $walk(0);

        $now = now();
        foreach (array_chunk($ordered, 500) as $chunk) {
            WooCommerceCategory::upsert(
                array_map(fn ($row) => [...$row, 'created_at' => $now, 'updated_at' => $now], $chunk),
                ['id'],
                ['parent_id', 'name', 'slug', 'description', 'thumbnail_url', 'is_leaf', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($ordered).' WooCommerce categories.');
    }

    /**
     * ดาวน์โหลดตาราง woocommerce_categories ที่แคชไว้ในระบบ (ที่เติมข้อมูลโดย
     * syncWoocommerceCategories() ด้านบน) เป็น CSV — เป็น snapshot ของสิ่งที่มีอยู่
     * จริงบนร้าน WooCommerce ณ ตอน sync ล่าสุด ไม่ได้ดึงข้อมูลสดใหม่ Parent จะ
     * resolve เป็นชื่อจริงให้ (ไม่ใช่แค่ parent_id) เพื่อให้อ่านไฟล์ได้เข้าใจเองโดยไม่
     * ต้องไปเทียบ ID ข้ามไปมา
     */
    public function exportWoocommerceCategories(): BinaryFileResponse
    {
        $categories = WooCommerceCategory::orderBy('name')->get(['id', 'parent_id', 'name', 'slug', 'description', 'thumbnail_url', 'is_leaf']);
        $nameById = $categories->pluck('name', 'id');

        $rows = $categories->map(fn (WooCommerceCategory $category) => [
            'ID' => $category->id,
            'Name' => $category->name,
            // ทำให้อ่านง่ายใน CSV ที่คนเปิดดูตรงนี้ — ดู docblock ของ
            // importFromWoocommerce() ว่าทำไม WordPress ถึงเก็บ slug ภาษาไทย
            // เป็น percent-encoded ไว้
            'Slug' => $category->slug ? rawurldecode($category->slug) : '',
            'Parent' => $category->parent_id ? ($nameById[$category->parent_id] ?? $category->parent_id) : '',
            'Description' => $category->description ?? '',
            'Thumbnail' => $category->thumbnail_url ?? '',
            'Is Leaf' => $category->is_leaf ? 'Yes' : 'No',
        ])->all();

        $tempPath = sys_get_temp_dir().'/woocommerce_categories_'.Str::uuid().'.csv';
        SpreadsheetWriter::write($tempPath, 'csv', ['ID', 'Name', 'Slug', 'Parent', 'Description', 'Thumbnail', 'Is Leaf'], $rows, ',');

        $downloadName = 'woocommerce-categories-'.now()->format('Ymd_His').'.csv';

        return response()->download($tempPath, $downloadName)->deleteFileAfterSend(true);
    }

    /**
     * สร้าง/อัปเดตหมวดหมู่ PIM จริงๆ จากต้นไม้ woocommerce_categories ที่แคชไว้ใน
     * ระบบ (เติมข้อมูลโดย syncWoocommerceCategories() ด้านบน) — เป็นการทำงาน
     * กลับด้านกับหน้า mapping: แทนที่จะให้หมวดหมู่ PIM ที่มีอยู่แล้วชี้ไปหา
     * WooCommerce ตัวนี้จะดึงชื่อ/slug/คำอธิบาย/thumbnail ของ WooCommerce เอง
     * เข้ามาใส่ในแคตตาล็อก PIM ตรงๆ เลย
     *
     * จับคู่แบบระมัดระวังโดยตั้งใจ: จะอัปเดตให้ก็เฉพาะหมวดหมู่ PIM ที่แมปไว้แล้ว
     * เท่านั้น (categories.woocommerce_category_id = id ของแถวนี้ — ตั้งไว้ผ่าน
     * หน้า mapping หรือจากการรัน import ตัวนี้รอบก่อนหน้า) หมวดหมู่ WooCommerce
     * ที่ยังไม่ได้แมปทุกตัวจะสร้างหมวดหมู่ PIM ใหม่ขึ้นมาเลย แทนที่จะเดาจับคู่ตาม
     * ชื่อ/slug — เพราะการไปรวมเข้ากับหมวดหมู่ที่มีอยู่แล้วชื่อคล้ายกันแบบเงียบๆ
     * จะทำให้แปลกใจและย้อนกลับได้ยาก หมวดหมู่ที่เพิ่งสร้างใหม่จะถูกแมปทันที เพื่อ
     * ให้รันตัวนี้อีกครั้งทีหลังจะเป็นการอัปเดตแทนที่จะสร้างซ้ำ
     *
     * ประมวลผลจาก root ก่อน (ไล่แบบ depth-first เหมือน
     * syncWoocommerceCategories()) เพื่อให้ parent_id ของลูกชี้ไปหาหมวดหมู่ PIM
     * ที่สร้าง/อัปเดตไปแล้วเสมอ thumbnail_url จะเก็บไว้ตามที่ได้มาเลย (เป็น URL
     * จริงของ pumpkin.co.th ไม่ได้ดาวน์โหลดมา) — resolveStorageUrl() (ดู
     * index()/edit() ด้านบน) ส่ง absolute URL ผ่านตรงๆ อยู่แล้วโดยไม่แก้ไข เลยไม่
     * ต้องจัดการอะไรพิเศษตอนอ่าน
     */
    public function importFromWoocommerce(Request $request): RedirectResponse
    {
        $wcCategories = WooCommerceCategory::all()->keyBy('id');

        $byParent = [];
        foreach ($wcCategories as $wc) {
            $byParent[$wc->parent_id ?? 0][] = $wc;
        }

        $ordered = [];
        $walk = function (int $parentId) use (&$walk, &$byParent, &$ordered) {
            foreach ($byParent[$parentId] ?? [] as $wc) {
                $ordered[] = $wc;
                $walk($wc->id);
            }
        };
        $walk(0);

        $pimIdByWooId = Category::whereNotNull('woocommerce_category_id')
            ->get(['id', 'woocommerce_category_id'])
            ->pluck('id', 'woocommerce_category_id');

        $existingById = Category::whereNotNull('woocommerce_category_id')->get()->keyBy('woocommerce_category_id');

        $created = 0;
        $updated = 0;

        foreach ($ordered as $wc) {
            $parentPimId = $wc->parent_id ? ($pimIdByWooId[$wc->parent_id] ?? null) : null;

            $attributes = [
                'name' => $wc->name,
                // WordPress เก็บ slug ของ term ที่ไม่ใช่ตัวอักษรละติน (เช่นภาษาไทย)
                // แบบ percent-encoded (sanitize_title() จะ urlencode UTF-8
                // แบบ multi-byte แทนที่จะแปลงเป็นอักษรโรมัน) — เช็คจากของจริงแล้ว
                // เมื่อ 2026-08-20 ว่าค่าดิบๆ อย่าง "%e0%b9%80%e0%b8..." โผล่มา
                // อ่านไม่ออกในลิสต์หมวดหมู่ เลย decode ตรงนี้ครั้งเดียว เพื่อให้ทุก
                // จุดที่อ่าน `categories.slug` ของเราเอง (ลิสต์, edit, export)
                // โชว์เป็นข้อความไทยจริงๆ ส่วน woocommerce_categories.slug เองยัง
                // เก็บแบบ encode ไว้เหมือนเดิม — เพราะเป็นค่าดิบจริงๆ ของ
                // WooCommerce เก็บไว้ให้ตรงต้นฉบับเผื่อวันหลังต้องเอาไปใช้เรียก API
                // กลับไปหาเขาจริงๆ
                'slug' => $wc->slug ? rawurldecode($wc->slug) : null,
                'description' => $wc->description,
                'thumbnail' => $wc->thumbnail_url,
                'parent_id' => $parentPimId,
                'woocommerce_category_id' => $wc->id,
                'updated_by' => $request->user()?->id,
            ];

            $existing = $existingById->get($wc->id);

            if ($existing) {
                $existing->update($attributes);
                $pimIdByWooId[$wc->id] = $existing->id;
                $updated++;
            } else {
                $category = CodeGenerator::createWithRetry('categories', 'category', fn ($code) => Category::create([
                    ...$attributes,
                    'code' => $code,
                    'created_by' => $request->user()?->id,
                ]));
                $pimIdByWooId[$wc->id] = $category->id;
                $created++;
            }
        }

        Category::bumpTreeCacheVersion();

        return back()->with('success', "Imported {$created} new / updated {$updated} categories from WooCommerce.");
    }

    /**
     * endpoint สำหรับค้นหาที่หนุนหลัง Autocomplete ของ PIM category บนหน้า
     * categories/shopee-mapping.tsx — เป็นภาพสะท้อนกลับด้านของ
     * searchShopeeCategories() ด้านล่าง การแมปตรงนั้นเริ่มจาก node ของ Shopee
     * แล้วถามว่า "ตรงกับหมวดหมู่ *ของเรา* ตัวไหน" ตัวเลือกเลยต้องค้นหาหมวดหมู่
     * แบบ leaf ในระบบเรา ไม่ใช่ของ marketplace
     *
     * "leaf" ที่นี่หมายถึงกลุ่มสินค้าจริงๆ (ระดับที่ 3: หมวดหมู่สินค้า > หมวดย่อย
     * สินค้า > กลุ่มสินค้า) ไม่ใช่แค่ "ไม่มีลูก" เฉยๆ — เดิมเช็คแค่ whereDoesntHave
     * ('children') ซึ่งเผลอรับหมวดหมู่/หมวดย่อยที่บังเอิญยังไม่มีลูกเลย (พบจริง 124
     * รายการ: 3 root + 121 หมวดย่อย) เข้ามาปนด้วย ทั้งที่ไม่ใช่กลุ่มสินค้า จึงต้อง
     * เช็คเพิ่มว่ามีทั้ง parent และ parent ของ parent (whereNotNull('parent_id')
     * ซ้อนกัน 2 ชั้น) ด้วย
     *
     * เช็ค is_active ทั้งสายบรรพบุรุษ (ตัวเอง + หมวดย่อย + หมวดหมู่หลัก) ไม่ใช่แค่
     * ตัวเองอย่างเดียว — กลุ่มสินค้าที่ active แต่หมวดย่อย/หมวดหมู่หลักที่ครอบมันถูกปิด
     * ใช้งานไปแล้ว ไม่ควรโผล่มาให้เลือก map ต่อ เพราะจะดูเหมือนหมวดหมู่นั้นยังใช้งาน
     * ได้อยู่ทั้งที่จริงๆ ทั้งสายถูกปิดไปแล้ว
     */
    public function searchCategories(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $categories = Category::query()->without('translations')
            ->where('is_active', true)
            ->whereDoesntHave('children')
            ->whereNotNull('parent_id')
            ->whereHas('parent', function ($q) {
                $q->where('is_active', true)
                    ->whereNotNull('parent_id')
                    ->whereHas('parent', fn ($q2) => $q2->where('is_active', true));
            })
            ->when($query !== '', fn ($q) => $q->where(function ($q2) use ($query) {
                $q2->where('name', 'like', "%{$query}%")
                    ->orWhereRaw("additional_data->>'name_eng' ILIKE ?", ["%{$query}%"]);
            }))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'parent_id', 'name']);

        // โหลดครั้งเดียวเพื่อ resolve สายบรรพบุรุษ ใช้ trade-off เดียวกับ $allX
        // ของหน้า mapping ที่ยึดแถวจากต้นไม้ marketplace เอง — path เต็มของแต่ละ
        // ผลลัพธ์ช่วยแยกแยะ leaf ที่ชื่อซ้ำกัน (เช่น "Others" สองตัวที่อยู่ใต้ parent
        // คนละตัว) ซึ่งลิสต์ชื่อเปล่าๆ แยกไม่ได้
        $allCategories = Category::query()->without('translations')->get(['id', 'parent_id', 'name'])->keyBy('id');
        $pathOf = function (int $id) use ($allCategories): string {
            $names = [];
            $node = $allCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $data = $categories->map(fn (Category $c) => ['id' => $c->id, 'name' => $c->name, 'path' => $pathOf($c->id)])->values();

        return response()->json(['data' => $data]);
    }

    /**
     * endpoint สำหรับค้นหาที่หนุนหลัง Autocomplete ของหมวดหมู่ Lazada บนฟอร์ม
     * edit หมวดหมู่ — เลือกได้แค่หมวดหมู่แบบ leaf เท่านั้น เพราะ Lazada บังคับ
     * ให้สินค้าต้องอยู่ใน leaf ไม่ใช่ node ที่เป็น parent
     */
    public function searchLazadaCategories(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $categories = LazadaCategory::where('is_leaf', true)
            ->when($query !== '', fn ($q) => $q->where('name', 'like', "%{$query}%"))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'parent_id']);

        return response()->json(['data' => $categories]);
    }

    /**
     * endpoint สำหรับค้นหาที่หนุนหลัง Autocomplete ของหมวดหมู่ Shopee บนหน้า
     * review การ mapping — ทำงานเหมือนกับ searchLazadaCategories() ด้านบน
     */
    public function searchShopeeCategories(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $categories = ShopeeCategory::where('is_leaf', true)
            ->when($query !== '', fn ($q) => $q->where(fn ($q2) => $q2->where('name', 'like', "%{$query}%")->orWhere('name_th', 'like', "%{$query}%")))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'name_th', 'parent_id']);

        return response()->json(['data' => $categories]);
    }

    /**
     * endpoint ค้นหาที่หนุนหลัง Autocomplete ของหมวดหมู่ TikTok บนหน้า Edit
     * Category — ทำงานเหมือน searchShopeeCategories() (ค้นทั้ง name และ name_th)
     */
    public function searchTikTokCategories(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $categories = TikTokCategory::where('is_leaf', true)
            ->when($query !== '', fn ($q) => $q->where(fn ($q2) => $q2->where('name', 'like', "%{$query}%")->orWhere('name_th', 'like', "%{$query}%")))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'name_th', 'parent_id']);

        return response()->json(['data' => $categories]);
    }

    /**
     * endpoint ค้นหาที่หนุนหลัง Autocomplete ของหมวดหมู่ WooCommerce บนหน้า Edit
     * Category — ทำงานเหมือน searchLazadaCategories() (WooCommerce ไม่มี name_th)
     */
    public function searchWoocommerceCategories(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $categories = WooCommerceCategory::where('is_leaf', true)
            ->when($query !== '', fn ($q) => $q->where('name', 'like', "%{$query}%"))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'parent_id']);

        return response()->json(['data' => $categories]);
    }

    /**
     * ลิสต์สินค้าแบบเบาๆ ของหมวดหมู่หนึ่งๆ — ใช้ขับเคลื่อนส่วนขยาย "หมวดหมู่นี้
     * กระทบสินค้าตัวไหนบ้าง" บนหน้า review การ mapping ของ Lazada/Shopee เพื่อให้
     * หมวดหมู่ที่ยังไม่แมปแต่มีสินค้าจริงติดอยู่ (ทำให้สินค้าทุกตัวนั้น push ไปยัง
     * แพลตฟอร์มนั้นไม่ได้) ถูกจัดลำดับความสำคัญก่อนหมวดหมู่ที่ไม่มีสินค้าเลย ไม่ได้
     * เจาะจงแพลตฟอร์มใด — endpoint เดียวกันใช้ได้ทั้งคู่
     */
    public function categoryProducts(Category $category): JsonResponse
    {
        $products = $category->products()
            ->orderBy('sku')
            ->get(['products.id', 'products.sku'])
            ->map(fn ($p) => ['id' => $p->id, 'sku' => $p->sku]);

        return response()->json(['data' => $products]);
    }

    /**
     * UI สำหรับ review แบบ bulk เพื่อแมปต้นไม้หมวดหมู่ของ Lazada เข้ากับหมวดหมู่
     * PIM ในระบบ — ใช้รูปแบบตารางและแนวคิดเดียวกับ shopeeMapping() (ดู
     * docblock ของเมธอดนั้น): ทุกแถวคือ node จากต้นไม้ Lazada ที่ mirror ไว้ในระบบ
     * (~lazada_categories, sync มาผ่าน syncLazadaCategories()) ไม่ใช่หมวดหมู่
     * PIM ที่มีคำแนะนำจาก fuzzy-match แบบที่หน้าเก่าที่ใช้
     * buildCategoryMappingData() เคยทำงาน (ตอนนี้ทั้ง 4 แพลตฟอร์มย้ายมาใช้รูปแบบ
     * ยึดแถวจากต้นไม้ marketplace แบบนี้เหมือนกันหมดแล้ว — helper ตัวนั้นถูกลบไป
     * แล้ว)
     *
     * ไม่มีคอลัมน์ brand_count ตรงนี้ ต่างจากของ shopeeMapping() — เพราะลิสต์
     * แบรนด์ของ Lazada ไม่ได้ผูกกับหมวดหมู่เลย (เช็คจากของจริงแล้วว่า
     * /category/brands/query ไม่มี parameter หมวดหมู่ให้ใส่) เลยไม่มีข้อมูลแบรนด์
     * รายหมวดหมู่ให้โชว์บนหน้านี้
     */
    public function lazadaMapping(Request $request): Response
    {
        // Default to 'leaf' — Shopee/Lazada/TikTok/WooCommerce categories can
        // only ever be mapped/pushed at the leaf level, so 'leaf' is what an
        // admin reviewing this page actually wants to see almost every time;
        // 'all' still reachable via the filter toggle for anyone who does
        // want to browse parent nodes too.
        $filter = $request->input('filter', 'leaf');
        if (! in_array($filter, ['all', 'leaf', 'parent', 'flagged'], true)) {
            $filter = 'all';
        }

        $search = trim((string) $request->input('search', ''));

        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        // โหลดครั้งเดียวเพื่อ resolve สายบรรพบุรุษ — ราคาถูกสำหรับข้อมูลหลักพันแถว
        // และเลี่ยงการยิง query 1 ครั้งต่อแถวต่อระดับของต้นไม้
        $allLazada = LazadaCategory::query()->get(['id', 'parent_id', 'name'])->keyBy('id');

        $pathOf = function (int $id) use ($allLazada): string {
            $names = [];
            $node = $allLazada->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allLazada->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $mappedLazadaIds = Category::query()->whereNotNull('lazada_category_id')->pluck('lazada_category_id')->unique()->values();

        $query = LazadaCategory::query();

        if ($filter === 'leaf') {
            $query->where('is_leaf', true);
        } elseif ($filter === 'parent') {
            $query->where('is_leaf', false);
        } elseif ($filter === 'flagged') {
            $query->whereIn('id', $mappedLazadaIds->isEmpty() ? [0] : $mappedLazadaIds);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%");
                if (ctype_digit($search)) {
                    $q->orWhere('id', (int) $search);
                }
            });
        }

        $paginated = $query->orderBy('id')->paginate($perPage)->withQueryString();

        $pageIds = $paginated->getCollection()->pluck('id');
        $mappedByLazadaId = Category::query()->without('translations')
            ->whereIn('lazada_category_id', $pageIds)
            ->get(['id', 'name', 'lazada_category_id'])
            ->groupBy('lazada_category_id');

        $rows = $paginated->getCollection()->map(fn (LazadaCategory $lazada) => [
            'id' => $lazada->id,
            'name' => $lazada->name,
            'path' => $pathOf($lazada->id),
            'leaf' => (bool) $lazada->is_leaf,
            'mapped_categories' => ($mappedByLazadaId->get($lazada->id) ?? collect())
                ->map(fn (Category $c) => ['id' => $c->id, 'name' => $c->name])
                ->values(),
        ]);

        $paginated->setCollection($rows);

        // ดูคอมเมนต์ของ marketplaceSync() ว่าทำไม ::max() ต้อง parse เป็น UTC
        // ก่อน serialize ให้ชัดเจน
        $toIso = fn (?string $value) => $value ? Carbon::parse($value, 'UTC')->toISOString() : null;

        return Inertia::render('catalog/categories/lazada-mapping', [
            'categories' => $paginated,
            'stats' => [
                'total' => LazadaCategory::count(),
                'leaf' => LazadaCategory::where('is_leaf', true)->count(),
                'parent' => LazadaCategory::where('is_leaf', false)->count(),
                'mapped' => $mappedLazadaIds->count(),
            ],
            'lastSyncedAt' => $toIso(LazadaCategory::max('updated_at')),
            'filters' => ['filter' => $filter, 'search' => $search, 'per_page' => $perPage],
        ]);
    }

    /**
     * UI สำหรับ review แบบ bulk เพื่อแมปต้นไม้หมวดหมู่ของ Shopee เข้ากับหมวดหมู่
     * PIM ในระบบ — ทุกแถวคือหมวดหมู่จากต้นไม้ Shopee ที่ mirror ไว้ในระบบ
     * (ประมาณ 2,400 แถวที่ sync มาจาก v2.product.get_category — ดู
     * syncShopeeCategories()) และแต่ละแถวจะลิสต์ว่าหมวดหมู่ PIM ตัวไหนชี้มาหามัน
     * ผ่าน categories.shopee_category_id อยู่บ้าง (lazadaMapping()/
     * tiktokMapping()/woocommerceMapping() ตอนนี้ทำงานแบบเดียวกันหมดแล้ว)
     * ต้นไม้ของ Shopee ลึกและจัดโครงสร้างต่างจากของเรามากพอที่การ review ตรงๆ —
     * "leaf นี้ของ Shopee ควรเป็นหมวดหมู่ PIM ตัวไหน" — จะจับข้อผิดพลาดในการเลือก
     * (เช่นเครื่องปั่นไฟไปแมปกับ "Industrial Adhesives & Tapes") ที่การจับคู่ชื่อ
     * แบบ fuzzy อย่างเดียวมองข้ามไปได้
     */
    public function shopeeMapping(Request $request): Response
    {
        // แถวเป็นหมวดหมู่ของ Shopee ไม่ใช่ของ PIM ที่มีจำนวนสินค้า หน้านี้เลยใช้ตัวกรอง
        // แบบ segmented ตัวเดียวแทน: All / Leaf only / Parent only / Flagged
        // (= มีการแมปกับ PIM แล้ว — เอามาโชว์ให้ review เพราะการแมปจริงตัวหนึ่งที่
        // หน้านี้เข้ามาแทนที่ กลับกลายเป็นว่าแมปผิด)
        // Default to 'leaf' — Shopee/Lazada/TikTok/WooCommerce categories can
        // only ever be mapped/pushed at the leaf level, so 'leaf' is what an
        // admin reviewing this page actually wants to see almost every time;
        // 'all' still reachable via the filter toggle for anyone who does
        // want to browse parent nodes too.
        $filter = $request->input('filter', 'leaf');
        if (! in_array($filter, ['all', 'leaf', 'parent', 'flagged'], true)) {
            $filter = 'all';
        }

        $search = trim((string) $request->input('search', ''));

        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        // โหลดครั้งเดียวเพื่อ resolve สายบรรพบุรุษ — ราคาถูกสำหรับข้อมูลหลักพันแถว
        // และเลี่ยงการยิง query 1 ครั้งต่อแถวต่อระดับของต้นไม้
        $allShopee = ShopeeCategory::query()->get(['id', 'parent_id', 'name', 'name_th'])->keyBy('id');

        // $useThaiName ตัดสินจากแต่ละ node ตอน build เอง (ไม่ fallback ไป name
        // อังกฤษเงียบๆ ตอนไม่มี name_th) เพราะ syncShopeeCategories() เก่าที่ sync
        // มาก่อนจะเพิ่มคอลัมน์นี้ยังไม่มี name_th เลย — path ผสมสองภาษากันได้ถ้า
        // sync ครั้งล่าสุดยังไม่ครบทุก node ซึ่งถูกต้องกว่าการซ่อนช่องว่างนั้นไว้
        $pathOf = function (int $id, bool $thai = false) use ($allShopee): string {
            $names = [];
            $node = $allShopee->get($id);
            while ($node) {
                array_unshift($names, ($thai ? $node->name_th : null) ?? $node->name);
                $node = $node->parent_id ? $allShopee->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $mappedShopeeIds = Category::query()->whereNotNull('shopee_category_id')->pluck('shopee_category_id')->unique()->values();

        $query = ShopeeCategory::query();

        if ($filter === 'leaf') {
            $query->where('is_leaf', true);
        } elseif ($filter === 'parent') {
            $query->where('is_leaf', false);
        } elseif ($filter === 'flagged') {
            $query->whereIn('id', $mappedShopeeIds->isEmpty() ? [0] : $mappedShopeeIds);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('name_th', 'like', "%{$search}%");
                if (ctype_digit($search)) {
                    $q->orWhere('id', (int) $search);
                }
            });
        }

        $paginated = $query->orderBy('id')->paginate($perPage)->withQueryString();

        $pageIds = $paginated->getCollection()->pluck('id');
        $mappedByShopeeId = Category::query()->without('translations')
            ->whereIn('shopee_category_id', $pageIds)
            ->get(['id', 'name', 'shopee_category_id'])
            ->groupBy('shopee_category_id');

        // แต่ละหมวดหมู่ในหน้านี้มีแบรนด์ Shopee แคชไว้กี่ตัว — เอามาแค่จำนวนนับ ไม่ใช่
        // ลิสต์เต็มๆ (ลิสต์เต็มจะดึงแบบ lazy ทีละแถวตอนกดขยายครั้งแรก ใช้
        // trade-off เดียวกับ CategoryProductsExpander/
        // BrandController::shopeeBrandsForCategory())
        $brandCountByShopeeId = ShopeeBrand::whereIn('category_id', $pageIds)
            ->selectRaw('category_id, count(*) as cnt')
            ->groupBy('category_id')
            ->pluck('cnt', 'category_id');

        $rows = $paginated->getCollection()->map(fn (ShopeeCategory $shopee) => [
            'id' => $shopee->id,
            'name' => $shopee->name,
            'name_th' => $shopee->name_th,
            'path' => $pathOf($shopee->id),
            'path_th' => $shopee->name_th ? $pathOf($shopee->id, thai: true) : null,
            'leaf' => (bool) $shopee->is_leaf,
            'mapped_categories' => ($mappedByShopeeId->get($shopee->id) ?? collect())
                ->map(fn (Category $c) => ['id' => $c->id, 'name' => $c->name])
                ->values(),
            'brand_count' => (int) ($brandCountByShopeeId[$shopee->id] ?? 0),
        ]);

        $paginated->setCollection($rows);

        // ดูคอมเมนต์ของ marketplaceSync() ว่าทำไม ::max() ต้อง parse เป็น UTC
        // ก่อน serialize ให้ชัดเจน
        $toIso = fn (?string $value) => $value ? Carbon::parse($value, 'UTC')->toISOString() : null;

        return Inertia::render('catalog/categories/shopee-mapping', [
            'categories' => $paginated,
            'stats' => [
                'total' => ShopeeCategory::count(),
                'leaf' => ShopeeCategory::where('is_leaf', true)->count(),
                'parent' => ShopeeCategory::where('is_leaf', false)->count(),
                'mapped' => $mappedShopeeIds->count(),
            ],
            'lastSyncedAt' => $toIso(ShopeeCategory::max('updated_at')),
            'filters' => ['filter' => $filter, 'search' => $search, 'per_page' => $perPage],
        ]);
    }

    /**
     * UI สำหรับ review แบบ bulk เพื่อแมปต้นไม้หมวดหมู่ของ TikTok เข้ากับหมวดหมู่
     * PIM ในระบบ — ใช้รูปแบบตารางและแนวคิดเดียวกับ lazadaMapping()/
     * shopeeMapping() (ดู docblock ของ shopeeMapping()): ทุกแถวคือ node จาก
     * ต้นไม้ TikTok ที่ mirror ไว้ในระบบ (tiktok_categories, sync มาผ่าน
     * syncTikTokCategories()) ไม่ใช่หมวดหมู่ PIM ที่มีคำแนะนำจาก fuzzy-match
     * แบบที่หน้าเก่าที่ใช้ buildCategoryMappingData() เคยทำงาน (ตอนนี้ทั้ง 4
     * แพลตฟอร์มใช้รูปแบบนี้เหมือนกันหมดแล้ว — ดู docblock ของ shopeeMapping())
     *
     * ไม่มีคอลัมน์ brand_count ตรงนี้ (ต่างจากของ shopeeMapping()) — เพราะลิสต์
     * แบรนด์ของ TikTok ในการ sync ของแอปนี้ไม่ได้ผูกกับหมวดหมู่เลย (ดู docblock
     * ของ BrandController::syncTiktokBrands(): getBrands() ถูกเรียกโดยไม่มี
     * category_id) เลยไม่มีข้อมูลแบรนด์รายหมวดหมู่ให้โชว์บนหน้านี้
     */
    public function tiktokMapping(Request $request): Response
    {
        // Default to 'leaf' — Shopee/Lazada/TikTok/WooCommerce categories can
        // only ever be mapped/pushed at the leaf level, so 'leaf' is what an
        // admin reviewing this page actually wants to see almost every time;
        // 'all' still reachable via the filter toggle for anyone who does
        // want to browse parent nodes too.
        $filter = $request->input('filter', 'leaf');
        if (! in_array($filter, ['all', 'leaf', 'parent', 'flagged'], true)) {
            $filter = 'all';
        }

        $search = trim((string) $request->input('search', ''));

        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        // โหลดครั้งเดียวเพื่อ resolve สายบรรพบุรุษ — ราคาถูกสำหรับข้อมูลหลักพันแถว
        // และเลี่ยงการยิง query 1 ครั้งต่อแถวต่อระดับของต้นไม้
        $allTikTok = TikTokCategory::query()->get(['id', 'parent_id', 'name', 'name_th'])->keyBy('id');

        $pathOf = function (int $id, bool $thai = false) use ($allTikTok): string {
            $names = [];
            $node = $allTikTok->get($id);
            while ($node) {
                array_unshift($names, ($thai ? $node->name_th : null) ?? $node->name);
                $node = $node->parent_id ? $allTikTok->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $mappedTikTokIds = Category::query()->whereNotNull('tiktok_category_id')->pluck('tiktok_category_id')->unique()->values();

        $query = TikTokCategory::query();

        if ($filter === 'leaf') {
            $query->where('is_leaf', true);
        } elseif ($filter === 'parent') {
            $query->where('is_leaf', false);
        } elseif ($filter === 'flagged') {
            $query->whereIn('id', $mappedTikTokIds->isEmpty() ? [0] : $mappedTikTokIds);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('name_th', 'like', "%{$search}%");
                if (ctype_digit($search)) {
                    $q->orWhere('id', (int) $search);
                }
            });
        }

        $paginated = $query->orderBy('id')->paginate($perPage)->withQueryString();

        $pageIds = $paginated->getCollection()->pluck('id');
        $mappedByTikTokId = Category::query()->without('translations')
            ->whereIn('tiktok_category_id', $pageIds)
            ->get(['id', 'name', 'tiktok_category_id'])
            ->groupBy('tiktok_category_id');

        $rows = $paginated->getCollection()->map(fn (TikTokCategory $tiktok) => [
            'id' => $tiktok->id,
            'name' => $tiktok->name,
            'name_th' => $tiktok->name_th,
            'path' => $pathOf($tiktok->id),
            'path_th' => $tiktok->name_th ? $pathOf($tiktok->id, thai: true) : null,
            'leaf' => (bool) $tiktok->is_leaf,
            'mapped_categories' => ($mappedByTikTokId->get($tiktok->id) ?? collect())
                ->map(fn (Category $c) => ['id' => $c->id, 'name' => $c->name])
                ->values(),
        ]);

        $paginated->setCollection($rows);

        // ดูคอมเมนต์ของ marketplaceSync() ว่าทำไม ::max() ต้อง parse เป็น UTC
        // ก่อน serialize ให้ชัดเจน
        $toIso = fn (?string $value) => $value ? Carbon::parse($value, 'UTC')->toISOString() : null;

        return Inertia::render('catalog/categories/tiktok-mapping', [
            'categories' => $paginated,
            'stats' => [
                'total' => TikTokCategory::count(),
                'leaf' => TikTokCategory::where('is_leaf', true)->count(),
                'parent' => TikTokCategory::where('is_leaf', false)->count(),
                'mapped' => $mappedTikTokIds->count(),
            ],
            'lastSyncedAt' => $toIso(TikTokCategory::max('updated_at')),
            'filters' => ['filter' => $filter, 'search' => $search, 'per_page' => $perPage],
        ]);
    }

    /**
     * UI สำหรับ review แบบ bulk เพื่อแมปหมวดหมู่สินค้าของ WooCommerce เข้ากับ
     * หมวดหมู่ PIM ในระบบ — รูปแบบเดียวกับ tiktokMapping()/lazadaMapping()/
     * shopeeMapping() (ดู docblock ของ shopeeMapping()) นี่เป็นหน้าสุดท้ายที่ยังใช้
     * รูปแบบเก่าแบบยึด PIM-row ของ buildCategoryMappingData() อยู่ เพื่อให้
     * สอดคล้องกับที่อีก 3 แพลตฟอร์มถูกเขียนใหม่ไปแล้ว (และเพื่อให้ส่วน Brands
     * ด้านล่างใช้ layout หน้าเดียวกันได้) ตอนนี้เลยได้ใช้ตารางแบบยึดแถวจากต้นไม้
     * marketplace เดียวกันนี้ด้วย
     *
     * ไม่มีคอลัมน์ brand_count (ต่างจากของ shopeeMapping()) — เพราะลิสต์แบรนด์
     * ของ WooCommerce ไม่ได้ผูกกับหมวดหมู่เลย (เช็คจากของจริงแล้วว่า taxonomy
     * "Product Brands" ของเขาเองไม่มีความสัมพันธ์กับหมวดหมู่เลย) เลยไม่มีข้อมูล
     * แบรนด์รายหมวดหมู่ให้โชว์บนหน้านี้
     */
    public function woocommerceMapping(Request $request): Response
    {
        // Default to 'leaf' — Shopee/Lazada/TikTok/WooCommerce categories can
        // only ever be mapped/pushed at the leaf level, so 'leaf' is what an
        // admin reviewing this page actually wants to see almost every time;
        // 'all' still reachable via the filter toggle for anyone who does
        // want to browse parent nodes too.
        $filter = $request->input('filter', 'leaf');
        if (! in_array($filter, ['all', 'leaf', 'parent', 'flagged'], true)) {
            $filter = 'all';
        }

        $search = trim((string) $request->input('search', ''));

        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        // โหลดครั้งเดียวเพื่อ resolve สายบรรพบุรุษ — ราคาถูกสำหรับข้อมูลหลักพันแถว
        // และเลี่ยงการยิง query 1 ครั้งต่อแถวต่อระดับของต้นไม้
        $allWoocommerce = WooCommerceCategory::query()->get(['id', 'parent_id', 'name'])->keyBy('id');

        $pathOf = function (int $id) use ($allWoocommerce): string {
            $names = [];
            $node = $allWoocommerce->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allWoocommerce->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $mappedWoocommerceIds = Category::query()->whereNotNull('woocommerce_category_id')->pluck('woocommerce_category_id')->unique()->values();

        $query = WooCommerceCategory::query();

        if ($filter === 'leaf') {
            $query->where('is_leaf', true);
        } elseif ($filter === 'parent') {
            $query->where('is_leaf', false);
        } elseif ($filter === 'flagged') {
            $query->whereIn('id', $mappedWoocommerceIds->isEmpty() ? [0] : $mappedWoocommerceIds);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%");
                if (ctype_digit($search)) {
                    $q->orWhere('id', (int) $search);
                }
            });
        }

        $paginated = $query->orderBy('id')->paginate($perPage)->withQueryString();

        $pageIds = $paginated->getCollection()->pluck('id');
        $mappedByWoocommerceId = Category::query()->without('translations')
            ->whereIn('woocommerce_category_id', $pageIds)
            ->get(['id', 'name', 'woocommerce_category_id'])
            ->groupBy('woocommerce_category_id');

        $rows = $paginated->getCollection()->map(fn (WooCommerceCategory $woo) => [
            'id' => $woo->id,
            'name' => $woo->name,
            'path' => $pathOf($woo->id),
            'leaf' => (bool) $woo->is_leaf,
            'mapped_categories' => ($mappedByWoocommerceId->get($woo->id) ?? collect())
                ->map(fn (Category $c) => ['id' => $c->id, 'name' => $c->name])
                ->values(),
        ]);

        $paginated->setCollection($rows);

        // ดูคอมเมนต์ของ marketplaceSync() ว่าทำไม ::max() ต้อง parse เป็น UTC
        // ก่อน serialize ให้ชัดเจน
        $toIso = fn (?string $value) => $value ? Carbon::parse($value, 'UTC')->toISOString() : null;

        return Inertia::render('catalog/categories/woocommerce-mapping', [
            'categories' => $paginated,
            'stats' => [
                'total' => WooCommerceCategory::count(),
                'leaf' => WooCommerceCategory::where('is_leaf', true)->count(),
                'parent' => WooCommerceCategory::where('is_leaf', false)->count(),
                'mapped' => $mappedWoocommerceIds->count(),
            ],
            'lastSyncedAt' => $toIso(WooCommerceCategory::max('updated_at')),
            'filters' => ['filter' => $filter, 'search' => $search, 'per_page' => $perPage],
        ]);
    }

    /**
     * ตรรกะการบันทึกข้อมูลที่ใช้ร่วมกันของ bulkMapLazada() และ bulkMapShopee()
     * — ตรวจสอบว่าแต่ละตัวเลือกที่ส่งมาชี้ไปหาหมวดหมู่ marketplace แบบ leaf จริงๆ
     * อัปเดตเฉพาะแถวที่เปลี่ยนจริงเท่านั้น และบันทึก audit entry ไว้ทุกครั้งที่มี
     * การเปลี่ยนแปลง
     *
     * @param  class-string<LazadaCategory>|class-string<ShopeeCategory>  $marketplaceModel
     */
    private function bulkMapMarketplaceCategory(Request $request, string $fkColumn, string $marketplaceTable, string $marketplaceModel, string $auditEvent): RedirectResponse
    {
        $validated = $request->validate([
            'mappings' => ['required', 'array'],
            'mappings.*.category_id' => ['required', 'integer', 'exists:categories,id'],
            "mappings.*.{$fkColumn}" => ['nullable', 'integer', "exists:{$marketplaceTable},id"],
        ]);

        $categories = Category::whereIn('id', collect($validated['mappings'])->pluck('category_id'))
            ->get()
            ->keyBy('id');

        $requestedIds = collect($validated['mappings'])->pluck($fkColumn)->filter()->values();
        $leafIds = $marketplaceModel::whereIn('id', $requestedIds)->where('is_leaf', true)->pluck('id');

        $updated = 0;

        foreach ($validated['mappings'] as $mapping) {
            $category = $categories->get($mapping['category_id']);
            if (! $category) {
                continue;
            }

            $newId = $mapping[$fkColumn] ?? null;

            // ถ้าตัวเลือกไม่เป็น null ต้องชี้ไปหาหมวดหมู่แบบ leaf จริงๆ เท่านั้น —
            // อย่างอื่นตัดทิ้งไปเงียบๆ เลย UI จะเสนอให้เลือกแต่ leaf อยู่แล้ว แต่
            // ตรงนี้ก็กันไว้เผื่อมีการเรียก API ตรงๆ ด้วย
            if ($newId !== null && ! $leafIds->contains($newId)) {
                continue;
            }

            if ($newId === $category->{$fkColumn}) {
                continue;
            }

            $oldId = $category->{$fkColumn};
            $category->update([$fkColumn => $newId]);

            AuditLog::record(
                $auditEvent,
                $category,
                [$fkColumn => $oldId],
                [$fkColumn => $newId],
            );

            $updated++;
        }

        // tree()'s cached payload (key: Category::treeCacheVersion(), up to
        // 6h TTL) now carries each node's mapped_platforms — feeds
        // CategoryCascadeSelect's chips on the Edit Product page. Without
        // bumping the version here, a mapping saved on this page (shopee/
        // lazada/tiktok/woocommerce-mapping.tsx) wouldn't show up there
        // until that cache naturally expired — same staleness
        // bumpTreeCacheVersion() already guards against for the tree's own
        // shape/label changes (see tree()'s docblock).
        if ($updated > 0) {
            Category::bumpTreeCacheVersion();
        }

        return back()->with('success', "Updated {$updated} category mapping(s).");
    }

    /**
     * บันทึกตัวเลือกที่เลือกไว้ชัดเจนจากหน้า review การ mapping แต่ละรายการเป็น
     * ได้ทั้งหมวดหมู่ Lazada แบบ leaf ที่เลือกไว้ หรือ `null` ชัดเจน (ล้างค่า)
     * แถวที่ผู้ใช้ไม่ได้แตะเลยจะไม่ถูกรวมอยู่ใน payload เลย — ดูที่
     * resources/js/pages/catalog/categories/lazada-mapping.tsx
     */
    public function bulkMapLazada(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'lazada_category_id', 'lazada_categories', LazadaCategory::class, 'lazada_category_mapped');
    }

    /**
     * เหมือนกับ bulkMapLazada() ด้านบน แต่ใช้กับต้นไม้หมวดหมู่ของ Shopee
     */
    public function bulkMapShopee(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'shopee_category_id', 'shopee_categories', ShopeeCategory::class, 'shopee_category_mapped');
    }

    /**
     * เหมือนกับ bulkMapLazada()/bulkMapShopee() ด้านบน แต่ใช้กับต้นไม้หมวดหมู่ของ
     * TikTok
     */
    public function bulkMapTiktok(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'tiktok_category_id', 'tiktok_categories', TikTokCategory::class, 'tiktok_category_mapped');
    }

    /**
     * เหมือนกับ bulkMapLazada()/bulkMapShopee()/bulkMapTiktok() ด้านบน แต่ใช้
     * กับหมวดหมู่สินค้าของ WooCommerce
     */
    public function bulkMapWoocommerce(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'woocommerce_category_id', 'woocommerce_categories', WooCommerceCategory::class, 'woocommerce_category_mapped');
    }
}
