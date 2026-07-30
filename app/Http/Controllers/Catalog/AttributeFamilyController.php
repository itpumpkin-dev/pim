<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeFamilyTranslation;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttributeFamilyController extends Controller
{
    use HasVersionHistory;


    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_family_grid');

        return Inertia::render('catalog/attribute-families/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir', 'filters']),
        ]);
    }

    public function create(): Response
    {
        $groups = AttributeGroup::select('id', 'code')->get();
        $attributes = Attribute::select('id', 'code', 'name', 'type')->get();

        return Inertia::render('catalog/attribute-families/create', [
            'groups' => $groups,
            'attributes' => $attributes,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:attribute_families,code'],
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'group_attributes' => ['nullable', 'array'],
            'group_attributes.*.attribute_id' => ['required', 'exists:attributes,id'],
            'group_attributes.*.attribute_group_id' => ['required', 'exists:attribute_groups,id'],
        ]);

        $translations = $validated['translations'] ?? [];

        $family = AttributeFamily::create([
            'code' => strtolower($validated['code']),
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $validated['code']),
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($family, $translations);

        $newTranslations = $this->currentTranslations($family);
        if (!empty($newTranslations)) {
            AuditLog::record('labels_set', $family, null, $newTranslations);
        }

        if (!empty($validated['group_attributes'])) {
            foreach ($validated['group_attributes'] as $item) {
                FamilyAttribute::create([
                    'family_id' => $family->id,
                    'attribute_id' => $item['attribute_id'],
                    'attribute_group_id' => $item['attribute_group_id'],
                ]);
            }
        }

        $newAssignments = $this->familyAttributesSnapshot($family->id);
        if (!empty($newAssignments)) {
            AuditLog::record('attributes_set', $family, null, ['attributes' => $newAssignments]);
        }

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family created successfully.');
    }

    public function edit(AttributeFamily $attributeFamily): Response
    {
        $groups = AttributeGroup::select('id', 'code')->get();
        $attributes = Attribute::select('id', 'code', 'name', 'type')->get();

        $familyAttributes = FamilyAttribute::with(['attribute', 'attributeGroup'])
            ->where('family_id', $attributeFamily->id)
            ->get();

        return Inertia::render('catalog/attribute-families/edit', [
            'family' => $attributeFamily->only(['id', 'code', 'name']),
            'translations' => $attributeFamily->translations()->get()
                ->mapWithKeys(fn (AttributeFamilyTranslation $t) => [(string) $t->locale_id => $t->label]),
            'groups' => $groups,
            'attributes' => $attributes,
            'familyAttributes' => $familyAttributes,
            'canViewHistory' => auth()->user()?->hasPermission('attribute_families', 'view_history') ?? false,
        ]);
    }

    public function history(AttributeFamily $attributeFamily): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($attributeFamily)]);
    }

    public function update(Request $request, AttributeFamily $attributeFamily): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:attribute_families,code,' . $attributeFamily->id],
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'group_attributes' => ['nullable', 'array'],
            'group_attributes.*.attribute_id' => ['required', 'exists:attributes,id'],
            'group_attributes.*.attribute_group_id' => ['required', 'exists:attribute_groups,id'],
        ]);

        $translations = $validated['translations'] ?? [];
        $oldTranslations = $this->currentTranslations($attributeFamily);
        $oldAssignments = $this->familyAttributesSnapshot($attributeFamily->id);

        $attributeFamily->update([
            'code' => strtolower($validated['code']),
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $validated['code']),
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($attributeFamily, $translations);

        $newTranslations = $this->currentTranslations($attributeFamily);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $attributeFamily, $oldTranslations, $newTranslations);
        }

        // Sync family_attributes pivot relations
        FamilyAttribute::where('family_id', $attributeFamily->id)->delete();

        if (!empty($validated['group_attributes'])) {
            foreach ($validated['group_attributes'] as $item) {
                FamilyAttribute::create([
                    'family_id' => $attributeFamily->id,
                    'attribute_id' => $item['attribute_id'],
                    'attribute_group_id' => $item['attribute_group_id'],
                ]);
            }
        }

        $newAssignments = $this->familyAttributesSnapshot($attributeFamily->id);
        if ($oldAssignments !== $newAssignments) {
            AuditLog::record('attributes_updated', $attributeFamily, ['attributes' => $oldAssignments], ['attributes' => $newAssignments]);
        }

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family updated successfully.');
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

    /**
     * Fresh (uncached) locale_id => label map for the family's current
     * translations — used to snapshot before/after state for audit diffs.
     */
    private function currentTranslations(AttributeFamily $family): array
    {
        return $family->translations()->get()
            ->mapWithKeys(fn (AttributeFamilyTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();
    }

    /**
     * "attributeCode→groupCode" list for a family's current attribute/group
     * assignments — used to snapshot before/after state for audit diffs.
     */
    private function familyAttributesSnapshot(int $familyId): array
    {
        return FamilyAttribute::with(['attribute:id,code', 'attributeGroup:id,code'])
            ->where('family_id', $familyId)
            ->get()
            ->map(fn (FamilyAttribute $fa) => sprintf(
                '%s→%s',
                $fa->attribute->code ?? "attribute_{$fa->attribute_id}",
                $fa->attributeGroup->code ?? "group_{$fa->attribute_group_id}",
            ))
            ->sort()
            ->values()
            ->all();
    }

    private function syncTranslations(AttributeFamily $family, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeFamilyTranslation::where('attribute_family_id', $family->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeFamilyTranslation::updateOrCreate(
                ['attribute_family_id' => $family->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }

    public function destroy(AttributeFamily $attributeFamily): RedirectResponse
    {
        FamilyAttribute::where('family_id', $attributeFamily->id)->delete();
        $attributeFamily->delete();

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family deleted successfully.');
    }
}
