<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\CategoryField;
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

        $fields = CategoryField::query()
            ->when($search, function ($query, $search) {
                $query->where('code', 'like', "%{$search}%")
                    ->orWhere('type', 'like', "%{$search}%")
                    ->orWhere('display_section', 'like', "%{$search}%");
            })
            ->orderBy('position')
            ->orderBy('id', 'desc')
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('catalog/categoryFields/index', [
            'fields' => $fields,
            'filters' => $request->only(['search']),
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
            'type' => ['required', 'in:Text,Textarea,Select'],
            'labels' => ['required', 'array'],
            'labels.*' => ['nullable', 'string', 'max:255'],
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
            'type' => ['required', 'in:Text,Textarea,Select'],
            'labels' => ['required', 'array'],
            'labels.*' => ['nullable', 'string', 'max:255'],
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
