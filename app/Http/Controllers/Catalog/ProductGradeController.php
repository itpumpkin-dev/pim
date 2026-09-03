<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Catalog\Concerns\SyncsAttributeOptionMirror;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Locale;
use App\Models\ProductGrade;
use App\Models\ProductGradeTranslation;
use App\Support\TranslationTracking;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "เกรดสินค้า" (Product Grades) master — CRUD over the `product_grades` table
 * (code + name + description + validity period + status). Same list /
 * create-page / edit-page shape as the other catalog master screens;
 * `edit_product_grades` covers every write. Unlike Business Types/Product
 * Types (auto-generated code), `code` is typed by the admin directly — same
 * reasoning as Currency: grades are a short, meaningful, small fixed set
 * (A/B/C/Z) rather than an open-ended list, so a generated hash-like code
 * would be actively unhelpful here. Every write also mirrors into the
 * `grade` attribute's options (see SyncsAttributeOptionMirror), so it drives
 * that dropdown in Edit Product.
 *
 * `name` มีคำแปลหลายภาษาจริงแล้ว (ดู ProductGradeTranslation / migration
 * create_product_grade_translations_table) — ฟอร์มรับ `translations` (array
 * locale_id => label) แบบเดียวกับ BaseUnitController/BrandController แทนที่
 * จะเป็นช่อง `name` เดี่ยวๆ คอลัมน์ `name` ยังคงเก็บชื่อของ locale เริ่มต้นของ
 * แอปไว้เป็น fallback
 *
 * `start_date`/`end_date` ("ช่วงเวลา") ตรวจแบบเดียวกับ CommissionGroupController
 * (nullable date, end >= start) — เผื่อไว้สำหรับอนาคต ยังไม่มี logic ไหนอ่าน/
 * บังคับใช้ค่านี้จริงจัง (ดู docblock ของ migration create_product_grades_table)
 */
class ProductGradeController extends Controller
{
    use SyncsAttributeOptionMirror;

    private const MIRROR_ATTRIBUTE = 'grade';

    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));

        $sortable = ['code', 'name', 'is_active'];
        $sort = in_array($request->input('sort'), $sortable, true) ? $request->input('sort') : 'code';
        $dir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $productGrades = ProductGrade::query()
            ->when($search !== '', function ($q) use ($search) {
                $q->where('code', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            })
            ->orderBy($sort, $dir)
            ->paginate($perPage)
            ->withQueryString();

        return Inertia::render('catalog/product-grades/index', [
            'productGrades' => $productGrades,
            'filters' => [
                'search' => $search,
                'sort' => $sort,
                'dir' => $dir,
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/product-grades/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $this->validatePayload($request);
        $translations = $validated['translations'];
        unset($validated['translations']);

        $productGrade = ProductGrade::create(['name' => $this->resolveName($translations)] + $validated);

        $this->syncTranslations($productGrade, $translations);
        $this->autoTranslate($productGrade, $translations);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, null, strtolower($productGrade->code), $productGrade->name, $productGrade->is_active);

        return to_route('catalog.productGrades.index')->with('success', 'Product grade added successfully.');
    }

    public function edit(ProductGrade $productGrade): Response
    {
        $translations = $productGrade->translations
            ->mapWithKeys(fn (ProductGradeTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();

        return Inertia::render('catalog/product-grades/edit', [
            'productGrade' => [
                'id' => $productGrade->id,
                'code' => $productGrade->code,
                'name' => $productGrade->name,
                'description' => $productGrade->description,
                'start_date' => $productGrade->start_date?->format('Y-m-d'),
                'end_date' => $productGrade->end_date?->format('Y-m-d'),
                'is_active' => $productGrade->is_active,
            ],
            'translations' => $translations,
        ]);
    }

    public function update(Request $request, ProductGrade $productGrade): RedirectResponse
    {
        $oldCode = strtolower($productGrade->code);

        $validated = $this->validatePayload($request, $productGrade);
        $translations = $validated['translations'];
        unset($validated['translations']);

        $productGrade->update(['name' => $this->resolveName($translations) ?? $productGrade->name] + $validated);

        $this->syncTranslations($productGrade, $translations);
        $this->autoTranslate($productGrade, $translations);

        $this->syncAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $oldCode, strtolower($productGrade->code), $productGrade->name, $productGrade->is_active);

        return to_route('catalog.productGrades.index')->with('success', 'Product grade updated successfully.');
    }

    public function destroy(ProductGrade $productGrade): RedirectResponse
    {
        $code = strtolower($productGrade->code);

        $productGrade->delete();

        $this->removeAttributeOptionMirror(self::MIRROR_ATTRIBUTE, $code);

        return to_route('catalog.productGrades.index')->with('success', 'Product grade deleted successfully.');
    }

    /**
     * ตรวจ translations ก่อน (ต้องมีอย่างน้อยหนึ่งภาษาไม่ว่างเปล่า) แล้วค่อย
     * resolve เป็น `name` เดี่ยวๆ (ของ locale เริ่มต้นของแอป) เพื่อเช็ค unique
     * กับ product_grades.name ต่อ — ต้องทำเป็น 2 ขั้นแบบนี้เพราะฟอร์มไม่ได้ส่ง
     * `name` มาตรงๆ อีกต่อไป (ส่งเป็น translations array แทน)
     *
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?ProductGrade $productGrade = null): array
    {
        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:20',
                Rule::unique('product_grades', 'code')->ignore($productGrade?->id),
            ],
            'translations' => ['required', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:4000'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'is_active' => ['boolean'],
        ]);

        $translations = $validated['translations'];
        $name = $this->resolveName($translations);

        Validator::make(
            ['translations' => $name],
            ['translations' => ['required', 'string', 'max:255', Rule::unique('product_grades', 'name')->ignore($productGrade?->id)]],
        )->validate();

        return [
            'code' => $validated['code'],
            'name' => $name,
            'translations' => $translations,
            'description' => $request->input('description'),
            'start_date' => $request->input('start_date') ?: null,
            'end_date' => $request->input('end_date') ?: null,
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
     * "AI translate" ของ attribute แม่ (grade) เหมือนกับ master อื่นๆ ที่มี
     * คำแปลหลายภาษา
     */
    private function autoTranslate(ProductGrade $productGrade, array $translations): void
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
            ProductGradeTranslation::class,
            'product_grade_id',
            $productGrade->id,
            $sourceLocaleId,
            $sourceLabel,
            'product-grades',
            $productGrade->code,
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
    private function syncTranslations(ProductGrade $productGrade, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                ProductGradeTranslation::where('product_grade_id', $productGrade->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            ProductGradeTranslation::updateOrCreate(
                ['product_grade_id' => $productGrade->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
