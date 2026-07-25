<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\CategoryField;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CategoryController extends Controller
{
    /**
     * Display a listing of the categories.
     */
    public function index(Request $request): Response
    {
        $search = $request->input('search');

        // Fetch categories with their parent to show in list
        $categories = Category::with('parent')
            ->when($search, function ($query, $search) {
                $query->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->orderBy('id', 'desc')
            ->paginate(15)
            ->withQueryString();

        return Inertia::render('catalog/categories/index', [
            'categories' => $categories,
            'filters' => $request->only(['search']),
        ]);
    }

    /**
     * Show the form for creating a new category.
     */
    public function create(): Response
    {
        // Load the flat hierarchical tree options for selection
        $parentCategories = Category::getTreeOptions();
        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        return Inertia::render('catalog/categories/create', [
            'parentCategories' => $parentCategories,
            'categoryFields' => $categoryFields,
        ]);
    }

    /**
     * Store a newly created category in storage.
     */
    public function store(Request $request): RedirectResponse
    {
        $categoryFields = CategoryField::where('status', true)->get();

        $rules = [
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:categories,code'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'parent_id' => ['nullable', 'exists:categories,id'],
            'additional_data' => ['nullable', 'array'],
        ];

        foreach ($categoryFields as $field) {
            $fieldKey = "additional_data.{$field->code}";
            $fieldRules = [];
            $fieldRules[] = $field->is_required ? 'required' : 'nullable';

            if ($field->type === 'Text') {
                $fieldRules[] = 'string';
                $fieldRules[] = 'max:255';
            } elseif ($field->type === 'Textarea') {
                $fieldRules[] = 'string';
            } elseif ($field->type === 'Select') {
                $fieldRules[] = 'string';
            }

            $rules[$fieldKey] = $fieldRules;
        }

        $validated = $request->validate($rules);

        Category::create([
            'code' => $validated['code'],
            'name' => $validated['name'],
            'description' => $validated['description'],
            'parent_id' => $validated['parent_id'],
            'additional_data' => $validated['additional_data'] ?? [],
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return to_route('catalog.categories.index')->with('success', 'Category created successfully.');
    }

    /**
     * Show the form for editing the specified category.
     */
    public function edit(Category $category): Response
    {
        // Prevent selecting itself or its children as parent to avoid cycles
        $parentCategories = Category::getTreeOptions($category->id);
        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        return Inertia::render('catalog/categories/edit', [
            'category' => $category,
            'parentCategories' => $parentCategories,
            'categoryFields' => $categoryFields,
        ]);
    }

    /**
     * Update the specified category in storage.
     */
    public function update(Request $request, Category $category): RedirectResponse
    {
        $categoryFields = CategoryField::where('status', true)->get();

        $rules = [
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:categories,code,' . $category->id],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'parent_id' => ['nullable', 'exists:categories,id', 'different:id'],
            'additional_data' => ['nullable', 'array'],
        ];

        foreach ($categoryFields as $field) {
            $fieldKey = "additional_data.{$field->code}";
            $fieldRules = [];
            $fieldRules[] = $field->is_required ? 'required' : 'nullable';

            if ($field->type === 'Text') {
                $fieldRules[] = 'string';
                $fieldRules[] = 'max:255';
            } elseif ($field->type === 'Textarea') {
                $fieldRules[] = 'string';
            } elseif ($field->type === 'Select') {
                $fieldRules[] = 'string';
            }

            $rules[$fieldKey] = $fieldRules;
        }

        $validated = $request->validate($rules);

        // Explicitly guard against choosing its own descendant as parent
        if ($validated['parent_id']) {
            $descendantIds = [];
            $collectDescendants = function ($cat) use (&$collectDescendants, &$descendantIds) {
                foreach ($cat->children as $child) {
                    $descendantIds[] = $child->id;
                    $collectDescendants($child);
                }
            };
            $collectDescendants($category);

            if (in_array($validated['parent_id'], $descendantIds)) {
                return back()->withErrors(['parent_id' => 'Cannot select a subcategory as parent.']);
            }
        }

        $category->update([
            'code' => $validated['code'],
            'name' => $validated['name'],
            'description' => $validated['description'],
            'parent_id' => $validated['parent_id'],
            'additional_data' => $validated['additional_data'] ?? [],
            'updated_by' => $request->user()?->id,
        ]);

        return to_route('catalog.categories.index')->with('success', 'Category updated successfully.');
    }

    /**
     * Remove the specified category from storage.
     */
    public function destroy(Category $category): RedirectResponse
    {
        // Deleting category will automatically null parent_id on children due to DB constraints
        $category->delete();

        return to_route('catalog.categories.index')->with('success', 'Category deleted successfully.');
    }
}
