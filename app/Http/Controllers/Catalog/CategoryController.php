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
use App\Services\CodeGenerator;
use App\Services\GridManager;
use App\Services\Lazada\LazadaClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CategoryController extends Controller
{
    use HasVersionHistory;


    /**
     * Display a listing of the categories.
     */
    public function index(Request $request): Response
    {
        $search = $request->input('search');

        $perPage = (int) $request->input('per_page', 15);
        if (!in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $filterColumns = [
            'code' => ['label' => 'Code', 'type' => 'string', 'filterable' => true],
            'name' => ['label' => 'Name', 'type' => 'string', 'filterable' => true],
            'description' => ['label' => 'Description', 'type' => 'string', 'filterable' => true],
        ];

        // Fetch categories with their parent to show in list. Counts are
        // surfaced so the delete confirmation can warn about what a delete
        // would actually affect (children get orphaned, product links cascade).
        $query = Category::with('parent')
            ->withCount(['children', 'products'])
            ->when($search, function ($query, $search) {
                $query->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->orderBy('id', 'desc');

        GridManager::applyFilters($query, $filterColumns, $request->input('filters', []));

        $categories = $query->paginate($perPage)->withQueryString();

        return Inertia::render('catalog/categories/index', [
            'categories' => $categories,
            'filters' => $request->only(['search', 'filters']),
            'filterColumns' => $filterColumns,
        ]);
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

        $translations = $validated['translations'] ?? [];

        $category = CodeGenerator::createWithRetry('categories', 'category', fn ($code) => Category::create([
            'code' => $code,
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $code),
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
        if (!empty($newTranslations)) {
            AuditLog::record('labels_set', $category, null, $newTranslations);
        }

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
    private function storeUploadedFields(Request $request, \Illuminate\Support\Collection $categoryFields, array $additionalData, ?Category $existing = null): array
    {
        foreach ($categoryFields as $field) {
            if (!in_array($field->type, ['Image', 'File'], true)) {
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

        return Inertia::render('catalog/categories/edit', [
            'category' => $category->load('lazadaCategory:id,name,parent_id'),
            'translations' => $this->currentTranslations($category),
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
     */
    public function tree(Request $request): JsonResponse
    {
        $excludeId = $request->integer('exclude') ?: null;

        $roots = Category::whereNull('parent_id')->with('recursiveChildren')->orderBy('name')->get();

        $map = function (Category $category) use (&$map, $excludeId) {
            if ($excludeId && $category->id === $excludeId) {
                return null;
            }

            return [
                'id' => $category->id,
                'code' => $category->code,
                'name' => $category->name,
                'children' => $category->recursiveChildren->map($map)->filter()->values(),
            ];
        };

        return response()->json($roots->map($map)->filter()->values());
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
        ];

        foreach ($categoryFields as $field) {
            $fieldKey = "additional_data.{$field->code}";
            $fieldRules = [];

            // A file input can never be pre-filled for privacy/security reasons,
            // so it always renders empty on the edit form — enforcing `required`
            // unconditionally would force a re-upload on every single save.
            // Only require one if there truly isn't a file stored yet.
            $hasExistingFile = in_array($field->type, ['Image', 'File'], true)
                && !empty($category->additional_data[$field->code] ?? null);

            $fieldRules[] = ($field->is_required && !$hasExistingFile) ? 'required' : 'nullable';

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

        $category->update([
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $category->code),
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

        if ($defaultLocaleId !== null && !empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
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
        if (!$category->is_ai_translate) {
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

        return to_route('catalog.categories.index')->with('success', 'Category deleted successfully.');
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
        if (!$account) {
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

            if (!empty($node['children'])) {
                $this->flattenLazadaCategoryNodes($node['children'], $node['category_id'], $rows);
            }
        }
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
}
