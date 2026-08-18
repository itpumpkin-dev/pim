<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Jobs\AutoTranslateLabelsJob;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AttributeTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class AttributeController extends Controller
{
    use HasVersionHistory;


    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_grid');

        // `name` is a language-agnostic fallback column (see Attribute::name()
        // accessor) — what the grid actually displays is each attribute's
        // translated label, which lives in a separate translations table.
        // GridManager's generic search/per-column filter only know how to
        // LIKE-match real columns, so matching by name is handled here
        // instead: attribute_grid.yml's `filters.global` block was removed
        // entirely (GridManager ANDs its own search clause with whatever
        // this closure adds, so a narrower built-in `code`/`type`-only
        // clause would silently absorb — and defeat — the broader one
        // below), and `name` is stripped from the per-column filters input
        // before GridManager sees it, then both are handled below against
        // the fallback column and the translations table.
        $search = $request->input('search');
        $originalFilters = $request->input('filters', []);
        $nameFilter = $originalFilters['name'] ?? null;

        if ($nameFilter !== null && $nameFilter !== '') {
            $request->merge(['filters' => collect($originalFilters)->except('name')->all()]);
        }

        $gridData = $grid->getData($request, function ($query) use ($search, $nameFilter) {
            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('code', 'like', "%{$search}%")
                        ->orWhere('type', 'like', "%{$search}%")
                        ->orWhere('name', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            }

            if ($nameFilter) {
                $query->where(function ($q) use ($nameFilter) {
                    $q->where('name', 'like', "%{$nameFilter}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$nameFilter}%"));
                });
            }
        });

        return Inertia::render('catalog/attributes/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $gridData,
            // Explicit keys, not only() — see ProductController::index() for why
            // an empty array here (vs. object) is a landmine for `filters.sort`.
            'filters' => [
                'search' => $search ?? '',
                'sort' => $request->input('sort', ''),
                'dir' => $request->input('dir', ''),
                'filters' => $originalFilters,
            ],
        ]);
    }

    public function summary(): JsonResponse
    {
        $groups = AttributeGroup::query()->get(['id', 'code', 'name'])->keyBy('id');

        $attributes = Attribute::query()
            ->with(['families' => function ($query) {
                $query->select(['attribute_families.id', 'attribute_families.code', 'attribute_families.name']);
            }])
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'type']);

        $data = $attributes->map(function (Attribute $attribute) use ($groups) {
            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'name' => $attribute->name,
                'type' => $attribute->type,
                'families' => $attribute->families->map(function (AttributeFamily $family) use ($groups) {
                    $group = $groups->get($family->pivot->attribute_group_id);

                    return [
                        'id' => $family->id,
                        'code' => $family->code,
                        'name' => $family->name,
                        'group' => $group ? [
                            'id' => $group->id,
                            'code' => $group->code,
                            'name' => $group->name,
                        ] : null,
                    ];
                })->values(),
            ];
        });

        return response()->json([
            'total_attributes' => $attributes->count(),
            'total_families' => AttributeFamily::count(),
            'total_groups' => AttributeGroup::count(),
            'attributes' => $data,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/attributes/create');
    }

    public function edit(Attribute $attribute): Response
    {
        return Inertia::render('catalog/attributes/edit', [
            'attribute' => $attribute->only([
                'id', 'code', 'name', 'type', 'swatch_type', 'is_required', 'is_unique',
                'is_locale_based', 'is_ai_translate', 'is_channel_based', 'is_filterable',
            ]),
            'translations' => $attribute->translations()->get()
                ->mapWithKeys(fn (AttributeTranslation $t) => [(string) $t->locale_id => $t->label]),
            'options' => $attribute->options()->orderBy('sort_order')->orderBy('id')->get([
                'id', 'attribute_id', 'code', 'admin_label', 'swatch_value', 'sort_order',
            ])->map(fn ($option) => [
                'id' => $option->id,
                'code' => $option->code,
                'admin_label' => $option->admin_label,
                'translations' => $option->translations->mapWithKeys(fn ($t) => [(string) $t->locale_id => $t->label]),
                'swatch_value' => $attribute->swatch_type === 'image' && $option->swatch_value
                    ? Storage::disk('public')->url($option->swatch_value)
                    : $option->swatch_value,
                'sort_order' => $option->sort_order,
            ]),
            'canViewHistory' => auth()->user()?->hasPermission('attributes', 'view_history') ?? false,
        ]);
    }

    public function history(Attribute $attribute): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($attribute)]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'in:text,textarea,price,boolean,select,multiselect,datetime,date,image,gallery,file,checkbox,video'],
            'swatch_type' => ['nullable', 'required_if:type,select,multiselect', 'in:text,color,image'],
            'is_required' => ['boolean'],
            'is_unique' => ['boolean'],
            'is_locale_based' => ['boolean'],
            'is_ai_translate' => ['boolean'],
            'is_channel_based' => ['boolean'],
            'is_filterable' => ['boolean'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];
        $name = $this->resolveName($translations, $validated['name'] ?? null);

        $attribute = CodeGenerator::createWithRetry('attributes', 'attribute', fn ($code) => Attribute::create([
            ...$validated,
            'code' => $code,
            'name' => $name,
            'is_required' => $request->boolean('is_required'),
            'is_unique' => $request->boolean('is_unique'),
            'is_locale_based' => $request->boolean('is_locale_based'),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'is_channel_based' => $request->boolean('is_channel_based'),
            'is_filterable' => $request->boolean('is_filterable'),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]));

        $this->syncTranslations($attribute, $translations);
        $this->autoTranslate($attribute, $translations);

        $newTranslations = $this->currentTranslations($attribute);
        if (!empty($newTranslations)) {
            AuditLog::record('labels_set', $attribute, null, $newTranslations);
        }

        Attribute::bumpCodeMapVersion();

        return to_route('catalog.attributes.index')->with('success', 'Attribute created successfully.');
    }

    public function update(Request $request, Attribute $attribute): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'in:text,textarea,price,boolean,select,multiselect,datetime,date,image,gallery,file,checkbox,video'],
            'swatch_type' => ['nullable', 'required_if:type,select,multiselect', 'in:text,color,image'],
            'is_required' => ['boolean'],
            'is_unique' => ['boolean'],
            'is_locale_based' => ['boolean'],
            'is_ai_translate' => ['boolean'],
            'is_channel_based' => ['boolean'],
            'is_filterable' => ['boolean'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];
        $oldTranslations = $this->currentTranslations($attribute);

        $attribute->update([
            ...$validated,
            'name' => $this->resolveName($translations, $validated['name'] ?? null),
            'is_required' => $request->boolean('is_required'),
            'is_unique' => $request->boolean('is_unique'),
            'is_locale_based' => $request->boolean('is_locale_based'),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'is_channel_based' => $request->boolean('is_channel_based'),
            'is_filterable' => $request->boolean('is_filterable'),
            'updated_by' => $request->user()->id,
        ]);

        $this->syncTranslations($attribute, $translations);
        $this->autoTranslate($attribute, $translations);

        $newTranslations = $this->currentTranslations($attribute);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $attribute, $oldTranslations, $newTranslations);
        }

        return to_route('catalog.attributes.index')->with('success', 'Attribute updated successfully.');
    }

    /**
     * Fresh (uncached) locale_id => label map for the attribute's current
     * translations — used to snapshot before/after state for audit diffs.
     */
    private function currentTranslations(Attribute $attribute): array
    {
        return $attribute->translations()->get()
            ->mapWithKeys(fn (AttributeTranslation $t) => [(string) $t->locale_id => $t->label])
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

        return $name ?? ($code !== null ? ucfirst($code) : 'Attribute');
    }

    /**
     * When "AI translate" is enabled and the default locale's label is
     * filled in, queues a job to pre-fill every other active locale that
     * doesn't already have a translation — kept off the request/response
     * cycle since it's a handful of translation-provider calls, one per
     * missing locale, which is too slow to make Save wait on. Skipped
     * entirely if the default locale's own label is empty, since we'd
     * otherwise have no reliable source text/language to translate from.
     */
    private function autoTranslate(Attribute $attribute, array $translations): void
    {
        if (!$attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        AutoTranslateLabelsJob::dispatch(
            AttributeTranslation::class,
            'attribute_id',
            $attribute->id,
            $sourceLocaleId,
            $sourceLabel,
        );
    }

    /**
     * Picks which locale to translate FROM. Prefers the app's default
     * locale when it was filled in, but falls back to whichever locale
     * actually has a label otherwise — a form submitting only a non-default
     * locale's translation (e.g. an editor working in a locale other than
     * the app default) would otherwise silently skip auto-translation
     * entirely, since nothing was ever in the default locale to begin with.
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

    private function syncTranslations(Attribute $attribute, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeTranslation::where('attribute_id', $attribute->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeTranslation::updateOrCreate(
                ['attribute_id' => $attribute->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }

    public function destroy(Attribute $attribute): RedirectResponse
    {
        $attribute->delete();

        Attribute::bumpCodeMapVersion();

        return to_route('catalog.attributes.index')->with('success', 'Attribute deleted successfully.');
    }
}
