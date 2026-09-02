<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AuditLog;
use App\Models\BaseUnit;
use App\Models\BaseUnitTranslation;
use App\Models\Locale;
use App\Models\ProductValue;
use App\Services\CodeGenerator;
use App\Support\TranslationTracking;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "หน่วยนับพื้นฐาน" (Base Units) — เดิมเป็นหน้าจอ CRUD ตรงบนแถว AttributeOption
 * ของ attribute `pbaseunit` (แบบเดียวกับ Brands) ตอนนี้เปลี่ยนมาเป็น master
 * table ของตัวเอง (`base_units` + `base_unit_translations` — ดู BaseUnit
 * model) ผูก master_source = 'base_units' เข้ากับ attribute `pbaseunit`
 * (ดู MasterAttributeOptionSync) เพื่อให้เลือกเป็นแหล่งข้อมูล Master ของ
 * attribute อื่นได้ด้วย — หน่วยนับของสินค้ายังเก็บเป็น
 * `ProductValue.value = BaseUnit.code` เหมือนเดิมทุกประการ (ไม่กระทบ) เพราะ
 * รหัส (code) เดิมทุกตัวถูกย้ายมาแบบคงเดิม (ดู migration create_base_units_table)
 *
 * Helper เรื่อง translation/audit/code-generation ด้านล่างเลียนแบบ
 * BusinessTypeController/BrandController มาเกือบทั้งหมด ต่างกันตรงที่ BaseUnit
 * มีชื่อแปลได้หลายภาษาจริง (เหมือน Category) เลยต้อง sync ผ่าน
 * BaseUnitTranslation แยกออกมาแทนที่จะเป็นคอลัมน์ name เดียว
 */
class BaseUnitController extends Controller
{
    private function baseUnitAttribute(): Attribute
    {
        return Attribute::where('code', 'pbaseunit')->firstOrFail();
    }

    /**
     * code ของ BaseUnit => จำนวนสินค้าที่ไม่ซ้ำกัน สำหรับ badge "products_count"
     * บน index() — เหมือนเดิมทุกอย่าง (ProductValue ยังอ้างอิงด้วย code ตรงๆ)
     * แคชด้วย TTL สั้นๆ แทนการ invalidate ตาม event เพราะแถว ProductValue ของ
     * pbaseunit ถูกเขียนจากหลายจุด: สร้าง/แก้ไขสินค้า, import จำนวนมาก
     */
    private function baseUnitProductCounts(int $attributeId): \Illuminate\Support\Collection
    {
        return Cache::remember(
            "base_units.product_counts:{$attributeId}",
            now()->addMinutes(10),
            fn () => ProductValue::where('attribute_id', $attributeId)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->select('value', \Illuminate\Support\Facades\DB::raw('count(distinct product_id) as cnt'))
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

        // โหลดทั้งหมดมาเรียงเอง (เหมือนเวอร์ชันเดิมที่ทำงานบน AttributeOption
        // ตรงๆ) แทนที่จะ paginate ระดับ query builder — เพราะ products_count
        // เป็นค่าที่คำนวณเอง ไม่ใช่คอลัมน์จริงของ base_units จะ sort ตามคอลัมน์นี้
        // ให้ถูกต้องข้ามหน้าได้ ต้องมีข้อมูลครบทุกแถวก่อนค่อยตัดหน้า จำนวน
        // base unit ทั้งระบบมีไม่มาก (หลักสิบ) โหลดทั้งหมดไม่กระทบ performance
        $units = BaseUnit::query()
            ->when($search, function ($q) use ($search) {
                $q->where(function ($q2) use ($search) {
                    $q2->where('name', 'like', "%{$search}%")
                        ->orWhere('slug', 'like', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'like', "%{$search}%"));
                });
            })
            ->get();

        $counts = $this->baseUnitProductCounts($attribute->id);
        $rows = $units->map(function (BaseUnit $unit) use ($counts) {
            return [
                'id' => $unit->id,
                'code' => $unit->code,
                'admin_label' => $unit->name,
                'slug' => $unit->slug,
                'description' => $unit->description,
                'products_count' => (int) ($counts[$unit->code] ?? 0),
                'is_active' => $unit->is_active,
            ];
        });

        $sortableColumns = ['admin_label', 'slug', 'description', 'products_count', 'is_active'];
        $sortField = $request->input('sort');
        $sortDir = strtolower((string) $request->input('dir')) === 'desc' ? 'desc' : 'asc';

        if ($sortField && in_array($sortField, $sortableColumns, true)) {
            $rows = $sortDir === 'desc' ? $rows->sortByDesc($sortField) : $rows->sortBy($sortField);
        } else {
            $rows = $rows->sortBy('admin_label', SORT_NATURAL | SORT_FLAG_CASE);
        }
        $rows = $rows->values();

        $page = (int) $request->input('page', 1);
        $paginated = new \Illuminate\Pagination\LengthAwarePaginator(
            $rows->forPage($page, $perPage)->values(),
            $rows->count(),
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
        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $translations = $validated['translations'] ?? [];
        $name = $this->resolveName($translations, $validated['admin_label'] ?? null);

        $nextSort = (int) BaseUnit::max('sort_order') + 1;

        $unit = CodeGenerator::createWithRetry(
            'base_units',
            'unit',
            fn ($code) => BaseUnit::create([
                'code' => $code,
                'name' => $name ?? $code,
                'slug' => $validated['slug'] ?? null,
                'description' => $validated['description'] ?? null,
                'sort_order' => $nextSort,
                'is_active' => $request->boolean('is_active', true),
            ]),
        );

        $this->syncTranslations($unit, $translations);
        $this->autoTranslate($unit, $translations);

        AuditLog::record('base_unit_created', $this->baseUnitAttribute(), null, $this->auditFields($unit));

        return to_route('catalog.baseUnits.index')->with('success', 'Base unit added successfully.');
    }

    public function edit(BaseUnit $baseUnit): Response
    {
        $translations = $baseUnit->translations
            ->mapWithKeys(fn (BaseUnitTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();

        return Inertia::render('catalog/base-units/edit', [
            'baseUnit' => [
                'id' => $baseUnit->id,
                'code' => $baseUnit->code,
                'admin_label' => $baseUnit->name,
                'slug' => $baseUnit->slug,
                'description' => $baseUnit->description,
                'is_active' => $baseUnit->is_active,
            ],
            'translations' => $translations,
        ]);
    }

    public function update(Request $request, BaseUnit $baseUnit): RedirectResponse
    {
        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);

        $translations = $validated['translations'] ?? [];
        $oldFields = $this->auditFields($baseUnit);

        $baseUnit->update([
            'name' => $this->resolveName($translations, $validated['admin_label'] ?? null) ?? $baseUnit->name,
            'slug' => $validated['slug'] ?? null,
            'description' => $validated['description'] ?? null,
            'is_active' => $request->boolean('is_active', true),
        ]);

        $this->syncTranslations($baseUnit, $translations);
        $this->autoTranslate($baseUnit, $translations);

        $newFields = $this->auditFields($baseUnit->fresh());
        if ($oldFields !== $newFields) {
            AuditLog::record('base_unit_updated', $this->baseUnitAttribute(), $oldFields, $newFields);
        }

        return back()->with('success', 'Base unit updated successfully.');
    }

    public function destroy(BaseUnit $baseUnit): RedirectResponse
    {
        $oldFields = $this->auditFields($baseUnit);
        $baseUnit->delete();

        AuditLog::record('base_unit_deleted', $this->baseUnitAttribute(), $oldFields, null);

        return back()->with('success', 'Base unit deleted successfully.');
    }

    /**
     * เหมือน BusinessTypeController::optionAuditFields() ทำนองเดียวกัน — prefix
     * base_unit#{id}.* เพื่อให้ไปโชว์ในแท็บ History ของ Attribute แม่ (pbaseunit)
     * แยกจาก option#{id}.* เดิมของยุค AttributeOption (ก่อน migration ย้ายมาที่นี่)
     * ชัดเจน ไม่ปนกัน
     */
    private function auditFields(BaseUnit $unit): array
    {
        $prefix = "base_unit#{$unit->id}";

        return collect($unit->only(['code', 'name', 'slug', 'description', 'sort_order', 'is_active']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }

    /**
     * คัดลอกมาจาก BrandController::resolveAdminLabel() — ทำให้คอลัมน์ `name`
     * ตรงกับคำแปลของ locale เริ่มต้นของแอปเสมอ
     */
    private function resolveName(array $translations, ?string $adminLabel): ?string
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
    private function autoTranslate(BaseUnit $unit, array $translations): void
    {
        $attribute = $this->baseUnitAttribute();
        if (! $attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        TranslationTracking::dispatchLabels(
            BaseUnitTranslation::class,
            'base_unit_id',
            $unit->id,
            $sourceLocaleId,
            $sourceLabel,
            'base-units',
            $unit->code,
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
    private function syncTranslations(BaseUnit $unit, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                BaseUnitTranslation::where('base_unit_id', $unit->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            BaseUnitTranslation::updateOrCreate(
                ['base_unit_id' => $unit->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }
}
