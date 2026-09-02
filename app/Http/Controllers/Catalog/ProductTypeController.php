<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\ProductType;
use App\Services\CodeGenerator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "ประเภทสินค้า" (Product Types) master — CRUD over the `product_types`
 * table (name + description + status). Same list / create-page / edit-page
 * shape as the other catalog master screens; `edit_product_types` covers
 * every write. `code` is auto-generated (never shown on the form, same as
 * Brands/Product Groups) — except the 7 rows seeded by the creating
 * migration, whose codes were set to match the `producttype` attribute's
 * pre-existing option codes exactly (see that migration's docblock). Every
 * write also mirrors into the `producttype` attribute's options via
 * `attributes.master_source` (see MasterAttributeOptionSync, wired up in
 * AppServiceProvider) — SyncsAttributeOptionMirror below is a legacy no-op
 * kept only for consistency with the other master controllers.
 */
class ProductTypeController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'producttype';

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

        $productTypes = ProductType::query()
            ->when($search !== '', function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")->orWhere('description', 'like', "%{$search}%");
            })
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('catalog/product-types/index', [
            'productTypes' => $productTypes,
            'filters' => [
                'search' => $search,
                'sort' => $sort,
                'dir' => $dir,
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/product-types/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);

        $productType = CodeGenerator::createWithRetry(
            'product_types',
            'ptype',
            fn ($code) => ProductType::create([...$validated, 'code' => $code]),
        );

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, $productType->code, $productType->name, $productType->is_active);

        return to_route('catalog.productTypes.index')->with('success', 'Product type added successfully.');
    }

    public function edit(ProductType $productType): Response
    {
        return Inertia::render('catalog/product-types/edit', [
            'productType' => [
                'id' => $productType->id,
                'name' => $productType->name,
                'description' => $productType->description,
                'is_active' => $productType->is_active,
            ],
        ]);
    }

    public function update(Request $request, ProductType $productType): RedirectResponse
    {
        $productType->update($this->validatePayload($request, $productType));

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $productType->code, $productType->code, $productType->name, $productType->is_active);

        return to_route('catalog.productTypes.index')->with('success', 'Product type updated successfully.');
    }

    public function destroy(ProductType $productType): RedirectResponse
    {
        $productType->delete();

        $this->removeAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $productType->code);

        return to_route('catalog.productTypes.index')->with('success', 'Product type deleted successfully.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?ProductType $productType = null): array
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('product_types', 'name')->ignore($productType?->id),
            ],
            'description' => ['nullable', 'string', 'max:4000'],
            'is_active' => ['boolean'],
        ]);

        $validated['description'] = $request->input('description');
        $validated['is_active'] = $request->boolean('is_active', true);

        return $validated;
    }
}
