<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\AttributeGroup;
use App\Models\AttributeGroupTranslation;
use App\Models\Locale;
use App\Services\GridManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttributeGroupController extends Controller
{
    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_group_grid');

        return Inertia::render('catalog/attribute-groups/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/attribute-groups/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:attribute_groups,code'],
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];

        $group = AttributeGroup::create([
            'code' => strtolower($validated['code']),
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $validated['code']),
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($group, $translations);

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group created successfully.');
    }

    public function edit(AttributeGroup $attributeGroup): Response
    {
        return Inertia::render('catalog/attribute-groups/edit', [
            'group' => $attributeGroup->only(['id', 'code', 'name']),
            'translations' => $attributeGroup->translations()->get()
                ->mapWithKeys(fn (AttributeGroupTranslation $t) => [(string) $t->locale_id => $t->label]),
        ]);
    }

    public function update(Request $request, AttributeGroup $attributeGroup): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:attribute_groups,code,' . $attributeGroup->id],
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];

        $attributeGroup->update([
            'code' => strtolower($validated['code']),
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $validated['code']),
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($attributeGroup, $translations);

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group updated successfully.');
    }

    private function resolveName(array $translations, ?string $name, string $code): string
    {
        $defaultLocaleId = Locale::where('code', config('app.locale'))->value('id');

        if ($defaultLocaleId !== null && !empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');

        return $firstNonEmpty !== null ? trim($firstNonEmpty) : ($name ?? ucfirst($code));
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
