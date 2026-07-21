<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\AttributeGroup;
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
        ]);

        AttributeGroup::create([
            'code' => strtolower($validated['code']),
            'name' => $validated['name'] ?? ucfirst($validated['code']),
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group created successfully.');
    }

    public function edit(AttributeGroup $attributeGroup): Response
    {
        return Inertia::render('catalog/attribute-groups/edit', [
            'group' => $attributeGroup->only(['id', 'code', 'name']),
        ]);
    }

    public function update(Request $request, AttributeGroup $attributeGroup): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:attribute_groups,code,' . $attributeGroup->id],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $attributeGroup->update([
            'code' => strtolower($validated['code']),
            'name' => $validated['name'] ?? ucfirst($validated['code']),
            'updated_by' => $request->user()?->id,
        ]);

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group updated successfully.');
    }

    public function destroy(AttributeGroup $attributeGroup): RedirectResponse
    {
        $attributeGroup->delete();

        return to_route('catalog.attributeGroups.index')->with('success', 'Attribute Group deleted successfully.');
    }
}
