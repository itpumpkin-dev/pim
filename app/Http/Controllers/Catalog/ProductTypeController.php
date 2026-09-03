<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Locale;
use App\Models\ProductType;
use App\Models\ProductTypeTranslation;
use App\Services\CodeGenerator;
use App\Support\TranslationTracking;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
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
 *
 * `name` มีคำแปลหลายภาษาจริงแล้ว (ดู ProductTypeTranslation / migration
 * create_product_type_translations_table) — ฟอร์มรับ `translations` (array
 * locale_id => label) แบบเดียวกับ BaseUnitController/BrandController แทนที่
 * จะเป็นช่อง `name` เดี่ยวๆ เหมือนเดิม คอลัมน์ `name` ยังคงเก็บชื่อของ locale
 * เริ่มต้นของแอปไว้เป็น fallback (ที่อื่นในระบบยังอ้างอิงคอลัมน์นี้ตรงๆ อยู่)
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
        $translations = $validated['translations'];

        $productType = CodeGenerator::createWithRetry(
            'product_types',
            'ptype',
            fn ($code) => ProductType::create([
                'code' => $code,
                'name' => $validated['name'],
                'description' => $validated['description'],
                'is_active' => $validated['is_active'],
            ]),
        );

        $this->syncTranslations($productType, $translations);
        $this->autoTranslate($productType, $translations);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, $productType->code, $productType->name, $productType->is_active);

        return to_route('catalog.productTypes.index')->with('success', 'Product type added successfully.');
    }

    public function edit(ProductType $productType): Response
    {
        $translations = $productType->translations
            ->mapWithKeys(fn (ProductTypeTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();

        return Inertia::render('catalog/product-types/edit', [
            'productType' => [
                'id' => $productType->id,
                'name' => $productType->name,
                'description' => $productType->description,
                'is_active' => $productType->is_active,
            ],
            'translations' => $translations,
        ]);
    }

    public function update(Request $request, ProductType $productType): RedirectResponse
    {
        $validated = $this->validatePayload($request, $productType);
        $translations = $validated['translations'];

        $productType->update([
            'name' => $validated['name'],
            'description' => $validated['description'],
            'is_active' => $validated['is_active'],
        ]);

        $this->syncTranslations($productType, $translations);
        $this->autoTranslate($productType, $translations);

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
     * ตรวจ translations ก่อน (ต้องมีอย่างน้อยหนึ่งภาษาไม่ว่างเปล่า) แล้วค่อย
     * resolve เป็น `name` เดี่ยวๆ (ของ locale เริ่มต้นของแอป) เพื่อเช็ค unique
     * กับ product_types.name ต่อ — ต้องทำเป็น 2 ขั้นแบบนี้เพราะฟอร์มไม่ได้ส่ง
     * `name` มาตรงๆ อีกต่อไป (ส่งเป็น translations array แทน)
     *
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?ProductType $productType = null): array
    {
        $validated = $request->validate([
            'translations' => ['required', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:4000'],
            'is_active' => ['boolean'],
        ]);

        $translations = $validated['translations'];
        $name = $this->resolveName($translations);

        Validator::make(
            ['translations' => $name],
            ['translations' => ['required', 'string', 'max:255', Rule::unique('product_types', 'name')->ignore($productType?->id)]],
        )->validate();

        return [
            'name' => $name,
            'translations' => $translations,
            'description' => $request->input('description'),
            'is_active' => $request->boolean('is_active', true),
        ];
    }

    /**
     * คัดลอกมาจาก BaseUnitController::resolveName() — ทำให้คอลัมน์ `name`
     * ตรงกับคำแปลของ locale เริ่มต้นของแอปเสมอ
     */
    private function resolveName(array $translations): ?string
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));

        if ($defaultLocaleId !== null && ! empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');

        return $firstNonEmpty !== null ? trim($firstNonEmpty) : null;
    }

    /**
     * คัดลอกมาจาก BaseUnitController::autoTranslate() — ยึดตามแฟล็ก
     * "AI translate" ของ attribute แม่ (producttype) เหมือนกับ master อื่นๆ
     * ที่มีคำแปลหลายภาษา
     */
    private function autoTranslate(ProductType $productType, array $translations): void
    {
        $attribute = Attribute::where('code', self::MIRROR_ATTRIBUTE)->first();
        if (! $attribute || ! $attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        TranslationTracking::dispatchLabels(
            ProductTypeTranslation::class,
            'product_type_id',
            $productType->id,
            $sourceLocaleId,
            $sourceLabel,
            'product-types',
            $productType->code,
            auth()->id(),
        );
    }

    /**
     * คัดลอกมาจาก BaseUnitController::resolveAutoTranslateSource()
     *
     * @param  array<int|string, mixed>  $translations
     * @return array{0: int|null, 1: string}
     */
    private function resolveAutoTranslateSource(array $translations): array
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));
        $defaultLabel = trim((string) ($translations[$defaultLocaleId] ?? ''));

        if ($defaultLocaleId !== null && $defaultLabel !== '') {
            return [$defaultLocaleId, $defaultLabel];
        }

        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';
            if ($label !== '') {
                return [(int) $localeId, $label];
            }
        }

        return [null, ''];
    }

    /**
     * คัดลอกมาจาก BaseUnitController::syncTranslations()
     */
    private function syncTranslations(ProductType $productType, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                ProductTypeTranslation::where('product_type_id', $productType->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            ProductTypeTranslation::updateOrCreate(
                ['product_type_id' => $productType->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
