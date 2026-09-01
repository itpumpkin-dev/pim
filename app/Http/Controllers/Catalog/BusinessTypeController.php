<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\BusinessType;
use App\Services\CodeGenerator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "ประเภทธุรกิจ" (Business Types) master — CRUD over the `business_types`
 * table (name + description + status). Same list / create-page / edit-page
 * shape as the other catalog master screens; `edit_business_types` covers
 * every write. `code` is auto-generated (never shown on the form, same as
 * Brands/Product Groups). Every write also mirrors into the `business_type`
 * attribute's options (see SyncsAttributeOptionMirror), so it drives that
 * dropdown in Edit Product.
 */
class BusinessTypeController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'business_type';
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $sortable = ['name', 'is_active'];
        $sort = in_array($request->input('sort'), $sortable, true) ? $request->input('sort') : 'name';
        $dir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $businessTypes = BusinessType::query()
            ->when($search !== '', function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%");
            })
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('catalog/business-types/index', [
            'businessTypes' => $businessTypes,
            'filters' => [
                'search' => $search,
                'sort' => $sort,
                'dir' => $dir,
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/business-types/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);

        $businessType = CodeGenerator::createWithRetry(
            'business_types',
            'biztype',
            fn ($code) => BusinessType::create([...$validated, 'code' => $code]),
        );

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, $businessType->code, $businessType->name, $businessType->is_active);

        return to_route('catalog.businessTypes.index')->with('success', 'Business type added successfully.');
    }

    public function edit(BusinessType $businessType): Response
    {
        return Inertia::render('catalog/business-types/edit', [
            'businessType' => [
                'id' => $businessType->id,
                'name' => $businessType->name,
                'description' => $businessType->description,
                'is_active' => $businessType->is_active,
            ],
        ]);
    }

    public function update(Request $request, BusinessType $businessType): RedirectResponse
    {
        $businessType->update($this->validatePayload($request, $businessType));

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $businessType->code, $businessType->code, $businessType->name, $businessType->is_active);

        return to_route('catalog.businessTypes.index')->with('success', 'Business type updated successfully.');
    }

    public function destroy(BusinessType $businessType): RedirectResponse
    {
        $businessType->delete();

        $this->removeAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $businessType->code);

        return to_route('catalog.businessTypes.index')->with('success', 'Business type deleted successfully.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?BusinessType $businessType = null): array
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('business_types', 'name')->ignore($businessType?->id),
            ],
            'description' => ['nullable', 'string', 'max:4000'],
            'is_active' => ['boolean'],
        ]);

        $validated['description'] = $request->input('description');
        $validated['is_active'] = $request->boolean('is_active', true);

        return $validated;
    }
}
