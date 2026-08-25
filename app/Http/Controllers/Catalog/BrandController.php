<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Jobs\AutoTranslateLabelsJob;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\AuditLog;
use App\Jobs\SyncLazadaBrandsJob;
use App\Jobs\SyncShopeeBrandsJob;
use App\Jobs\SyncTikTokBrandsJob;
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
 * "Brands" is a dedicated, WooCommerce-styled screen over the `pbrand`
 * Attribute's existing AttributeOption rows — not a new taxonomy. A
 * product's brand is stored as `ProductValue.value = AttributeOption.code`
 * (see ProductPresenter::resolveSelectOptionLabels() and the
 * master_products view for the same join), which is what the "Count"
 * column below queries against.
 *
 * Deliberately a separate controller from AttributeOptionController rather
 * than reusing its nested `/attributes/{attribute}/options` routes — this
 * screen's list/search/sort/count shape doesn't fit that generic inline
 * panel, but every translation/audit/code-generation helper below mirrors
 * that controller's proven behavior.
 */
class BrandController extends Controller
{
    private function brandAttribute(): Attribute
    {
        return Attribute::where('code', 'pbrand')->firstOrFail();
    }

    /**
     * value(brand option code) => count of distinct products, for the
     * "products_count" badge on index(). This scans product_values for
     * every load, so it's cached with a short TTL rather than left
     * uncached — a plain TTL rather than event-based invalidation because
     * ProductValue rows for pbrand are written from many places (product
     * create/update, bulk import, marketplace sync), so a few minutes of
     * staleness on a count badge is a safer trade than missing an
     * invalidation call site somewhere.
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

        // Same shape as CategoryController::index()'s platform filter.
        $platformFilter = $request->input('platform');
        $platformColumns = [
            'shopee' => 'shopee_brand_id',
            'woocommerce' => 'woocommerce_brand_id',
            'lazada' => 'lazada_brand_id',
            'tiktok' => 'tiktok_brand_id',
        ];

        $options = AttributeOption::where('attribute_id', $attribute->id)
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('admin_label', 'like', "%{$search}%")
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

        // Brand lists are small (dozens, not thousands) — counting/sorting
        // in PHP after one fetch is simpler and plenty fast, and avoids a
        // SQL-level count subquery for a join that isn't a real Eloquent
        // relation (ProductValue.value = AttributeOption.code, not an FK).
        $counts = $this->brandProductCounts($attribute->id);

        $labelById = $options->pluck('admin_label', 'id');

        $options = $options->map(function (AttributeOption $option) use ($counts, $labelById) {
            $option->products_count = (int) ($counts[$option->code] ?? 0);
            $option->thumbnail_url = AttributeValueFormatter::resolveStorageUrl($option->thumbnail);
            $option->parent_name = $option->parent_id ? ($labelById[$option->parent_id] ?? null) : null;
            $option->mapped_platforms = collect([
                'shopee' => $option->shopee_brand_id,
                'woocommerce' => $option->woocommerce_brand_id,
                'lazada' => $option->lazada_brand_id,
                'tiktok' => $option->tiktok_brand_id,
            ])->filter()->keys()->values()->all();

            return $option;
        });

        $sortableColumns = ['admin_label', 'description', 'slug', 'products_count'];
        $sortField = $request->input('sort');
        $sortDir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        if ($sortField && in_array($sortField, $sortableColumns, true)) {
            $options = $sortDir === 'desc' ? $options->sortByDesc($sortField) : $options->sortBy($sortField);
        } else {
            $options = $options->sortBy('admin_label');
        }
        $options = $options->values();

        $page = (int) $request->input('page', 1);
        $paginated = new LengthAwarePaginator(
            $options->forPage($page, $perPage)->values(),
            $options->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()],
        );

        return Inertia::render('catalog/brands/index', [
            'brands' => $paginated,
            'parentOptions' => $this->parentOptionsList($attribute),
            'attributeId' => $attribute->id,
            'filters' => [
                'search' => $search ?? '',
                'sort' => $sortField ?? '',
                'dir' => $sortField ? $sortDir : '',
                'platform' => $platformFilter ?? '',
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $attribute = $this->brandAttribute();

        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'parent_id' => ['nullable', Rule::exists('attribute_options', 'id')->where('attribute_id', $attribute->id)],
        ]);

        $translations = $validated['translations'] ?? [];
        $adminLabel = $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null);
        $thumbnailPath = $request->hasFile('thumbnail') ? $request->file('thumbnail')->store('brand-thumbnails', 'public') : null;

        $option = CodeGenerator::createWithRetry(
            'attribute_options',
            'option',
            fn ($code) => $attribute->options()->create([
                'code' => $code,
                'parent_id' => $validated['parent_id'] ?? null,
                'admin_label' => $adminLabel,
                'slug' => $validated['slug'] ?? null,
                'description' => $validated['description'] ?? null,
                'thumbnail' => $thumbnailPath,
            ]),
            scope: ['attribute_id' => $attribute->id],
        );

        $this->syncTranslations($option, $translations);
        $this->autoTranslate($attribute, $option, $translations);

        AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($option));

        return back()->with('success', 'Brand added successfully.');
    }

    public function edit(AttributeOption $brand): Response
    {
        $attribute = $this->brandAttribute();
        abort_unless($brand->attribute_id === $attribute->id, 404);

        return Inertia::render('catalog/brands/edit', [
            'brand' => [
                'id' => $brand->id,
                'code' => $brand->code,
                'admin_label' => $brand->getRawOriginal('admin_label'),
                'slug' => $brand->slug,
                'description' => $brand->description,
                'parent_id' => $brand->parent_id,
                'thumbnail_url' => AttributeValueFormatter::resolveStorageUrl($brand->thumbnail),
            ],
            'translations' => $brand->translations->mapWithKeys(fn (AttributeOptionTranslation $t) => [(string) $t->locale_id => $t->label])->all(),
            'parentOptions' => $this->parentOptionsList($attribute, excludeId: $brand->id),
        ]);
    }

    public function update(Request $request, AttributeOption $brand): RedirectResponse
    {
        $attribute = $this->brandAttribute();
        abort_unless($brand->attribute_id === $attribute->id, 404);

        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'parent_id' => [
                'nullable',
                Rule::exists('attribute_options', 'id')->where('attribute_id', $attribute->id),
                Rule::notIn([$brand->id]),
            ],
        ]);

        $translations = $validated['translations'] ?? [];

        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->store('brand-thumbnails', 'public')
            : $brand->thumbnail;

        $oldFields = $this->optionAuditFields($brand);

        $brand->update([
            'parent_id' => $validated['parent_id'] ?? null,
            'admin_label' => $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null),
            'slug' => $validated['slug'] ?? null,
            'description' => $validated['description'] ?? null,
            'thumbnail' => $thumbnailPath,
        ]);

        $this->syncTranslations($brand, $translations);
        $this->autoTranslate($attribute, $brand, $translations);

        $newFields = $this->optionAuditFields($brand);
        if ($oldFields !== $newFields) {
            AuditLog::record('option_updated', $attribute, $oldFields, $newFields);
        }

        return back()->with('success', 'Brand updated successfully.');
    }

    public function destroy(AttributeOption $brand): RedirectResponse
    {
        $attribute = $this->brandAttribute();
        abort_unless($brand->attribute_id === $attribute->id, 404);

        $oldFields = $this->optionAuditFields($brand);
        $brand->delete();

        AuditLog::record('option_deleted', $attribute, $oldFields, null);

        return back()->with('success', 'Brand deleted successfully.');
    }

    // The old marketplaceSync() hub page/method (brands/marketplace-sync.tsx)
    // is gone — its two props (lastSyncedAt/activeSyncJobs) and everything it
    // linked to now live on CategoryController::marketplaceSync() /
    // categories/marketplace-sync.tsx instead.

    /**
     * Queues the local shopee_brands cache refresh rather than running it
     * inline — unlike CategoryController::syncShopeeCategories() (one call,
     * Shopee's whole category tree at once), Shopee's get_brand_list is
     * scoped to one category_id per call, and at least one real mapped
     * category in this shop has 10,000+ brands under it (has_next_page was
     * still true past offset 9950 in a live test), so a full sync is many
     * minutes of network-bound work — far past any web request timeout.
     * SyncShopeeBrandsJob does the actual fetch loop; this just does the
     * fast precondition checks and hands back a JobTracker id for the
     * frontend to poll via shopeeBrandSyncStatus().
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
     * Queues the local lazada_brands cache refresh — SyncLazadaBrandsJob
     * does the actual fetch loop, this just hands back a JobTracker id.
     * Unlike syncShopeeBrands(), there's no "must map categories first"
     * precondition: Lazada's /category/brands/query isn't scoped to any
     * category at all (confirmed live: no category param exists on this
     * endpoint), so the whole 153k+ brand catalog is fetched unconditionally.
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
     * Queues the local tiktok_brands cache refresh — SyncTikTokBrandsJob
     * does the actual fetch loop. Same "no category precondition" shape as
     * Lazada: TikTokClient::getBrands()'s category_id is optional, and
     * omitting it returns the shop's whole brand list — confirmed live,
     * 2026-08-21, that's still 10,000 records for this account, so it's
     * queued rather than synchronous.
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
     * Polled by the marketplace-sync page while a queued sync (Shopee,
     * Lazada, or TikTok) is running — kept scoped to this controller
     * (rather than reusing the generic import/export
     * JobTrackerController::status() route) since this job isn't tied to an
     * ImportConfig/ExportConfig and shouldn't show up mixed into that
     * unrelated jobs list. Generic on job_type rather than a specific
     * platform — was named shopeeBrandSyncStatus() when Shopee was the only
     * queued platform, but the body never actually checked which one, so
     * every other queued platform reuses this unchanged.
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
     * Requests that a still-running sync (Shopee, Lazada, or TikTok) stop —
     * mirrors JobTrackerController::cancel()'s cancel_requested_at
     * signalling, but kept as its own JSON endpoint for the same reason as
     * brandSyncStatus() above. Only takes effect between pages (see each
     * job's progress-flush interval), so the tracker can keep showing
     * 'processing' for a moment after this is called.
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
     * Refreshes the local woocommerce_brands cache — unlike Shopee, this
     * runs synchronously (no JobTracker/queued job): WooCommerce's Product
     * Brands endpoint returns everything in a small number of pages
     * (confirmed live, 2026-08-21: the real store has only 4 brands total),
     * so it's nowhere near the scale that forced SyncShopeeBrandsJob to
     * exist. Mirrors CategoryController::syncWoocommerceCategories() exactly
     * — same do/while-until-a-short-page pagination shape.
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

    // No searchWoocommerceBrands()/WooCommerceBrandPicker,
    // searchLazadaBrands()/LazadaBrandPicker, or searchTiktokBrands()/
    // TikTokBrandPicker anymore — every platform's Brands table now maps in
    // the opposite direction (pick a PIM brand for a given marketplace
    // brand row, via PimBrandPicker → searchPimBrands() below), same as
    // Shopee's was first.

    // No searchMarketplaceBrands()/serializeMarketplaceBrands() anymore —
    // every platform's marketplace-brand-by-name search picker is gone (see
    // the comment above). TikTok's own 19-digit-id-as-string handling
    // (JS's JSON.parse silently rounds anything past Number.MAX_SAFE_INTEGER
    // — confirmed live, 7417026736480880390 becomes 7417026736480881000 once
    // parsed) now lives directly in tiktokBrandsList() below instead.

    public function bulkMapShopeeBrand(Request $request): RedirectResponse|JsonResponse
    {
        return $this->bulkMapMarketplaceBrand($request, 'shopee_brand_id', ShopeeBrand::class, 'brand_shopee_mapped');
    }

    /**
     * Same as syncShopeeBrands() below, but scoped to exactly one Shopee
     * category — the "Sync brand" row action on categories/shopee-mapping.tsx
     * now that category mapping and brand mapping live on the same page (see
     * that page's docblock for why: get_brand_list is category-scoped, so
     * reviewing a category's brands makes the most sense right where you're
     * already looking at that category).
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
     * Shopee brands cached for one category (see ShopeeCategory's
     * "informational, not a real FK" caveat on that column — this lists
     * whatever the most recent sync for that category actually saw), each
     * annotated with whichever PIM brand currently maps to it, if any.
     * Backs the "จับคู่แบรนด์กับ PIM" column on the Shopee Brands detail
     * table on categories/shopee-mapping.tsx (driven by whichever category
     * row is selected above it).
     */
    public function shopeeBrandsForCategory(Request $request, int $shopeeCategoryId): JsonResponse
    {
        $attribute = $this->brandAttribute();

        $search = trim((string) $request->query('search', ''));
        $perPage = (int) $request->query('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        // Paginated, not a single get() — a category's brand list can run
        // into five figures (confirmed live: 12,102 for one real category
        // after the pagination-cursor fix in SyncShopeeBrandsJob started
        // actually reaching all of it). Sending and rendering that many rows
        // at once is what made this table slow to load; the frontend now
        // asks for one page at a time, same as the categories table above it.
        $query = ShopeeBrand::where('category_id', $shopeeCategoryId);

        if ($search !== '') {
            $query->where('name', 'like', "%{$search}%");
        }

        $paginated = $query->orderBy('name')->paginate($perPage)->withQueryString();

        $mappedByBrandId = AttributeOption::where('attribute_id', $attribute->id)
            ->whereIn('shopee_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'admin_label', 'shopee_brand_id'])
            ->keyBy('shopee_brand_id');

        $rows = $paginated->getCollection()->map(fn (ShopeeBrand $brand) => [
            'id' => $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->admin_label]
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
     * Search endpoint backing the PIM brand Autocomplete on both Shopee's
     * and Lazada's Brands tables (categories/shopee-mapping.tsx,
     * categories/lazada-mapping.tsx) — the mirror image of
     * searchTiktokBrands()/searchWoocommerceBrands() below: those search a
     * marketplace's brand cache by name, this searches our own `pbrand`
     * attribute options by name, since those two tables map in the opposite
     * direction (pick a PIM brand for a given marketplace brand row, not the
     * other way around — TikTok/WooCommerce's own brand mapping pages still
     * go the other way).
     */
    public function searchPimBrands(Request $request): JsonResponse
    {
        $attribute = $this->brandAttribute();
        $query = trim((string) $request->query('q', ''));

        $options = AttributeOption::where('attribute_id', $attribute->id)
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($q2) use ($query) {
                    $q2->where('admin_label', 'like', "%{$query}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$query}%"));
                });
            })
            ->orderBy('admin_label')
            ->limit(50)
            ->get(['id', 'admin_label']);

        return response()->json(['data' => $options->map(fn (AttributeOption $o) => ['id' => $o->id, 'name' => $o->admin_label])]);
    }

    /**
     * WooCommerce brands, paginated + searched, each annotated with
     * whichever PIM brand currently maps to it, if any. Backs the Brands
     * table on categories/woocommerce-mapping.tsx — mirrors
     * lazadaBrandsList() exactly. WooCommerce's own brand list is tiny
     * (confirmed live: 4 total for this shop) so pagination barely matters
     * here, but kept for the same shape every other platform's list uses.
     */
    public function woocommerceBrandsList(Request $request): JsonResponse
    {
        $attribute = $this->brandAttribute();

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

        $mappedByBrandId = AttributeOption::where('attribute_id', $attribute->id)
            ->whereIn('woocommerce_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'admin_label', 'woocommerce_brand_id'])
            ->keyBy('woocommerce_brand_id');

        $rows = $paginated->getCollection()->map(fn (WooCommerceBrand $brand) => [
            'id' => $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->admin_label]
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
     * Lazada brands, paginated + searched, each annotated with whichever PIM
     * brand currently maps to it, if any. Backs the "จับคู่กับแบรนด์ PIM"
     * column on the Lazada Brands table on categories/lazada-mapping.tsx —
     * mirrors BrandController::shopeeBrandsForCategory() exactly (row =
     * marketplace brand, PimBrandPicker in the mapping column), just without
     * the category scoping: Lazada's brand catalog isn't category-scoped at
     * all (see syncLazadaBrands()'s docblock), so this can't be driven by a
     * route param — its own search/pagination round trips instead.
     *
     * Row-centric this way (not the old PIM-option-centric shape the now-gone
     * buildBrandMappingData() used to produce) — that shared helper's
     * "browse the PIM brand list, pick a marketplace brand for each" shape
     * read backwards next to Shopee's own Brands table right above it on the
     * same page, which goes the other way around (every platform's Brands
     * table shares this row-centric shape now).
     */
    public function lazadaBrandsList(Request $request): JsonResponse
    {
        $attribute = $this->brandAttribute();

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

        $mappedByBrandId = AttributeOption::where('attribute_id', $attribute->id)
            ->whereIn('lazada_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'admin_label', 'lazada_brand_id'])
            ->keyBy('lazada_brand_id');

        $rows = $paginated->getCollection()->map(fn (LazadaBrand $brand) => [
            'id' => $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->admin_label]
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
     * TikTok brands, paginated + searched, each annotated with whichever PIM
     * brand currently maps to it, if any. Backs the Brands table on
     * categories/tiktok-mapping.tsx — mirrors lazadaBrandsList() exactly
     * (TikTokBrand is flat, no category_id, same as LazadaBrand — see that
     * model's docblock).
     */
    public function tiktokBrandsList(Request $request): JsonResponse
    {
        $attribute = $this->brandAttribute();

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

        // TikTok's own brand ids are large enough (19 digits, confirmed
        // live) that PHP's native int still round-trips them losslessly,
        // but JS's JSON.parse doesn't (confirmed live: 7417026736480880390
        // becomes 7417026736480881000 once parsed) — sent as strings here
        // to dodge that.
        $mappedByBrandId = AttributeOption::where('attribute_id', $attribute->id)
            ->whereIn('tiktok_brand_id', $paginated->getCollection()->pluck('id'))
            ->get(['id', 'admin_label', 'tiktok_brand_id'])
            ->keyBy('tiktok_brand_id');

        $rows = $paginated->getCollection()->map(fn (TikTokBrand $brand) => [
            'id' => (string) $brand->id,
            'name' => $brand->name,
            'mapped' => $mappedByBrandId->has($brand->id)
                ? ['id' => $mappedByBrandId[$brand->id]->id, 'name' => $mappedByBrandId[$brand->id]->admin_label]
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
            'mappings.*.option_id' => [
                'required', 'integer',
                Rule::exists('attribute_options', 'id')->where('attribute_id', $attribute->id),
            ],
            'mappings.*.marketplace_brand_id' => ['nullable', 'integer', Rule::exists($table, 'id')],
        ]);

        $updated = 0;

        foreach ($validated['mappings'] as $mapping) {
            $option = AttributeOption::where('attribute_id', $attribute->id)->find($mapping['option_id']);
            if (! $option) {
                continue;
            }

            // Cast to int before comparing/storing — for TikTok specifically
            // the frontend sends this as a numeric string (see
            // tiktokBrandsList()'s docblock on why), which would never
            // strictly-equal the int PHP/Postgres already returns for this
            // column, making the "already mapped to this value" skip below
            // never fire. PHP's native int is exact for these ids (confirmed
            // live: a 19-digit TikTok id round-trips losslessly), so this is
            // a safe normalization for every platform, not just TikTok — the
            // other 3 already send/receive plain ints today.
            $newId = isset($mapping['marketplace_brand_id']) ? (int) $mapping['marketplace_brand_id'] : null;
            if ($option->{$fkColumn} === $newId) {
                continue;
            }

            $oldId = $option->{$fkColumn};
            $option->update([$fkColumn => $newId]);

            AuditLog::record(
                $auditEvent,
                $attribute,
                ["option#{$option->id}.{$fkColumn}" => $oldId],
                ["option#{$option->id}.{$fkColumn}" => $newId],
            );
            $updated++;
        }

        // The embedded per-category brand picker on categories/shopee-mapping.tsx
        // calls this same endpoint via plain fetch (Accept: application/json)
        // instead of an Inertia visit — it saves one pick at a time inline in a
        // table cell, where a full-page redirect/flash-toast round trip would
        // be jarring. Every other caller is a real Inertia POST (no explicit
        // json Accept header), so this doesn't change their response at all.
        if ($request->wantsJson()) {
            return response()->json(['updated' => $updated]);
        }

        return back()->with('success', "Updated {$updated} brand mapping(s).");
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    private function parentOptionsList(Attribute $attribute, ?int $excludeId = null): array
    {
        return AttributeOption::where('attribute_id', $attribute->id)
            ->when($excludeId, fn ($q, $excludeId) => $q->where('id', '!=', $excludeId))
            ->get(['id', 'admin_label'])
            ->map(fn (AttributeOption $option) => ['id' => $option->id, 'name' => $option->admin_label])
            ->values()
            ->all();
    }

    /**
     * Mirrors AttributeOptionController::optionAuditFields() — same
     * option#{id}.* prefixed shape, extended with the new brand columns so
     * they show up in the parent Attribute's History tab too.
     */
    private function optionAuditFields(AttributeOption $option): array
    {
        $prefix = "option#{$option->id}";

        return collect($option->only(['code', 'admin_label', 'slug', 'description', 'thumbnail', 'parent_id']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }

    /**
     * Copied from AttributeOptionController::resolveAdminLabel() — keeps
     * the raw `admin_label` column in sync with the app's default locale
     * translation, same fallback-through-translations priority.
     */
    private function resolveAdminLabel(array $translations, ?string $adminLabel): ?string
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
     * Copied from AttributeOptionController::autoTranslate() — keyed off
     * the parent (pbrand) attribute's "AI translate" flag, same as every
     * other option under it.
     */
    private function autoTranslate(Attribute $attribute, AttributeOption $option, array $translations): void
    {
        if (! $attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        AutoTranslateLabelsJob::dispatch(
            AttributeOptionTranslation::class,
            'attribute_option_id',
            $option->id,
            $sourceLocaleId,
            $sourceLabel,
        );
    }

    /**
     * Copied from AttributeOptionController::resolveAutoTranslateSource().
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
     * Copied from AttributeOptionController::syncTranslations().
     */
    private function syncTranslations(AttributeOption $option, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeOptionTranslation::where('attribute_option_id', $option->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeOptionTranslation::updateOrCreate(
                ['attribute_option_id' => $option->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
