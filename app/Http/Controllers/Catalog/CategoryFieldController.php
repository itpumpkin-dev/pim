<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\CategoryField;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CategoryFieldController extends Controller
{
    use HasVersionHistory;


    /**
     * Display a listing of the category fields.
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
            'type' => ['label' => 'Type', 'type' => 'string', 'filterable' => true],
            'is_required' => ['label' => 'Required', 'type' => 'boolean', 'filterable' => true],
            'status' => ['label' => 'Status', 'type' => 'boolean', 'filterable' => true],
        ];

        $query = CategoryField::query()
            ->when($search, function ($query, $search) {
                $query->where('code', 'like', "%{$search}%")
                    ->orWhere('type', 'like', "%{$search}%")
                    ->orWhere('display_section', 'like', "%{$search}%");
            })
            ->orderBy('position')
            ->orderBy('id', 'desc');

        GridManager::applyFilters($query, $filterColumns, $request->input('filters', []));

        $fields = $query->paginate($perPage)->withQueryString();

        return Inertia::render('catalog/categoryFields/index', [
            'fields' => $fields,
            'filters' => $request->only(['search', 'filters']),
            'filterColumns' => $filterColumns,
        ]);
    }

    /**
     * Show the form for creating a new category field.
     */
    public function create(): Response
    {
        return Inertia::render('catalog/categoryFields/create');
    }

    /**
     * Store a newly created category field in storage.
     */
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:category_fields,code'],
            'type' => ['required', 'in:Text,Textarea,Boolean,Select,Multiselect,Datetime,Date,Image,File,Checkbox'],
            'labels' => ['required', 'array'],
            'labels.*' => ['nullable', 'string', 'max:255'],
            'options' => ['nullable', 'array', 'required_if:type,Select,Multiselect'],
            'options.*' => ['string', 'max:255'],
            'is_required' => ['required', 'boolean'],
            'status' => ['required', 'boolean'],
            'position' => ['required', 'integer'],
            'display_section' => ['nullable', 'string', 'max:100'],
        ]);

        CategoryField::create([
            ...$validated,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return to_route('catalog.categoryFields.index')->with('success', 'Category field created successfully.');
    }

    /**
     * Show the form for editing the specified category field.
     */
    public function edit(CategoryField $categoryField): Response
    {
        return Inertia::render('catalog/categoryFields/edit', [
            'field' => $categoryField,
            'canViewHistory' => auth()->user()?->hasPermission('category_fields', 'view_history') ?? false,
        ]);
    }

    public function history(CategoryField $categoryField): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($categoryField)]);
    }

    /**
     * Update the specified category field in storage.
     */
    public function update(Request $request, CategoryField $categoryField): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:category_fields,code,' . $categoryField->id],
            'type' => ['required', 'in:Text,Textarea,Boolean,Select,Multiselect,Datetime,Date,Image,File,Checkbox'],
            'labels' => ['required', 'array'],
            'labels.*' => ['nullable', 'string', 'max:255'],
            'options' => ['nullable', 'array', 'required_if:type,Select,Multiselect'],
            'options.*' => ['string', 'max:255'],
            'is_required' => ['required', 'boolean'],
            'status' => ['required', 'boolean'],
            'position' => ['required', 'integer'],
            'display_section' => ['nullable', 'string', 'max:100'],
        ]);

        $categoryField->update([
            ...$validated,
            'updated_by' => $request->user()?->id,
        ]);

        return to_route('catalog.categoryFields.index')->with('success', 'Category field updated successfully.');
    }

    /**
     * Remove the specified category field from storage.
     */
    public function destroy(CategoryField $categoryField): RedirectResponse
    {
        $categoryField->delete();

        return to_route('catalog.categoryFields.index')->with('success', 'Category field deleted successfully.');
    }
}
