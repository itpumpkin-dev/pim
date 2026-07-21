<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use App\Services\GridManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttributeFamilyController extends Controller
{
    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_family_grid');

        return Inertia::render('catalog/attribute-families/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
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
            'group_attributes' => ['nullable', 'array'],
            'group_attributes.*.attribute_id' => ['required', 'exists:attributes,id'],
            'group_attributes.*.attribute_group_id' => ['required', 'exists:attribute_groups,id'],
        ]);

        $family = AttributeFamily::create([
            'code' => strtolower($validated['code']),
            'name' => $validated['name'] ?? ucfirst($validated['code']),
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        if (!empty($validated['group_attributes'])) {
            foreach ($validated['group_attributes'] as $item) {
                FamilyAttribute::create([
                    'family_id' => $family->id,
                    'attribute_id' => $item['attribute_id'],
                    'attribute_group_id' => $item['attribute_group_id'],
                ]);
            }
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
            'groups' => $groups,
            'attributes' => $attributes,
            'familyAttributes' => $familyAttributes,
        ]);
    }

    public function update(Request $request, AttributeFamily $attributeFamily): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:attribute_families,code,' . $attributeFamily->id],
            'name' => ['nullable', 'string', 'max:255'],
            'group_attributes' => ['nullable', 'array'],
            'group_attributes.*.attribute_id' => ['required', 'exists:attributes,id'],
            'group_attributes.*.attribute_group_id' => ['required', 'exists:attribute_groups,id'],
        ]);

        $attributeFamily->update([
            'code' => strtolower($validated['code']),
            'name' => $validated['name'] ?? ucfirst($validated['code']),
            'updated_by' => $request->user()?->id,
        ]);

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

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family updated successfully.');
    }

    public function destroy(AttributeFamily $attributeFamily): RedirectResponse
    {
        FamilyAttribute::where('family_id', $attributeFamily->id)->delete();
        $attributeFamily->delete();

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family deleted successfully.');
    }
}
