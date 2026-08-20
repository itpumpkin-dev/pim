<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Jobs\AutoTranslateLabelsJob;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Models\ProductValue;
use App\Services\CodeGenerator;
use App\Services\Catalog\AttributeValueFormatter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
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

    public function index(Request $request): Response
    {
        $attribute = $this->brandAttribute();

        $search = $request->input('search');
        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $options = AttributeOption::where('attribute_id', $attribute->id)
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('admin_label', 'like', "%{$search}%")
                        ->orWhere('slug', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            })
            ->get();

        // Brand lists are small (dozens, not thousands) — counting/sorting
        // in PHP after one fetch is simpler and plenty fast, and avoids a
        // SQL-level count subquery for a join that isn't a real Eloquent
        // relation (ProductValue.value = AttributeOption.code, not an FK).
        $counts = ProductValue::where('attribute_id', $attribute->id)
            ->whereNull('channel_id')
            ->whereNull('locale_id')
            ->select('value', DB::raw('count(distinct product_id) as cnt'))
            ->groupBy('value')
            ->pluck('cnt', 'value');

        $labelById = $options->pluck('admin_label', 'id');

        $options = $options->map(function (AttributeOption $option) use ($counts, $labelById) {
            $option->products_count = (int) ($counts[$option->code] ?? 0);
            $option->thumbnail_url = AttributeValueFormatter::resolveStorageUrl($option->thumbnail);
            $option->parent_name = $option->parent_id ? ($labelById[$option->parent_id] ?? null) : null;

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
