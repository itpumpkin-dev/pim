<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\CategoryField;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CategoryController extends Controller
{
    use HasVersionHistory;


    /**
     * Display a listing of the categories.
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
            'name' => ['label' => 'Name', 'type' => 'string', 'filterable' => true],
            'description' => ['label' => 'Description', 'type' => 'string', 'filterable' => true],
        ];

        // Fetch categories with their parent to show in list
        $query = Category::with('parent')
            ->when($search, function ($query, $search) {
                $query->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->orderBy('id', 'desc');

        GridManager::applyFilters($query, $filterColumns, $request->input('filters', []));

        $categories = $query->paginate($perPage)->withQueryString();

        return Inertia::render('catalog/categories/index', [
            'categories' => $categories,
            'filters' => $request->only(['search', 'filters']),
            'filterColumns' => $filterColumns,
        ]);
    }

    /**
     * Show the form for creating a new category.
     */
    public function create(): Response
    {
        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        return Inertia::render('catalog/categories/create', [
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
        $categoryFields = CategoryField::where('status', true)->orderBy('position')->get();

        return Inertia::render('catalog/categories/edit', [
            'category' => $category,
            'categoryFields' => $categoryFields,
            'canViewHistory' => auth()->user()?->hasPermission('categories', 'view_history') ?? false,
        ]);
    }

    public function history(Category $category): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($category)]);
    }

    /**
     * The full category tree, nested — used by the product edit page's
     * multi-select tree picker and the category create/edit page's parent
     * picker. `exclude` (optional) drops that category and its whole
     * subtree, so a category being edited can't be chosen as its own parent.
     */
    public function tree(Request $request): JsonResponse
    {
        $excludeId = $request->integer('exclude') ?: null;

        $roots = Category::whereNull('parent_id')->with('recursiveChildren')->orderBy('name')->get();

        $map = function (Category $category) use (&$map, $excludeId) {
            if ($excludeId && $category->id === $excludeId) {
                return null;
            }

            return [
                'id' => $category->id,
                'code' => $category->code,
                'name' => $category->name,
                'children' => $category->recursiveChildren->map($map)->filter()->values(),
            ];
        };

        return response()->json($roots->map($map)->filter()->values());
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
