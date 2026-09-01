<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\CategoryTranslation;
use App\Models\Locale;
use App\Services\Catalog\AttributeValueFormatter;
use App\Services\CodeGenerator;
use App\Support\TranslationTracking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Subcategories (หมวดหมู่ย่อย) are the middle level of the shared `categories`
 * tree: a category whose parent is a real root (parent_id null). They sit
 * between root Categories and Product Groups (the leaf level), and get their
 * own admin page — a single Category (root) picker instead of a free tree
 * parent — but are plain `categories` rows, so the tree, products, storefront
 * and imports keep working with no extra mapping. Everything here mirrors
 * ProductGroupController's translation / auto-translate / thumbnail handling,
 * one level up.
 */
class SubcategoryController extends Controller
{
    use HasVersionHistory;

    public function index(Request $request): Response
    {
        $search = $request->input('search');
        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        // The join to `root` (a real root — parent_id null) constrains rows to
        // exactly depth 2 and gives us the column to sort by root → name.
        $query = Category::query()
            ->select('categories.*')
            ->join('categories as root', 'categories.parent_id', '=', 'root.id')
            ->whereNull('root.parent_id')
            ->with('parent:id,name,parent_id')
            ->withCount(['children', 'products'])
            ->when($search, function ($q) use ($search) {
                $q->where(function ($qq) use ($search) {
                    $qq->where('categories.code', 'like', "%{$search}%")
                        ->orWhere('categories.name', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            })
            ->when($request->integer('category') ?: null, fn ($q, $id) => $q->where('root.id', $id))
            ->orderBy('root.name')
            ->orderBy('categories.name');

        $subcategories = $query->paginate($perPage)->withQueryString();

        $subcategories->getCollection()->transform(function (Category $sub) {
            $sub->thumbnail_url = AttributeValueFormatter::resolveStorageUrl($sub->thumbnail);
            $sub->category_name = $sub->parent?->name;

            return $sub;
        });

        return Inertia::render('catalog/subcategories/index', [
            'subcategories' => $subcategories,
            'categories' => Category::whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'filters' => [
                'search' => $request->input('search', ''),
                'category' => $request->integer('category') ?: '',
            ],
        ]);
    }

    public function create(Request $request): Response
    {
        return Inertia::render('catalog/subcategories/create', [
            'categories' => Category::whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'defaultCategoryId' => $request->integer('category') ?: null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);

        $translations = $validated['translations'] ?? [];
        $typedCode = trim((string) ($validated['code'] ?? ''));
        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->store('category-thumbnails', 'public')
            : null;

        $attributes = fn (string $code) => [
            'code' => $code,
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $code),
            'parent_id' => $validated['category_id'],
            'thumbnail' => $thumbnailPath,
            'description' => $validated['description'] ?? null,
            'is_active' => $request->boolean('is_active', true),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ];

        $subcategory = $typedCode !== ''
            ? Category::create($attributes($typedCode))
            : CodeGenerator::createWithRetry('categories', 'subcat', fn ($code) => Category::create($attributes($code)));

        $this->syncTranslations($subcategory, $translations);
        $this->autoTranslate($subcategory, $translations);

        $newTranslations = $this->currentTranslations($subcategory);
        if (! empty($newTranslations)) {
            AuditLog::record('labels_set', $subcategory, null, $newTranslations);
        }

        Category::bumpTreeCacheVersion();

        return to_route('catalog.subcategories.index')->with('success', 'Subcategory created successfully.');
    }

    public function edit(Category $subcategory): Response
    {
        abort_unless($this->isSubcategory($subcategory), 404);

        $translations = $this->currentTranslations($subcategory);
        $activeLocaleId = Locale::idForCode(app()->getLocale());
        if ($activeLocaleId && trim((string) ($translations[$activeLocaleId] ?? '')) === '') {
            $rawName = trim((string) $subcategory->getRawOriginal('name'));
            if ($rawName !== '') {
                $translations[$activeLocaleId] = $rawName;
            }
        }

        return Inertia::render('catalog/subcategories/edit', [
            'subcategory' => [
                'id' => $subcategory->id,
                'code' => $subcategory->code,
                'description' => $subcategory->description,
                'is_active' => (bool) $subcategory->is_active,
                'is_ai_translate' => (bool) $subcategory->is_ai_translate,
                'category_id' => $subcategory->parent_id,
            ],
            'thumbnailUrl' => AttributeValueFormatter::resolveStorageUrl($subcategory->thumbnail),
            'translations' => $translations,
            'categories' => Category::whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'canViewHistory' => auth()->user()?->hasPermission('subcategories', 'view_history') ?? false,
        ]);
    }

    public function update(Request $request, Category $subcategory): RedirectResponse
    {
        abort_unless($this->isSubcategory($subcategory), 404);

        $validated = $this->validatePayload($request, $subcategory);

        $translations = $validated['translations'] ?? [];
        $oldTranslations = $this->currentTranslations($subcategory);
        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->store('category-thumbnails', 'public')
            : $subcategory->thumbnail;

        $subcategory->update([
            // `code` is fixed after creation — never updated here.
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $subcategory->code),
            'parent_id' => $validated['category_id'],
            'thumbnail' => $thumbnailPath,
            'description' => $validated['description'] ?? null,
            'is_active' => $request->boolean('is_active', true),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($subcategory, $translations);
        $this->autoTranslate($subcategory, $translations);

        $newTranslations = $this->currentTranslations($subcategory);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $subcategory, $oldTranslations, $newTranslations);
        }

        Category::bumpTreeCacheVersion();

        return to_route('catalog.subcategories.index')->with('success', 'Subcategory updated successfully.');
    }

    public function destroy(Category $subcategory): RedirectResponse
    {
        abort_unless($this->isSubcategory($subcategory), 404);

        $subcategory->delete();
        Category::bumpTreeCacheVersion();

        return to_route('catalog.subcategories.index')->with('success', 'Subcategory deleted successfully.');
    }

    public function history(Category $subcategory): JsonResponse
    {
        abort_unless($this->isSubcategory($subcategory), 404);

        return response()->json(['history' => $this->versionHistoryFor($subcategory)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Category $subcategory = null): array
    {
        $rules = [
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'thumbnail' => ['nullable', 'image', 'max:4096'],
            'is_ai_translate' => ['boolean'],
            'is_active' => ['boolean'],
            'category_id' => ['required', Rule::exists('categories', 'id')->whereNull('parent_id')],
        ];

        // `code` is accepted only when creating — it is fixed afterwards.
        if (! $subcategory) {
            $rules['code'] = ['nullable', 'string', 'max:100', Rule::unique('categories', 'code')];
        }

        return $request->validate($rules);
    }

    /** A category exactly one level below a real root. */
    private function isSubcategory(Category $category): bool
    {
        if ($category->parent_id === null) {
            return false;
        }

        return Category::where('id', $category->parent_id)->whereNull('parent_id')->exists();
    }

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

        return $name ?? ($code !== null ? ucfirst($code) : 'Subcategory');
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

    private function autoTranslate(Category $category, array $translations): void
    {
        if (! $category->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        TranslationTracking::dispatchLabels(
            CategoryTranslation::class,
            'category_id',
            $category->id,
            $sourceLocaleId,
            $sourceLabel,
            'subcategories',
            $category->code,
            auth()->id(),
        );
    }

    /**
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
}
