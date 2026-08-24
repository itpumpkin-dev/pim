<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\AttributeGroup;
use App\Models\AttributeGroupTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttributeGroupController extends Controller
{
    use HasVersionHistory;


    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_group_grid');

        // `name` is a language-agnostic fallback column (see
        // AttributeGroup::name() accessor) — what the grid actually
        // displays is each group's translated label, which lives in a
        // separate translations table. GridManager's generic search/
        // per-column filter only know how to LIKE-match real columns, so
        // matching by name is handled here instead: attribute_group_grid.yml's
        // `filters.global` block was removed entirely (GridManager ANDs its
        // own search clause with whatever this closure adds, so a narrower
        // built-in `code`-only clause would silently absorb — and defeat —
        // the broader one below), and `name` is stripped from the per-column
        // filters input before GridManager sees it, then both are handled
        // below against the fallback column and the translations table.
        $search = $request->input('search');
        // (array) cast — see GridManager::getData()'s comment: an empty
        // `?filters=` query param arrives here as a literal null.
        $originalFilters = (array) $request->input('filters', []);
        $nameFilter = $originalFilters['name'] ?? null;

        if ($nameFilter !== null && $nameFilter !== '') {
            $request->merge(['filters' => collect($originalFilters)->except('name')->all()]);
        }

        $gridData = $grid->getData($request, function ($query) use ($search, $nameFilter) {
            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('code', 'like', "%{$search}%")
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

        return Inertia::render('catalog/attribute-groups/index', [
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

    public function create(): Response
    {
        return Inertia::render('catalog/attribute-groups/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];
        $name = $this->resolveName($translations, $validated['name'] ?? null);

        $group = CodeGenerator::createWithRetry('attribute_groups', 'group', fn ($code) => AttributeGroup::create([
            'code' => $code,
            'name' => $name,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]));

        $this->syncTranslations($group, $translations);

        $newTranslations = $this->currentTranslations($group);
        if (!empty($newTranslations)) {
            AuditLog::record('labels_set', $group, null, $newTranslations);
        }

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group created successfully.');
    }

    public function edit(AttributeGroup $attributeGroup): Response
    {
        return Inertia::render('catalog/attribute-groups/edit', [
            'group' => $attributeGroup->only(['id', 'code', 'name']),
            'translations' => $attributeGroup->translations()->get()
                ->mapWithKeys(fn (AttributeGroupTranslation $t) => [(string) $t->locale_id => $t->label]),
            'canViewHistory' => auth()->user()?->hasPermission('attribute_groups', 'view_history') ?? false,
        ]);
    }

    public function history(AttributeGroup $attributeGroup): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($attributeGroup)]);
    }

    public function update(Request $request, AttributeGroup $attributeGroup): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];
        $oldTranslations = $this->currentTranslations($attributeGroup);

        $attributeGroup->update([
            'name' => $this->resolveName($translations, $validated['name'] ?? null),
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($attributeGroup, $translations);

        $newTranslations = $this->currentTranslations($attributeGroup);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $attributeGroup, $oldTranslations, $newTranslations);
        }

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group updated successfully.');
    }

    /**
     * Fresh (uncached) locale_id => label map for the group's current
     * translations — used to snapshot before/after state for audit diffs.
     */
    private function currentTranslations(AttributeGroup $group): array
    {
        return $group->translations()->get()
            ->mapWithKeys(fn (AttributeGroupTranslation $t) => [(string) $t->locale_id => $t->label])
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

        return $name ?? ($code !== null ? ucfirst($code) : 'Attribute Group');
    }

    private function syncTranslations(AttributeGroup $group, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeGroupTranslation::where('attribute_group_id', $group->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeGroupTranslation::updateOrCreate(
                ['attribute_group_id' => $group->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }

    public function destroy(AttributeGroup $attributeGroup): RedirectResponse
    {
        $attributeGroup->delete();

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group deleted successfully.');
    }
}
