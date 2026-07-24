<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AttributeTranslation;
use App\Models\Locale;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AttributeController extends Controller
{
    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_grid');

        return Inertia::render('catalog/attributes/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function summary(): JsonResponse
    {
        $groups = AttributeGroup::query()->get(['id', 'code', 'name'])->keyBy('id');

        $attributes = Attribute::query()
            ->with(['families' => function ($query) {
                $query->select(['attribute_families.id', 'attribute_families.code', 'attribute_families.name']);
            }])
            ->orderBy('code')
            ->get(['id', 'code', 'name', 'type']);

        $data = $attributes->map(function (Attribute $attribute) use ($groups) {
            return [
                'id' => $attribute->id,
                'code' => $attribute->code,
                'name' => $attribute->name,
                'type' => $attribute->type,
                'families' => $attribute->families->map(function (AttributeFamily $family) use ($groups) {
                    $group = $groups->get($family->pivot->attribute_group_id);

                    return [
                        'id' => $family->id,
                        'code' => $family->code,
                        'name' => $family->name,
                        'group' => $group ? [
                            'id' => $group->id,
                            'code' => $group->code,
                            'name' => $group->name,
                        ] : null,
                    ];
                })->values(),
            ];
        });

        return response()->json([
            'total_attributes' => $attributes->count(),
            'total_families' => AttributeFamily::count(),
            'total_groups' => AttributeGroup::count(),
            'attributes' => $data,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/attributes/create');
    }

    public function edit(Attribute $attribute): Response
    {
        return Inertia::render('catalog/attributes/edit', [
            'attribute' => $attribute->only([
                'id', 'code', 'name', 'type', 'is_required', 'is_unique',
                'is_locale_based', 'is_ai_translate', 'is_channel_based', 'is_filterable',
            ]),
            'translations' => $attribute->translations()->get()
                ->mapWithKeys(fn (AttributeTranslation $t) => [(string) $t->locale_id => $t->label]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:attributes,code'],
            'name' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'in:text,textarea,price,boolean,select,multiselect,datetime,date,image,gallery,file,checkbox'],
            'is_required' => ['boolean'],
            'is_unique' => ['boolean'],
            'is_locale_based' => ['boolean'],
            'is_ai_translate' => ['boolean'],
            'is_channel_based' => ['boolean'],
            'is_filterable' => ['boolean'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];

        $attribute = Attribute::create([
            ...$validated,
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $validated['code']),
            'is_required' => $request->boolean('is_required'),
            'is_unique' => $request->boolean('is_unique'),
            'is_locale_based' => $request->boolean('is_locale_based'),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'is_channel_based' => $request->boolean('is_channel_based'),
            'is_filterable' => $request->boolean('is_filterable'),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        $this->syncTranslations($attribute, $translations);

        return to_route('catalog.attributes.index')->with('success', 'Attribute created successfully.');
    }

    public function update(Request $request, Attribute $attribute): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:attributes,code,'.$attribute->id],
            'name' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'in:text,textarea,price,boolean,select,multiselect,datetime,date,image,gallery,file,checkbox'],
            'is_required' => ['boolean'],
            'is_unique' => ['boolean'],
            'is_locale_based' => ['boolean'],
            'is_ai_translate' => ['boolean'],
            'is_channel_based' => ['boolean'],
            'is_filterable' => ['boolean'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];

        $attribute->update([
            ...$validated,
            'name' => $this->resolveName($translations, $validated['name'] ?? null, $validated['code']),
            'is_required' => $request->boolean('is_required'),
            'is_unique' => $request->boolean('is_unique'),
            'is_locale_based' => $request->boolean('is_locale_based'),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'is_channel_based' => $request->boolean('is_channel_based'),
            'is_filterable' => $request->boolean('is_filterable'),
            'updated_by' => $request->user()->id,
        ]);

        $this->syncTranslations($attribute, $translations);

        return to_route('catalog.attributes.index')->with('success', 'Attribute updated successfully.');
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

    private function syncTranslations(Attribute $attribute, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeTranslation::where('attribute_id', $attribute->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeTranslation::updateOrCreate(
                ['attribute_id' => $attribute->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }

    public function destroy(Attribute $attribute): RedirectResponse
    {
        $attribute->delete();

        return to_route('catalog.attributes.index')->with('success', 'Attribute deleted successfully.');
    }
}
