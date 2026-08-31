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
 * Product Groups (กลุ่มสินค้า) are the leaf level of the shared `categories`
 * tree: a category whose parent is a subcategory, whose parent is a root.
 * They get their own admin page (Category + Subcategory pickers instead of a
 * free tree parent) but are plain `categories` rows, so products, the
 * storefront and imports keep working with no extra mapping. Everything here
 * mirrors CategoryController's translation / auto-translate / thumbnail
 * handling.
 */
class ProductGroupController extends Controller
{
    use HasVersionHistory;

    public function index(Request $request): Response
    {
        $search = $request->input('search');
        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        // The joins to `sub` then `root` (a real root — parent_id null)
        // constrain rows to exactly depth 3, and give us the columns to sort
        // by category → subcategory → name.
        $query = Category::query()
            ->select('categories.*')
            ->join('categories as sub', 'categories.parent_id', '=', 'sub.id')
            ->join('categories as root', 'sub.parent_id', '=', 'root.id')
            ->whereNull('root.parent_id')
            ->with(['parent:id,name,parent_id', 'parent.parent:id,name'])
            ->withCount('products')
            ->when($search, function ($q) use ($search) {
                $q->where(function ($qq) use ($search) {
                    $qq->where('categories.code', 'like', "%{$search}%")
                        ->orWhere('categories.name', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            })
            ->when($request->integer('category') ?: null, fn ($q, $id) => $q->where('root.id', $id))
            ->when($request->integer('subcategory') ?: null, fn ($q, $id) => $q->where('sub.id', $id))
            ->orderBy('root.name')
            ->orderBy('sub.name')
            ->orderBy('categories.name');

        // Marketplace-mapping filter (moved here from the Categories page —
        // mapping is done per product group now). Values: a platform name,
        // 'mapped' (any), 'unmapped' (none).
        $platformColumns = [
            'lazada' => 'categories.lazada_category_id',
            'shopee' => 'categories.shopee_category_id',
            'tiktok' => 'categories.tiktok_category_id',
            'woocommerce' => 'categories.woocommerce_category_id',
        ];
        $platform = $request->input('platform');
        $query->when($platform, function ($q) use ($platform, $platformColumns) {
            if ($platform === 'unmapped') {
                foreach ($platformColumns as $col) {
                    $q->whereNull($col);
                }
            } elseif ($platform === 'mapped') {
                $q->where(function ($qq) use ($platformColumns) {
                    foreach ($platformColumns as $col) {
                        $qq->orWhereNotNull($col);
                    }
                });
            } elseif (isset($platformColumns[$platform])) {
                $q->whereNotNull($platformColumns[$platform]);
            }
        });

        $groups = $query->paginate($perPage)->withQueryString();

        $groups->getCollection()->transform(function (Category $group) {
            $group->thumbnail_url = AttributeValueFormatter::resolveStorageUrl($group->thumbnail);
            $group->subcategory_name = $group->parent?->name;
            $group->category_name = $group->parent?->parent?->name;
            // Marketplace category mapping now lives at this (product group)
            // level — surface which platforms each row is mapped to.
            $group->mapped_platforms = collect([
                'lazada' => $group->lazada_category_id,
                'shopee' => $group->shopee_category_id,
                'tiktok' => $group->tiktok_category_id,
                'woocommerce' => $group->woocommerce_category_id,
            ])->filter()->keys()->values()->all();

            return $group;
        });

        return Inertia::render('catalog/product-groups/index', [
            'groups' => $groups,
            'categories' => Category::whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'filters' => [
                'search' => $request->input('search', ''),
                'category' => $request->integer('category') ?: '',
                'subcategory' => $request->integer('subcategory') ?: '',
                'platform' => $platform ?? '',
            ],
        ]);
    }

    public function create(Request $request): Response
    {
        return Inertia::render('catalog/product-groups/create', [
            'categories' => Category::whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'subcategories' => $this->subcategoryOptions(),
            'defaultCategoryId' => $request->integer('category') ?: null,
            'defaultSubcategoryId' => $request->integer('subcategory') ?: null,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);
        $this->assertSubcategoryUnderCategory($validated['subcategory_id'], $validated['category_id']);

        $translations = $validated['translations'] ?? [];
        $typedCode = trim((string) ($validated['code'] ?? ''));
        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->store('category-thumbnails', 'public')
            : null;

        $attributes = fn (string $code) => [
            'code' => $code,
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $code),
            'parent_id' => $validated['subcategory_id'],
            'thumbnail' => $thumbnailPath,
            'description' => $validated['description'] ?? null,
            'is_active' => $request->boolean('is_active', true),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            ...$this->marketplaceMapping($validated),
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ];

        $group = $typedCode !== ''
            ? Category::create($attributes($typedCode))
            : CodeGenerator::createWithRetry('categories', 'group', fn ($code) => Category::create($attributes($code)));

        $this->syncTranslations($group, $translations);
        $this->autoTranslate($group, $translations);

        $newTranslations = $this->currentTranslations($group);
        if (! empty($newTranslations)) {
            AuditLog::record('labels_set', $group, null, $newTranslations);
        }

        Category::bumpTreeCacheVersion();

        return to_route('catalog.productGroups.index')->with('success', 'Product group created successfully.');
    }

    public function edit(Category $category): Response
    {
        abort_unless($this->isProductGroup($category), 404);

        $category->load([
            'lazadaCategory:id,name,parent_id',
            'shopeeCategory:id,name,name_th,parent_id',
            'tiktokCategory:id,name,name_th,parent_id',
            'woocommerceCategory:id,name,parent_id',
        ]);

        $translations = $this->currentTranslations($category);
        $activeLocaleId = Locale::idForCode(app()->getLocale());
        if ($activeLocaleId && trim((string) ($translations[$activeLocaleId] ?? '')) === '') {
            $rawName = trim((string) $category->getRawOriginal('name'));
            if ($rawName !== '') {
                $translations[$activeLocaleId] = $rawName;
            }
        }

        return Inertia::render('catalog/product-groups/edit', [
            'group' => [
                'id' => $category->id,
                'code' => $category->code,
                'description' => $category->description,
                'is_active' => (bool) $category->is_active,
                'is_ai_translate' => (bool) $category->is_ai_translate,
                'subcategory_id' => $category->parent_id,
                'category_id' => $category->parent?->parent_id,
                'lazada_category_id' => $category->lazada_category_id,
                'lazada_category' => $category->lazadaCategory,
                'shopee_category_id' => $category->shopee_category_id,
                'shopee_category' => $category->shopeeCategory,
                'tiktok_category_id' => $category->tiktok_category_id,
                'tiktok_category' => $category->tiktokCategory,
                'woocommerce_category_id' => $category->woocommerce_category_id,
                'woocommerce_category' => $category->woocommerceCategory,
            ],
            'thumbnailUrl' => AttributeValueFormatter::resolveStorageUrl($category->thumbnail),
            'translations' => $translations,
            'categories' => Category::whereNull('parent_id')->orderBy('name')->get(['id', 'name']),
            'subcategories' => $this->subcategoryOptions(),
            'canViewHistory' => auth()->user()?->hasPermission('product_groups', 'view_history') ?? false,
        ]);
    }

    public function update(Request $request, Category $category): RedirectResponse
    {
        abort_unless($this->isProductGroup($category), 404);

        $validated = $this->validatePayload($request, $category);
        $this->assertSubcategoryUnderCategory($validated['subcategory_id'], $validated['category_id']);

        $translations = $validated['translations'] ?? [];
        $oldTranslations = $this->currentTranslations($category);
        $thumbnailPath = $request->hasFile('thumbnail')
            ? $request->file('thumbnail')->store('category-thumbnails', 'public')
            : $category->thumbnail;

        $category->update([
            // `code` is fixed after creation — never updated here.
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $category->code),
            'parent_id' => $validated['subcategory_id'],
            'thumbnail' => $thumbnailPath,
            'description' => $validated['description'] ?? null,
            'is_active' => $request->boolean('is_active', true),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            ...$this->marketplaceMapping($validated),
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($category, $translations);
        $this->autoTranslate($category, $translations);

        $newTranslations = $this->currentTranslations($category);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $category, $oldTranslations, $newTranslations);
        }

        Category::bumpTreeCacheVersion();

        return to_route('catalog.productGroups.index')->with('success', 'Product group updated successfully.');
    }

    public function destroy(Category $category): RedirectResponse
    {
        abort_unless($this->isProductGroup($category), 404);

        $category->delete();
        Category::bumpTreeCacheVersion();

        return to_route('catalog.productGroups.index')->with('success', 'Product group deleted successfully.');
    }

    public function history(Category $category): JsonResponse
    {
        abort_unless($this->isProductGroup($category), 404);

        return response()->json(['history' => $this->versionHistoryFor($category)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Category $category = null): array
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
            'subcategory_id' => ['required', Rule::exists('categories', 'id')->whereNotNull('parent_id')],
            'lazada_category_id' => ['nullable', 'exists:lazada_categories,id'],
            'shopee_category_id' => ['nullable', 'exists:shopee_categories,id'],
            'tiktok_category_id' => ['nullable', 'exists:tiktok_categories,id'],
            'woocommerce_category_id' => ['nullable', 'exists:woocommerce_categories,id'],
        ];

        // `code` is accepted only when creating — it is fixed afterwards.
        if (!$category) {
            $rules['code'] = ['nullable', 'string', 'max:100', Rule::unique('categories', 'code')];
        }

        return $request->validate($rules);
    }

    /**
     * The four nullable marketplace-category FK columns, pulled from a
     * validated payload — mapping happens at the product-group level.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, int|null>
     */
    private function marketplaceMapping(array $validated): array
    {
        return [
            'lazada_category_id' => $validated['lazada_category_id'] ?? null,
            'shopee_category_id' => $validated['shopee_category_id'] ?? null,
            'tiktok_category_id' => $validated['tiktok_category_id'] ?? null,
            'woocommerce_category_id' => $validated['woocommerce_category_id'] ?? null,
        ];
    }

    private function assertSubcategoryUnderCategory(int $subcategoryId, int $categoryId): void
    {
        $ok = Category::where('id', $subcategoryId)->where('parent_id', $categoryId)->exists();

        abort_unless($ok, 422, 'The selected subcategory does not belong to the selected category.');
    }

    private function isProductGroup(Category $category): bool
    {
        if ($category->parent_id === null) {
            return false;
        }

        // parent must be a subcategory whose own parent is a real root.
        return Category::where('id', $category->parent_id)
            ->whereHas('parent', fn ($q) => $q->whereNull('parent_id'))
            ->exists();
    }

    /**
     * All level-2 categories (id, name, parent_id) for the dependent
     * Category → Subcategory dropdown on the form.
     */
    private function subcategoryOptions()
    {
        return Category::whereNotNull('parent_id')
            ->whereHas('parent', fn ($q) => $q->whereNull('parent_id'))
            ->orderBy('name')
            ->get(['id', 'name', 'parent_id']);
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

        return $name ?? ($code !== null ? ucfirst($code) : 'Product Group');
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
            'product_groups',
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
