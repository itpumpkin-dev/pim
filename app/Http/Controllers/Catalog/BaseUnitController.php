<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Models\ProductValue;
use App\Services\CodeGenerator;
use App\Support\TranslationTracking;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "หน่วยนับพื้นฐาน" (Base Units) เป็นหน้าจอจัดการ master แบบเดียวกับ Brands —
 * สร้างบนแถว AttributeOption ที่มีอยู่แล้วของ Attribute ชื่อ `pbaseunit` ไม่ใช่
 * ตารางใหม่ หน่วยนับของสินค้าถูกเก็บในรูป `ProductValue.value = AttributeOption.code`
 * (ดู ProductPresenter::SELECT_CODES_TO_RESOLVE ที่มี 'pbaseunit' อยู่ และคอลัมน์
 * "Count" ด้านล่างที่ query จากตรงนั้น) เพราะแก้ตรงแถว option โดยตรง ตัวเลือกใน
 * dropdown ของ attribute `pbaseunit` (หน้า Edit Product, import ฯลฯ) จึงอัปเดต
 * ตามทันทีโดยไม่ต้อง sync อะไรเพิ่ม
 *
 * แยก controller นี้ออกจาก AttributeOptionController ด้วยเหตุผลเดียวกับ
 * BrandController — รูปแบบ list/search/sort/count ของหน้านี้ไม่เข้ากับ panel
 * inline ทั่วไปของ attribute แต่ helper เรื่อง translation/audit/code-generation
 * ด้านล่างเลียนแบบพฤติกรรมของ controller นั้นมาทั้งหมด
 */
class BaseUnitController extends Controller
{
    private function baseUnitAttribute(): Attribute
    {
        return Attribute::where('code', 'pbaseunit')->firstOrFail();
    }

    /**
     * value (code ของ option) => จำนวนสินค้าที่ไม่ซ้ำกัน สำหรับ badge
     * "products_count" บน index() — คัดลอกแนวคิดมาจาก
     * BrandController::brandProductCounts() รวมถึงเหตุผลที่แคชด้วย TTL สั้นๆ
     * แทนการ invalidate ตาม event (แถว ProductValue ของ pbaseunit ถูกเขียนจาก
     * หลายจุด: สร้าง/แก้ไขสินค้า, import จำนวนมาก)
     */
    private function baseUnitProductCounts(int $attributeId): \Illuminate\Support\Collection
    {
        return Cache::remember(
            "base_units.product_counts:{$attributeId}",
            now()->addMinutes(10),
            fn () => ProductValue::where('attribute_id', $attributeId)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->select('value', DB::raw('count(distinct product_id) as cnt'))
                ->groupBy('value')
                ->pluck('cnt', 'value')
        );
    }

    public function index(Request $request): Response
    {
        $attribute = $this->baseUnitAttribute();

        $search = $request->input('search');
        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $options = AttributeOption::where('attribute_id', $attribute->id)
            ->when($search, function ($query, $search) {
                $query->where(function ($q) use ($search) {
                    $q->where('admin_label', 'like', "%{$search}%")
                        ->orWhere('slug', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            })
            ->get();

        $counts = $this->baseUnitProductCounts($attribute->id);

        $options = $options->map(function (AttributeOption $option) use ($counts) {
            $option->products_count = (int) ($counts[$option->code] ?? 0);

            return $option;
        });

        $sortableColumns = ['admin_label', 'slug', 'description', 'products_count', 'is_active'];
        $sortField = $request->input('sort');
        $sortDir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        if ($sortField && in_array($sortField, $sortableColumns, true)) {
            $options = $sortDir === 'desc' ? $options->sortByDesc($sortField) : $options->sortBy($sortField);
        } else {
            $options = $options->sortBy('admin_label', SORT_NATURAL | SORT_FLAG_CASE);
        }
        $options = $options->values();

        $page = (int) $request->input('page', 1);
        $paginated = new LengthAwarePaginator(
            $options->forPage($page, $perPage)->values(),
            $options->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()],
        );

        return Inertia::render('catalog/base-units/index', [
            'baseUnits' => $paginated,
            'attributeId' => $attribute->id,
            'filters' => [
                'search' => $search ?? '',
                'sort' => $sortField ?? '',
                'dir' => $sortField ? $sortDir : '',
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('catalog/base-units/create');
    }

    public function store(Request $request): RedirectResponse
    {
        $attribute = $this->baseUnitAttribute();

        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $translations = $validated['translations'] ?? [];
        $adminLabel = $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null);

        $nextSort = (int) AttributeOption::where('attribute_id', $attribute->id)->max('sort_order') + 1;

        $option = CodeGenerator::createWithRetry(
            'attribute_options',
            'option',
            fn ($code) => $attribute->options()->create([
                'code' => $code,
                'admin_label' => $adminLabel,
                'slug' => $validated['slug'] ?? null,
                'description' => $validated['description'] ?? null,
                'sort_order' => $nextSort,
                'is_active' => $request->boolean('is_active', true),
            ]),
            scope: ['attribute_id' => $attribute->id],
        );

        $this->syncTranslations($option, $translations);
        $this->autoTranslate($attribute, $option, $translations);

        AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($option));

        return to_route('catalog.baseUnits.index')->with('success', 'Base unit added successfully.');
    }

    public function edit(AttributeOption $baseUnit): Response
    {
        $attribute = $this->baseUnitAttribute();
        abort_unless($baseUnit->attribute_id === $attribute->id, 404);

        // option ที่ไม่มีแถว AttributeOptionTranslation เลย (เช่นที่ seed มาแค่
        // คอลัมน์ `admin_label` ดิบๆ) จะโชว์ช่อง Name ว่างสำหรับ locale ปัจจุบัน
        // ทั้งที่มีชื่ออยู่จริง — ใช้ fallback แบบเดียวกับ BrandController::edit()
        $translations = $baseUnit->translations
            ->mapWithKeys(fn (AttributeOptionTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();

        $activeLocaleId = Locale::idForCode(app()->getLocale());
        if ($activeLocaleId && trim((string) ($translations[$activeLocaleId] ?? '')) === '') {
            $rawLabel = trim((string) $baseUnit->getRawOriginal('admin_label'));
            if ($rawLabel !== '') {
                $translations[(string) $activeLocaleId] = $rawLabel;
            }
        }

        return Inertia::render('catalog/base-units/edit', [
            'baseUnit' => [
                'id' => $baseUnit->id,
                'code' => $baseUnit->code,
                'admin_label' => $baseUnit->getRawOriginal('admin_label'),
                'slug' => $baseUnit->slug,
                'description' => $baseUnit->description,
                'is_active' => $baseUnit->is_active,
            ],
            'translations' => $translations,
        ]);
    }

    public function update(Request $request, AttributeOption $baseUnit): RedirectResponse
    {
        $attribute = $this->baseUnitAttribute();
        abort_unless($baseUnit->attribute_id === $attribute->id, 404);

        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $translations = $validated['translations'] ?? [];
        $oldFields = $this->optionAuditFields($baseUnit);

        $baseUnit->update([
            'admin_label' => $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null),
            'slug' => $validated['slug'] ?? null,
            'description' => $validated['description'] ?? null,
            'is_active' => $request->boolean('is_active', true),
        ]);

        $this->syncTranslations($baseUnit, $translations);
        $this->autoTranslate($attribute, $baseUnit, $translations);

        $newFields = $this->optionAuditFields($baseUnit);
        if ($oldFields !== $newFields) {
            AuditLog::record('option_updated', $attribute, $oldFields, $newFields);
        }

        return back()->with('success', 'Base unit updated successfully.');
    }

    public function destroy(AttributeOption $baseUnit): RedirectResponse
    {
        $attribute = $this->baseUnitAttribute();
        abort_unless($baseUnit->attribute_id === $attribute->id, 404);

        $oldFields = $this->optionAuditFields($baseUnit);
        $baseUnit->delete();

        AuditLog::record('option_deleted', $attribute, $oldFields, null);

        return back()->with('success', 'Base unit deleted successfully.');
    }

    /**
     * ทำงานเหมือน AttributeOptionController::optionAuditFields() /
     * BrandController::optionAuditFields() — prefix option#{id}.* เดียวกัน
     * เพื่อให้ไปโชว์ในแท็บ History ของ Attribute แม่ (pbaseunit)
     */
    private function optionAuditFields(AttributeOption $option): array
    {
        $prefix = "option#{$option->id}";

        return collect($option->only(['code', 'admin_label', 'slug', 'description', 'sort_order', 'is_active']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }

    /**
     * คัดลอกมาจาก BrandController::resolveAdminLabel() — ทำให้คอลัมน์
     * `admin_label` ดิบๆ ตรงกับคำแปลของ locale เริ่มต้นของแอปเสมอ
     */
    private function resolveAdminLabel(array $translations, ?string $adminLabel): ?string
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));

        if ($defaultLocaleId !== null && ! empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');
        if ($firstNonEmpty !== null) {
            return trim($firstNonEmpty);
        }

        return $adminLabel !== null && trim($adminLabel) !== '' ? trim($adminLabel) : null;
    }

    /**
     * คัดลอกมาจาก BrandController::autoTranslate() — ยึดตามแฟล็ก "AI translate"
     * ของ attribute แม่ (pbaseunit) เหมือน option อื่นๆ ทุกตัวที่อยู่ข้างใต้มัน
     */
    private function autoTranslate(Attribute $attribute, AttributeOption $option, array $translations): void
    {
        if (! $attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        TranslationTracking::dispatchLabels(
            AttributeOptionTranslation::class,
            'attribute_option_id',
            $option->id,
            $sourceLocaleId,
            $sourceLabel,
            'base-units',
            $option->code,
            auth()->id(),
        );
    }

    /**
     * คัดลอกมาจาก BrandController::resolveAutoTranslateSource()
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
     * คัดลอกมาจาก BrandController::syncTranslations()
     */
    private function syncTranslations(AttributeOption $option, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeOptionTranslation::where('attribute_option_id', $option->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeOptionTranslation::updateOrCreate(
                ['attribute_option_id' => $option->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
