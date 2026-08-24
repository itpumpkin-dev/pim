<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Jobs\AutoTranslateJsonLabelsJob;
use App\Models\CategoryField;
use App\Models\Locale;
use App\Services\CodeGenerator;
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

        GridManager::applyFilters($query, $filterColumns, (array) $request->input('filters', []));

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
            'type' => ['required', 'in:Text,Textarea,Boolean,Select,Multiselect,Datetime,Date,Image,File,Checkbox'],
            'labels' => ['required', 'array'],
            'labels.*' => ['nullable', 'string', 'max:255'],
            'options' => ['nullable', 'array', 'required_if:type,Select,Multiselect'],
            'options.*' => ['string', 'max:255'],
            'is_required' => ['required', 'boolean'],
            'is_ai_translate' => ['nullable', 'boolean'],
            'status' => ['required', 'boolean'],
            'position' => ['required', 'integer'],
            'display_section' => ['nullable', 'string', 'max:100'],
        ]);

        $field = CodeGenerator::createWithRetry('category_fields', 'field', fn ($code) => CategoryField::create([
            ...$validated,
            'code' => $code,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]));

        $this->autoTranslate($field, $validated['labels']);

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
            'type' => ['required', 'in:Text,Textarea,Boolean,Select,Multiselect,Datetime,Date,Image,File,Checkbox'],
            'labels' => ['required', 'array'],
            'labels.*' => ['nullable', 'string', 'max:255'],
            'options' => ['nullable', 'array', 'required_if:type,Select,Multiselect'],
            'options.*' => ['string', 'max:255'],
            'is_required' => ['required', 'boolean'],
            'is_ai_translate' => ['nullable', 'boolean'],
            'status' => ['required', 'boolean'],
            'position' => ['required', 'integer'],
            'display_section' => ['nullable', 'string', 'max:100'],
        ]);

        $categoryField->update([
            ...$validated,
            'updated_by' => $request->user()?->id,
        ]);

        $this->autoTranslate($categoryField, $validated['labels']);

        return to_route('catalog.categoryFields.index')->with('success', 'Category field updated successfully.');
    }

    /**
     * When "AI translate" is enabled, queues a job to pre-fill every other
     * active locale's label that doesn't already have one — same pattern as
     * AttributeController/AttributeOptionController, but writing into the
     * `labels` JSON column instead of a related translations table (see
     * AttributeAutoTranslator::fillMissingJsonColumn()).
     */
    private function autoTranslate(CategoryField $field, array $labels): void
    {
        if (!$field->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($labels);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        AutoTranslateJsonLabelsJob::dispatch(
            CategoryField::class,
            $field->id,
            'labels',
            $sourceLocaleId,
            $sourceLabel,
        );
    }

    /**
     * Picks which locale to translate FROM. Prefers the app's default locale
     * when it was filled in, but falls back to whichever locale actually has
     * a label otherwise — see AttributeController::resolveAutoTranslateSource()
     * for why requiring the default locale specifically silently skips
     * auto-translation for a field filled in only in another language.
     *
     * @param  array<int|string, mixed>  $labels
     * @return array{0: int|null, 1: string}
     */
    private function resolveAutoTranslateSource(array $labels): array
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));
        $defaultLabel = trim((string) ($labels[$defaultLocaleId] ?? ''));

        if ($defaultLocaleId !== null && $defaultLabel !== '') {
            return [$defaultLocaleId, $defaultLabel];
        }

        foreach ($labels as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';
            if ($label !== '') {
                return [(int) $localeId, $label];
            }
        }

        return [null, ''];
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
