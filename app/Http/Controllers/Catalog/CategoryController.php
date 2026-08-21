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
use App\Models\ShopeeCategory;
use App\Models\ShopeeSellerAccount;
use App\Models\TikTokCategory;
use App\Models\TikTokSellerAccount;
use App\Models\WooCommerceCategory;
use App\Services\Catalog\AttributeValueFormatter;
use App\Services\CategoryMatcher;
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
     * WooCommerce's own "Display type" values for a product category —
     * see the categories create/edit pages, which mirror WooCommerce's "Add
     * new category" form. Stored verbatim (not translated/renamed) so this
     * stays directly reusable if a category-push feature is built later.
     */
    private const DISPLAY_TYPES = ['default', 'products', 'subcategories', 'both'];

    /**
     * Display a listing of the categories.
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

        // `name` is a language-agnostic fallback column (see Category::name()
        // accessor) — what the list actually displays is each category's
        // translated label, which lives in a separate translations table.
        // Matching by name against just the raw column would miss almost
        // every search for the name as the user actually sees it, so both
        // the free-text search and the per-column `name` filter also match
        // against the translations table; `name` is stripped from the
        // generic per-column filter pass below so it doesn't additionally
        // (and wrongly) narrow results by the raw column too.
        $originalFilters = $request->input('filters', []);
        $nameFilter = $originalFilters['name'] ?? null;

        // Defaults the list to active categories only — the ~1,086 legacy
        // categories deactivated when the real WooCommerce category list was
        // reconciled in (see the is_active migration) would otherwise
        // dominate this page. Only defaulted when the request sends no
        // `is_active` filter at all (first load / filters cleared); an
        // explicit choice via the filter drawer (including "No", to see
        // inactive ones) always wins. Applied to $originalFilters (not just
        // the query-only $filtersWithoutName below) so the filter drawer's
        // own UI reflects this default as an active "Active: Yes" chip
        // instead of silently filtering with nothing shown as selected.
        if (! array_key_exists('is_active', $originalFilters)) {
            $originalFilters['is_active'] = '1';
        }
        $filtersWithoutName = collect($originalFilters)->except('name')->all();

        // Fetch categories with their parent to show in list. Counts are
        // surfaced so the delete confirmation can warn about what a delete
        // would actually affect (children get orphaned, product links cascade)
        // and so `products_count` can be sorted on below (an aliased
        // withCount() column — Postgres allows referencing a SELECT alias in
        // ORDER BY, unlike HAVING).
        $query = Category::with('parent')
            ->withCount(['children', 'products'])
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

        // "Which marketplace(s) is this mapped to" isn't a literal column —
        // it's derived from 4 nullable FK columns (see mapped_platforms
        // below) — so it can't go through GridManager::applyFilters() like
        // the rest of $filterColumns, which only ever does a plain where()
        // on the filter key as a column name. Handled as its own request
        // input instead, same way BrandController::buildBrandMappingData()
        // handles its 'status' (mapped/unmapped/all) filter outside the
        // generic grid filter system.
        $platformColumns = [
            'lazada' => 'lazada_category_id',
            'shopee' => 'shopee_category_id',
            'tiktok' => 'tiktok_category_id',
            'woocommerce' => 'woocommerce_category_id',
        ];
        $platformFilter = $request->input('platform');
        $query->when($platformFilter, function ($query, $platformFilter) use ($platformColumns) {
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
        });

        GridManager::applyFilters($query, $filterColumns, $filtersWithoutName);

        // Click-a-column-header sort, matching the pattern GridManager's own
        // getData() uses for the YAML-configured grids (Products, ...) —
        // whitelisted rather than passing $request->input('sort') straight
        // into orderBy(), which would let an arbitrary column/expression
        // through. `name` sorts by the raw fallback column (see the
        // `$nameFilter` comment above) rather than the translated label,
        // same limitation the free-text search already accepts for that
        // column pending a real per-locale sort.
        $sortableColumns = ['name', 'description', 'slug', 'products_count'];
        $sortField = $request->input('sort');
        $sortDir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        if ($sortField && in_array($sortField, $sortableColumns, true)) {
            $query->orderBy($sortField, $sortDir);
        } else {
            $query->orderBy('id', 'desc');
        }

        $categories = $query->paginate($perPage)->withQueryString();

        // Raw storage path -> public URL, same resolution the category
        // edit page's thumbnail preview uses (CategoryController::edit()).
        $categories->getCollection()->transform(function (Category $category) {
            $category->thumbnail_url = AttributeValueFormatter::resolveStorageUrl($category->thumbnail);

            // The 4 marketplace FK columns (lazada/shopee/tiktok/woocommerce_
            // category_id) are already on the model — the query above has no
            // select() narrowing — so this is just reading what's there, no
            // extra query. Exposed as which platforms are mapped, not the
            // FK ids themselves, since the list page only needs to show
            // "mapped to X" and doesn't link out to any of those categories.
            $category->mapped_platforms = collect([
                'lazada' => $category->lazada_category_id,
                'shopee' => $category->shopee_category_id,
                'tiktok' => $category->tiktok_category_id,
                'woocommerce' => $category->woocommerce_category_id,
            ])->filter()->keys()->values()->all();

            return $category;
        });

        return Inertia::render('catalog/categories/index', [
            'categories' => $categories,
            'filters' => [
                'search' => $request->input('search', ''),
                'filters' => $originalFilters,
                'sort' => $sortField ?? '',
                'dir' => $sortField ? $sortDir : '',
                'platform' => $platformFilter ?? '',
            ],
            'filterColumns' => $filterColumns,
        ]);
    }

    /**
     * Downloads this app's own category tree as a CSV — same shape/purpose
     * as exportWoocommerceCategories() below, but for our own `categories`
     * table rather than the synced woocommerce_categories cache. Always the
     * full tree, ignoring the list page's current search/filter/sort state
     * (same "export everything" scope exportWoocommerceCategories() uses),
     * since this is meant as a full reference/backup file, not a filtered
     * view export.
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
            // Handles both a locally-uploaded thumbnail (a storage path) and
            // one brought in via importFromWoocommerce() (already an
            // absolute pumpkin.co.th URL) — same resolution used by the
            // list/edit pages' thumbnail preview.
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
     * Show the form for creating a new category.
     */
    public function create(): Response
    {
        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        return Inertia::render('catalog/categories/create', [
            'categoryFields' => $categoryFields,
        ]);
    }

    /**
     * Store a newly created category in storage.
     */
    public function store(Request $request): RedirectResponse
    {
        $categoryFields = CategoryField::where('status', true)->get();

        $rules = [
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'is_ai_translate' => ['boolean'],
            'description' => ['nullable', 'string'],
            'parent_id' => ['nullable', 'exists:categories,id'],
            'lazada_category_id' => ['nullable', 'exists:lazada_categories,id'],
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

        $category = CodeGenerator::createWithRetry('categories', 'category', fn ($code) => Category::create([
            'code' => $code,
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $code),
            'slug' => $validated['slug'] ?? null,
            'display_type' => $validated['display_type'] ?? 'default',
            'thumbnail' => $thumbnailPath,
            'is_active' => $request->boolean('is_active', true),
            'description' => $validated['description'],
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'parent_id' => $validated['parent_id'],
            'lazada_category_id' => $validated['lazada_category_id'] ?? null,
            'additional_data' => $validated['additional_data'],
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]));

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
     * Image/File category fields arrive as raw UploadedFile instances inside
     * `additional_data` (a plain array-cast JSON column) — storing that as-is
     * would serialize to `{}` since UploadedFile has no public properties.
     * Replace each with its stored path; when no new file was uploaded for a
     * given field, fall back to whatever path was already saved on `$existing`
     * (update) or drop the field entirely (create — nothing to fall back to).
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
     * Show the form for editing the specified category.
     */
    public function edit(Category $category): Response
    {
        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        // A category with no CategoryTranslation row at all (e.g. every one
        // created by importFromWoocommerce()/CategoryRowImporter, which only
        // ever write the raw `name` column) would otherwise show an empty
        // Name input for the admin's current locale — even though
        // Category::name()'s own accessor already falls back to that same
        // raw column for display everywhere else. Mirrors that accessor's
        // fallback here too, but only for this page's initial form values —
        // NOT applied to currentTranslations()'s other callers (store()/
        // update()'s before/after audit diff), where injecting a synthetic
        // value would falsely look like a real translation change.
        $translations = $this->currentTranslations($category);
        $activeLocaleId = Locale::idForCode(app()->getLocale());
        if ($activeLocaleId && trim((string) ($translations[$activeLocaleId] ?? '')) === '') {
            $rawName = trim((string) $category->getRawOriginal('name'));
            if ($rawName !== '') {
                $translations[$activeLocaleId] = $rawName;
            }
        }

        return Inertia::render('catalog/categories/edit', [
            'category' => $category->load('lazadaCategory:id,name,parent_id'),
            'thumbnailUrl' => AttributeValueFormatter::resolveStorageUrl($category->thumbnail),
            'translations' => $translations,
            'categoryFields' => $categoryFields,
            'canViewHistory' => auth()->user()?->hasPermission('categories', 'view_history') ?? false,
        ]);
    }

    public function history(Category $category): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($category)]);
    }

    /**
     * The full category tree, nested — used by the product edit page's
     * multi-select tree picker and the category create/edit page's parent
     * picker. `exclude` (optional) drops that category and its whole
     * subtree, so a category being edited can't be chosen as its own parent.
     *
     * Building this from scratch (recursive eager load + per-node `name`
     * resolution across ~1,100 categories) measured ~365ms and a 164KB
     * payload, and the tree picker re-fetches it on every Edit Product page
     * load — so the *unfiltered* tree is cached per locale, keyed by a
     * version bumped in store()/update()/destroy() (see
     * Category::bumpTreeCacheVersion()) whenever the tree's shape or labels
     * could have changed. `exclude` is applied to the cached array
     * afterwards instead of being part of the cache key, since baking it in
     * would fragment the cache into one entry per category ever edited.
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
     * Update the specified category in storage.
     */
    public function update(Request $request, Category $category): RedirectResponse
    {
        $categoryFields = CategoryField::where('status', true)->get();

        $rules = [
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'is_ai_translate' => ['boolean'],
            'description' => ['nullable', 'string'],
            'parent_id' => ['nullable', 'exists:categories,id'],
            'lazada_category_id' => ['nullable', 'exists:lazada_categories,id'],
            'additional_data' => ['nullable', 'array'],
            'slug' => ['nullable', 'string', 'max:255'],
            'display_type' => ['nullable', Rule::in(self::DISPLAY_TYPES)],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'is_active' => ['boolean'],
        ];

        foreach ($categoryFields as $field) {
            $fieldKey = "additional_data.{$field->code}";
            $fieldRules = [];

            // A file input can never be pre-filled for privacy/security reasons,
            // so it always renders empty on the edit form — enforcing `required`
            // unconditionally would force a re-upload on every single save.
            // Only require one if there truly isn't a file stored yet.
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

        // Explicitly guard against choosing itself, or one of its own
        // descendants, as parent — either would create a cycle, and
        // Category::recursiveChildren() has no cycle protection, so a
        // self-referencing row hangs every subsequent tree load.
        if ($validated['parent_id']) {
            if ((int) $validated['parent_id'] === $category->id) {
                return back()->withErrors(['parent_id' => 'A category cannot be its own parent.']);
            }

            // Loaded once via the eager `recursiveChildren` relation instead of
            // walking `children` node-by-node, which fired one query per
            // descendant on every save for any category with a large subtree.
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

        // Same "keep existing unless a new file was uploaded" rule as the
        // Image/File category fields above (storeUploadedFields()) — the
        // input always renders empty on the edit form, so a save with no new
        // thumbnail chosen shouldn't wipe out the one already stored.
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
            'lazada_category_id' => $validated['lazada_category_id'] ?? null,
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
     * Fresh (uncached) locale_id => label map for the category's current
     * translations — used to snapshot before/after state for audit diffs.
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
     * When "AI translate" is enabled, queues a job to pre-fill every other
     * active locale that doesn't already have a translation — same pattern
     * as AttributeController::autoTranslate().
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
     * Picks which locale to translate FROM. Prefers the app's default locale
     * when it was filled in, but falls back to whichever locale actually has
     * a label otherwise — see AttributeController::resolveAutoTranslateSource()
     * for why requiring the default locale specifically silently skips
     * auto-translation for a category named only in another language.
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
     * Remove the specified category from storage.
     */
    public function destroy(Category $category): RedirectResponse
    {
        // Deleting category will automatically null parent_id on children due to DB constraints
        $category->delete();

        Category::bumpTreeCacheVersion();

        return to_route('catalog.categories.index')->with('success', 'Category deleted successfully.');
    }

    /**
     * Marketplace category sync/mapping tab — kept off the category list
     * page since it's a bulk admin action, not something touched during
     * everyday category browsing.
     */
    public function marketplaceSync(): Response
    {
        // ::max() is a raw aggregate query, so it returns the DB driver's
        // plain string instead of an Eloquent-cast Carbon instance — no
        // timezone marker attached. Parse it in the app timezone (UTC)
        // explicitly before serializing, otherwise the frontend's Date
        // parser misreads the naive string as local time.
        $toIso = fn (?string $value) => $value ? Carbon::parse($value, 'UTC')->toISOString() : null;

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
     * Refreshes the local lazada_categories cache from Lazada's live
     * category tree, so the mapping picker doesn't hit their API on every
     * page load. Any active seller account can authenticate this — the
     * tree itself isn't shop-specific.
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
     * Depth-first flatten so parent rows always precede their children in
     * $rows — required because lazada_categories.parent_id is a real FK
     * back onto the same table, checked per row as each upsert chunk runs.
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
     * Refreshes the local shopee_categories cache from Shopee's live
     * category tree (v2.product.get_category) — same purpose as
     * syncLazadaCategories() above. Unlike Lazada, category-tree access on
     * Shopee still requires shop_id + access_token (see ShopeeClient), and
     * shopee_tokens has no is_active column to filter an account by, so any
     * linked shop can authenticate this.
     */
    public function syncShopeeCategories(Request $request): RedirectResponse
    {
        $account = ShopeeSellerAccount::first();
        if (! $account) {
            return back()->with('error', 'No Shopee seller account found to authenticate the sync.');
        }

        $tree = (new ShopeeClient($account))->getCategoryTree();

        $rows = collect($tree['response']['category_list'] ?? [])->map(function (array $node) {
            $parentId = (int) ($node['parent_category_id'] ?? 0);

            return [
                'id' => $node['category_id'],
                'parent_id' => $parentId > 0 ? $parentId : null,
                'name' => $node['display_category_name'] ?? $node['original_category_name'],
                'is_leaf' => ! ($node['has_children'] ?? false),
            ];
        })->all();

        // Shopee returns category_list flat (not nested like Lazada's tree),
        // with no guarantee parents are listed before their children — but
        // shopee_categories.parent_id is a real self-referencing FK, checked
        // per row within each upsert chunk below, so rows must be reordered
        // depth-first first (same requirement as flattenLazadaCategoryNodes()).
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
                ['parent_id', 'name', 'is_leaf', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($ordered).' Shopee categories.');
    }

    /**
     * Refreshes the local tiktok_categories cache from TikTok Shop's live
     * category tree — same purpose as syncLazadaCategories()/
     * syncShopeeCategories() above. TikTok's response is flat like Shopee's
     * (no order guarantee, needs the same depth-first reorder before the
     * upsert) but gives id/parent_id/is_leaf directly per row like Lazada's
     * (no has_children-style derivation needed) — see TikTokClient::
     * getCategoryTree(), whose signing is NOT yet confirmed against a live
     * call (see that class's docblock); this sync will fail until
     * TIKTOK_APP_KEY/TIKTOK_APP_SECRET are set to real values and that's
     * verified.
     */
    public function syncTikTokCategories(Request $request): RedirectResponse
    {
        $account = TikTokSellerAccount::first();
        if (! $account) {
            return back()->with('error', 'No TikTok seller account found to authenticate the sync.');
        }

        $tree = (new TikTokClient($account))->getCategoryTree();

        $rows = collect($tree['data']['categories'] ?? [])->map(fn (array $node) => [
            'id' => $node['id'],
            'parent_id' => ! empty($node['parent_id']) ? $node['parent_id'] : null,
            'name' => $node['local_name'],
            'is_leaf' => (bool) ($node['is_leaf'] ?? false),
        ])->all();

        // Same reordering requirement as syncShopeeCategories() above —
        // tiktok_categories.parent_id is a real self-referencing FK, checked
        // per row within each upsert chunk, but TikTok's flat list gives no
        // guarantee parents precede children.
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
                ['parent_id', 'name', 'is_leaf', 'updated_at']
            );
        }

        return back()->with('success', 'Synced '.count($ordered).' TikTok categories.');
    }

    /**
     * Refreshes the local woocommerce_categories cache from the WooCommerce
     * store's live product categories (GET /wp-json/wc/v3/products/categories)
     * — same purpose as syncLazadaCategories()/syncShopeeCategories()/
     * syncTikTokCategories() above. No seller-account lookup (WooCommerceClient
     * reads config('services.woocommerce') directly — see that class's
     * docblock). Unlike Shopee/TikTok, WooCommerce's response gives no
     * has_children/is_leaf flag at all, so it's computed here: any category
     * id that appears as some other row's `parent` isn't a leaf. Paginated
     * (WooCommerce's own per_page cap is 100), same depth-first reorder as
     * Shopee/TikTok before the upsert since there's no order guarantee across
     * pages either.
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
     * Downloads the locally cached woocommerce_categories table (populated by
     * syncWoocommerceCategories() above) as a CSV — a snapshot of what's
     * actually on the WooCommerce store as of the last sync, not a live
     * re-fetch. Parent is resolved to its name (not just parent_id) so the
     * file is readable on its own without cross-referencing IDs.
     */
    public function exportWoocommerceCategories(): BinaryFileResponse
    {
        $categories = WooCommerceCategory::orderBy('name')->get(['id', 'parent_id', 'name', 'slug', 'description', 'thumbnail_url', 'is_leaf']);
        $nameById = $categories->pluck('name', 'id');

        $rows = $categories->map(fn (WooCommerceCategory $category) => [
            'ID' => $category->id,
            'Name' => $category->name,
            // Readable in this human-facing CSV — see importFromWoocommerce()'s
            // docblock for why WordPress stores a Thai slug percent-encoded.
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
     * Creates/updates real PIM categories from the locally cached
     * woocommerce_categories tree (populated by syncWoocommerceCategories()
     * above) — the reverse of the mapping page: instead of pointing an
     * existing PIM category at a WooCommerce one, this brings WooCommerce's
     * own name/slug/description/thumbnail into the PIM catalog directly.
     *
     * Matching is deliberately conservative: only a PIM category ALREADY
     * mapped (categories.woocommerce_category_id = this row's id — set via
     * the mapping page, or by a previous run of this same import) gets
     * updated. Every unmapped WooCommerce category creates a brand new PIM
     * category rather than guessing a name/slug match — silently merging
     * into a similarly-named existing category would be surprising and hard
     * to undo. A newly created category is immediately mapped, so re-running
     * this later updates it instead of creating a duplicate.
     *
     * Processed root-first (same depth-first walk as
     * syncWoocommerceCategories()) so a child's parent_id always resolves to
     * an already-created/updated PIM category. thumbnail_url is stored
     * as-is (a real pumpkin.co.th URL, not downloaded) — resolveStorageUrl()
     * (see index()/edit() above) already passes absolute URLs through
     * unchanged, so this doesn't need special handling on read.
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
                // WordPress stores a non-Latin (e.g. Thai) term's slug
                // percent-encoded (sanitize_title() urlencodes multi-byte
                // UTF-8 rather than transliterating it) — confirmed live,
                // 2026-08-20: raw values like "%e0%b9%80%e0%b8..." showed up
                // unreadable in the categories list. Decoded here, once, so
                // every read of our own `categories.slug` (list, edit,
                // export) shows real Thai text. woocommerce_categories.slug
                // itself is left encoded — that's WooCommerce's actual raw
                // value, kept faithful in case it's ever needed for a real
                // API call back to them.
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
     * Search endpoint backing the Lazada category Autocomplete on the
     * category edit form — only leaf categories are selectable, since
     * Lazada requires products to be assigned to a leaf, not a parent node.
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
     * Search endpoint backing the Shopee category Autocomplete on the
     * mapping review page — mirrors searchLazadaCategories() above.
     */
    public function searchShopeeCategories(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $categories = ShopeeCategory::where('is_leaf', true)
            ->when($query !== '', fn ($q) => $q->where('name', 'like', "%{$query}%"))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'parent_id']);

        return response()->json(['data' => $categories]);
    }

    /**
     * Search endpoint backing the TikTok category Autocomplete on the
     * mapping review page — mirrors searchLazadaCategories()/
     * searchShopeeCategories() above.
     */
    public function searchTikTokCategories(Request $request): JsonResponse
    {
        $query = trim((string) $request->query('q', ''));

        $categories = TikTokCategory::where('is_leaf', true)
            ->when($query !== '', fn ($q) => $q->where('name', 'like', "%{$query}%"))
            ->orderBy('name')
            ->limit(50)
            ->get(['id', 'name', 'parent_id']);

        return response()->json(['data' => $categories]);
    }

    /**
     * Search endpoint backing the WooCommerce category Autocomplete on the
     * mapping review page — mirrors searchLazadaCategories()/
     * searchShopeeCategories()/searchTikTokCategories() above.
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
     * Lightweight product list for one category — powers the Lazada/Shopee
     * mapping review pages' "which products does this affect" expander, so a
     * still-unmapped category with real products attached (blocking every
     * one of them from being pushed to that platform) can be prioritized
     * over one with none. Not platform-specific — same endpoint for both.
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
     * @return array{0: string, 1: string, 2: int, 3: bool}
     */
    private function parseMappingFilters(Request $request): array
    {
        $status = $request->input('status', 'unmapped');
        if (! in_array($status, ['unmapped', 'mapped', 'all'], true)) {
            $status = 'unmapped';
        }

        $search = trim((string) $request->input('search', ''));

        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $onlyWithProducts = $request->boolean('only_with_products');

        return [$status, $search, $perPage, $onlyWithProducts];
    }

    /**
     * Shared query/scoring logic behind lazadaMapping() and shopeeMapping()
     * — only the marketplace side (which model, FK column, relation) differs
     * between the two; the local-category half (ancestor chains, name
     * resolution, pagination) is identical either way. Suggestions are a
     * ranking aid only (see CategoryMatcher); nothing is persisted here
     * until bulkMapMarketplaceCategory() is called with explicit picks.
     *
     * @param  class-string<LazadaCategory>|class-string<ShopeeCategory>  $marketplaceModel
     * @return array{categories: mixed, stats: array{total: int, mapped: int}}
     */
    private function buildCategoryMappingData(string $status, string $search, int $perPage, bool $onlyWithProducts, string $fkColumn, string $relation, string $marketplaceModel): array
    {
        // Load the whole local tree once (~1,100 rows) so each row's
        // ancestor chain can be resolved in memory regardless of depth,
        // instead of firing one query per row per level.
        $allCategories = Category::query()->without('translations')
            ->get(['id', 'parent_id', 'name', 'additional_data', 'is_active', $fkColumn])
            ->keyBy('id');

        $childParentIds = $allCategories->pluck('parent_id')->filter()->unique();
        $leafIds = $allCategories->reject(fn (Category $c) => $childParentIds->contains($c->id))->pluck('id');

        // Marketplace mapping is only meaningful for categories actually in
        // use — the ~1,086 legacy categories deactivated when the real
        // WooCommerce category list was reconciled in (see the is_active
        // migration) would otherwise flood this page with stale rows nobody
        // needs to map. $leafIds itself stays unfiltered (ancestorNameEngTokens/
        // pathOf below still need to walk through inactive ancestors, if any,
        // to build an accurate path/hint).
        $activeLeafIds = $allCategories->whereIn('id', $leafIds)->where('is_active', true)->pluck('id');

        $nameEngOf = fn (Category $category) => trim((string) ($category->additional_data['name_eng'] ?? '')) ?: $category->name;

        $ancestorNameEngTokens = function (int $id) use ($allCategories, $nameEngOf): array {
            $tokens = [];
            $currentParentId = $allCategories->get($id)?->parent_id;
            while ($currentParentId && $allCategories->has($currentParentId)) {
                $tokens = [...$tokens, ...CategoryMatcher::tokenize($nameEngOf($allCategories->get($currentParentId)))];
                $currentParentId = $allCategories->get($currentParentId)->parent_id;
            }

            return $tokens;
        };

        $pathOf = function (int $id) use ($allCategories): string {
            $names = [];
            $node = $allCategories->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allCategories->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $query = Category::query()->without('translations')
            ->whereIn('id', $activeLeafIds)
            ->withCount('products')
            ->with("{$relation}:id,name,parent_id");

        if ($status === 'unmapped') {
            $query->whereNull($fkColumn);
        } elseif ($status === 'mapped') {
            $query->whereNotNull($fkColumn);
        }

        if ($onlyWithProducts) {
            $query->whereHas('products');
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhereRaw("additional_data->>'name_eng' ILIKE ?", ["%{$search}%"]);
            });
        }

        $paginated = $query->orderBy('id')->paginate($perPage)->withQueryString();

        // Marketplace leaf candidates + their token sets, precomputed once
        // and reused for every row scored on this page.
        $allMarketplace = $marketplaceModel::query()->get(['id', 'parent_id', 'name', 'is_leaf'])->keyBy('id');

        $marketplaceAncestorTokens = function (int $id) use ($allMarketplace): array {
            $tokens = [];
            $currentParentId = $allMarketplace->get($id)?->parent_id;
            while ($currentParentId && $allMarketplace->has($currentParentId)) {
                $tokens = [...$tokens, ...CategoryMatcher::tokenize($allMarketplace->get($currentParentId)->name)];
                $currentParentId = $allMarketplace->get($currentParentId)->parent_id;
            }

            return $tokens;
        };

        $marketplacePathOf = function (int $id) use ($allMarketplace): string {
            $names = [];
            $node = $allMarketplace->get($id);
            while ($node) {
                array_unshift($names, $node->name);
                $node = $node->parent_id ? $allMarketplace->get($node->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        $candidates = $allMarketplace->filter(fn ($c) => $c->is_leaf)
            ->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'path' => $marketplacePathOf($c->id),
                'tokens' => CategoryMatcher::tokenize($c->name),
                'parentTokens' => $marketplaceAncestorTokens($c->id),
            ])
            ->values()
            ->all();

        $rows = $paginated->getCollection()->map(function (Category $category) use ($nameEngOf, $ancestorNameEngTokens, $pathOf, $candidates, $relation) {
            $leafTokens = CategoryMatcher::tokenize($nameEngOf($category));
            $parentTokens = $ancestorNameEngTokens($category->id);

            return [
                'id' => $category->id,
                'code' => $category->code,
                'name' => $category->name,
                'name_eng' => $category->additional_data['name_eng'] ?? null,
                'path' => $pathOf($category->id),
                'current' => $category->{$relation} ? [
                    'id' => $category->{$relation}->id,
                    'name' => $category->{$relation}->name,
                ] : null,
                'products_count' => $category->products_count,
                'suggestions' => CategoryMatcher::suggest($leafTokens, $parentTokens, $candidates),
            ];
        });

        $paginated->setCollection($rows);

        return [
            'categories' => $paginated,
            'stats' => [
                'total' => $activeLeafIds->count(),
                'mapped' => $allCategories->whereIn('id', $activeLeafIds)->whereNotNull($fkColumn)->count(),
            ],
        ];
    }

    /**
     * Bulk review UI for mapping local leaf categories to a Lazada leaf
     * category — the prerequisite LazadaProductSyncService::buildPayload()
     * enforces before any product in that category can be pushed.
     */
    public function lazadaMapping(Request $request): Response
    {
        [$status, $search, $perPage, $onlyWithProducts] = $this->parseMappingFilters($request);

        return Inertia::render('catalog/categories/lazada-mapping', [
            ...$this->buildCategoryMappingData($status, $search, $perPage, $onlyWithProducts, 'lazada_category_id', 'lazadaCategory', LazadaCategory::class),
            'filters' => ['status' => $status, 'search' => $search, 'per_page' => $perPage, 'only_with_products' => $onlyWithProducts],
        ]);
    }

    /**
     * Same bulk review UI as lazadaMapping() above, but against Shopee's
     * category tree — see buildCategoryMappingData().
     */
    public function shopeeMapping(Request $request): Response
    {
        [$status, $search, $perPage, $onlyWithProducts] = $this->parseMappingFilters($request);

        return Inertia::render('catalog/categories/shopee-mapping', [
            ...$this->buildCategoryMappingData($status, $search, $perPage, $onlyWithProducts, 'shopee_category_id', 'shopeeCategory', ShopeeCategory::class),
            'filters' => ['status' => $status, 'search' => $search, 'per_page' => $perPage, 'only_with_products' => $onlyWithProducts],
        ]);
    }

    /**
     * Same bulk review UI as lazadaMapping()/shopeeMapping() above, but
     * against TikTok's category tree — see buildCategoryMappingData().
     */
    public function tiktokMapping(Request $request): Response
    {
        [$status, $search, $perPage, $onlyWithProducts] = $this->parseMappingFilters($request);

        return Inertia::render('catalog/categories/tiktok-mapping', [
            ...$this->buildCategoryMappingData($status, $search, $perPage, $onlyWithProducts, 'tiktok_category_id', 'tiktokCategory', TikTokCategory::class),
            'filters' => ['status' => $status, 'search' => $search, 'per_page' => $perPage, 'only_with_products' => $onlyWithProducts],
        ]);
    }

    /**
     * Same bulk review UI as lazadaMapping()/shopeeMapping()/tiktokMapping()
     * above, but against WooCommerce's product categories — see
     * buildCategoryMappingData().
     */
    public function woocommerceMapping(Request $request): Response
    {
        [$status, $search, $perPage, $onlyWithProducts] = $this->parseMappingFilters($request);

        return Inertia::render('catalog/categories/woocommerce-mapping', [
            ...$this->buildCategoryMappingData($status, $search, $perPage, $onlyWithProducts, 'woocommerce_category_id', 'woocommerceCategory', WooCommerceCategory::class),
            'filters' => ['status' => $status, 'search' => $search, 'per_page' => $perPage, 'only_with_products' => $onlyWithProducts],
        ]);
    }

    /**
     * Shared persistence logic behind bulkMapLazada() and bulkMapShopee() —
     * validates each pick resolves to an actual leaf marketplace category,
     * updates only rows that actually changed, and records an audit entry
     * per change.
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

            // A non-null pick must resolve to an actual leaf category —
            // silently drop anything else. The UI only ever offers leaves,
            // but this guards direct API calls too.
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

        return back()->with('success', "Updated {$updated} category mapping(s).");
    }

    /**
     * Persists explicit picks made on the mapping review page. Each entry is
     * either a chosen leaf Lazada category or an explicit `null` (clear).
     * Rows the user never touched aren't included in the payload at all —
     * see resources/js/pages/catalog/categories/lazada-mapping.tsx.
     */
    public function bulkMapLazada(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'lazada_category_id', 'lazada_categories', LazadaCategory::class, 'lazada_category_mapped');
    }

    /**
     * Same as bulkMapLazada() above, but for Shopee's category tree.
     */
    public function bulkMapShopee(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'shopee_category_id', 'shopee_categories', ShopeeCategory::class, 'shopee_category_mapped');
    }

    /**
     * Same as bulkMapLazada()/bulkMapShopee() above, but for TikTok's
     * category tree.
     */
    public function bulkMapTiktok(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'tiktok_category_id', 'tiktok_categories', TikTokCategory::class, 'tiktok_category_mapped');
    }

    /**
     * Same as bulkMapLazada()/bulkMapShopee()/bulkMapTiktok() above, but for
     * WooCommerce's product categories.
     */
    public function bulkMapWoocommerce(Request $request): RedirectResponse
    {
        return $this->bulkMapMarketplaceCategory($request, 'woocommerce_category_id', 'woocommerce_categories', WooCommerceCategory::class, 'woocommerce_category_mapped');
    }
}
