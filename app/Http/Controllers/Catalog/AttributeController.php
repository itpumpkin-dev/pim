<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeApiSource;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AttributeTranslation;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Services\Catalog\ApiAttributeOptionSync;
use App\Services\Catalog\MasterAttributeOptionSync;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use App\Services\ImportExport\SpreadsheetWriter;
use App\Support\TranslationTracking;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class AttributeController extends Controller
{
    use HasVersionHistory;


    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_grid');

        // `name` เป็นคอลัมน์ fallback ที่ไม่ผูกกับภาษาไหนเป็นพิเศษ (ดู
        // accessor Attribute::name()) — สิ่งที่ grid โชว์จริงๆ คือ label
        // ที่แปลแล้วของแต่ละ attribute ซึ่งอยู่ในตาราง translations แยกต่างหาก
        // ฟีเจอร์ search/filter ทั่วไปของ GridManager รู้แค่วิธี LIKE-match
        // กับคอลัมน์จริงเท่านั้น เลยต้องมาจัดการ match ด้วย name ตรงนี้แทน
        // โดยเอา block `filters.global` ใน attribute_grid.yml ออกไปทั้งหมด
        // (เพราะ GridManager จะเอา search clause ของตัวเองมา AND กับสิ่งที่
        // closure นี้เพิ่มเข้าไป ถ้ามี clause แคบๆ ที่ built-in ไว้แบบ
        // `code`/`type` เท่านั้น มันจะกลืนและทำลาย clause ที่กว้างกว่าด้าน
        // ล่างนี้ไปเงียบๆ) แล้วก็ตัด `name` ออกจาก input ของ per-column
        // filters ก่อนที่ GridManager จะเห็นมัน จากนั้นค่อยจัดการทั้งคู่
        // ด้านล่างนี้กับทั้งคอลัมน์ fallback และตาราง translations
        $search = $request->input('search');
        // cast เป็น (array) — ดูคอมเมนต์ใน GridManager::getData() ประกอบ:
        // ถ้า query param `?filters=` ว่างเปล่า มันจะมาถึงตรงนี้เป็น null ตรงๆ
        $originalFilters = (array) $request->input('filters', []);
        $nameFilter = $originalFilters['name'] ?? null;

        if ($nameFilter !== null && $nameFilter !== '') {
            $request->merge(['filters' => collect($originalFilters)->except('name')->all()]);
        }

        $gridData = $grid->getData($request, fn ($query) => $this->applyNameAwareSearch($query, $search, $nameFilter));

        return Inertia::render('catalog/attributes/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $gridData,
            // ใส่ key ตรงๆ แบบนี้ ไม่ใช้ only() — ดูเหตุผลได้ที่
            // ProductController::index() ว่าทำไม array ว่าง (เทียบกับ object)
            // ตรงนี้ถึงเป็นกับดักสำหรับ `filters.sort`
            'filters' => [
                'search' => $search ?? '',
                'sort' => $request->input('sort', ''),
                'dir' => $request->input('dir', ''),
                'filters' => $originalFilters,
            ],
        ]);
    }

    /**
     * ใช้ร่วมกันระหว่าง index() กับ export() — ดูคอมเมนต์ใน index()
     * ประกอบว่าทำไม `name` (คอลัมน์ fallback ที่แทน label ที่แปลแล้วของ
     * attribute) ถึงต้องจัดการแบบเฉพาะทางนี้ แทนที่จะใช้ per-column
     * filtering แบบทั่วไปของ GridManager
     */
    private function applyNameAwareSearch($query, ?string $search, mixed $nameFilter): void
    {
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('code', 'ilike', "%{$search}%")
                    ->orWhere('type', 'ilike', "%{$search}%")
                    ->orWhere('name', 'ilike', "%{$search}%")
                    ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'ilike', "%{$search}%"));
            });
        }

        if ($nameFilter) {
            $query->where(function ($q) use ($nameFilter) {
                $q->where('name', 'ilike', "%{$nameFilter}%")
                    ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'ilike', "%{$nameFilter}%"));
            });
        }
    }

    /**
     * ส่งออกรายการ attribute เป็น CSV/XLS/XLSX โดยยึดตาม search/
     * column-filters ที่กำลังใช้อยู่ในหน้า list ตอนนั้น (สร้าง query
     * เหมือนกับ index() เลย แค่ไม่แบ่งหน้า) — ทำตามรูปแบบเดียวกับ
     * ProductController::quickExport()
     */
    public function export(Request $request): BinaryFileResponse
    {
        $validated = $request->validate([
            'format' => ['required', 'in:csv,xls,xlsx'],
            'locale' => ['nullable', 'string', Rule::exists('locales', 'code')->where('enabled', true)],
        ]);
        $format = $validated['format'];

        // บังคับใช้ locale ตามที่หน้า list กำลังแสดงอยู่จริงตรงๆ เลย
        // แทนที่จะปล่อยให้ resolve จาก session/cookie แบบที่ SetLocale
        // ทำตามปกติ — เพราะถ้าเป็น user ที่โปรไฟล์ไม่มี locale UI ที่บันทึกไว้
        // และ cookie `locale` ก็ไม่ได้ติดมากับ request นี้ ระบบจะเงียบๆ
        // export ออกมาเป็น locale default ของแอปแทน ซึ่งจะไม่ตรงกับที่
        // หน้าจอ user กำลังแสดงอยู่
        if (! empty($validated['locale'])) {
            app()->setLocale($validated['locale']);
        }

        $grid = new GridManager('attribute_grid');
        $columns = array_keys($grid->getConfig()['columns']);

        $search = $request->input('search');
        // cast เป็น (array) — ดูคอมเมนต์ใน GridManager::getData() ประกอบ:
        // ถ้า query param `?filters=` ว่างเปล่า มันจะมาถึงตรงนี้เป็น null ตรงๆ
        $originalFilters = (array) $request->input('filters', []);
        $nameFilter = $originalFilters['name'] ?? null;
        $columnFilters = ($nameFilter !== null && $nameFilter !== '')
            ? collect($originalFilters)->except('name')->all()
            : $originalFilters;

        $query = Attribute::query();
        $this->applyNameAwareSearch($query, $search, $nameFilter);
        GridManager::applyFilters($query, $grid->getConfig()['columns'], $columnFilters);

        $rows = (function () use ($query, $columns) {
            foreach ($query->orderBy('id')->cursor() as $attribute) {
                $row = [];
                foreach ($columns as $column) {
                    $value = $attribute->{$column};
                    if (is_bool($value)) {
                        $value = $value ? '1' : '0';
                    } elseif ($value instanceof \Illuminate\Support\Carbon) {
                        $value = $value->toDateTimeString();
                    }
                    $row[$column] = $value;
                }

                yield $row;
            }
        })();

        Storage::disk('local')->makeDirectory('tmp-exports');
        $tempRelativePath = 'tmp-exports/'.Str::uuid().'.'.$format;
        $tempAbsolutePath = Storage::disk('local')->path($tempRelativePath);

        SpreadsheetWriter::write($tempAbsolutePath, $format, $columns, $rows, ',');

        $downloadName = 'attributes_'.now()->format('Ymd_His').'.'.$format;

        return response()->download($tempAbsolutePath, $downloadName)->deleteFileAfterSend(true);
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
        return Inertia::render('catalog/attributes/create', [
            'masterSources' => MasterAttributeOptionSync::pickerOptions(),
            'apiSources' => AttributeApiSource::where('is_active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function edit(Attribute $attribute): Response
    {
        // Active sources for the picker, plus the currently-bound one even
        // if it's since been deactivated — otherwise an attribute bound to a
        // now-inactive source would silently show no selection at all.
        $apiSources = AttributeApiSource::where('is_active', true)->orderBy('name')->get(['id', 'name']);
        if ($attribute->api_source_id !== null && ! $apiSources->contains('id', $attribute->api_source_id)) {
            $bound = AttributeApiSource::find($attribute->api_source_id, ['id', 'name']);
            if ($bound !== null) {
                $apiSources->push($bound);
            }
        }

        return Inertia::render('catalog/attributes/edit', [
            'attribute' => $attribute->only([
                'id', 'code', 'name', 'type', 'swatch_type', 'master_source', 'api_source_id', 'is_required', 'is_unique',
                'is_locale_based', 'is_ai_translate', 'is_channel_based', 'is_filterable',
            ]),
            'masterSources' => MasterAttributeOptionSync::pickerOptions(),
            'apiSources' => $apiSources,
            'translations' => $attribute->translations()->get()
                ->mapWithKeys(fn (AttributeTranslation $t) => [(string) $t->locale_id => $t->label]),
            'options' => $attribute->options()->orderBy('sort_order')->orderBy('id')->get([
                'id', 'attribute_id', 'code', 'admin_label', 'swatch_value', 'sort_order', 'is_active', 'is_customized',
            ])->map(fn ($option) => [
                'id' => $option->id,
                'code' => $option->code,
                'admin_label' => $option->admin_label,
                'translations' => $option->translations->mapWithKeys(fn ($t) => [(string) $t->locale_id => $t->label]),
                'swatch_value' => $attribute->swatch_type === 'image' && $option->swatch_value
                    ? Storage::disk('public')->url($option->swatch_value)
                    : $option->swatch_value,
                'sort_order' => $option->sort_order,
                'is_active' => $option->is_active,
                'is_customized' => $option->is_customized,
            ]),
            'canViewHistory' => auth()->user()?->hasPermission('attributes', 'view_history') ?? false,
        ]);
    }

    public function history(Attribute $attribute): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($attribute)]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'in:text,textarea,price,number,boolean,select,multiselect,datetime,date,image,gallery,file,checkbox,video'],
            'swatch_type' => ['nullable', 'required_if:type,select,multiselect', 'in:text,color,image'],
            'master_source' => ['nullable', 'in:' . implode(',', MasterAttributeOptionSync::keys())],
            'api_source_id' => ['nullable', 'exists:attribute_api_sources,id'],
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
        $name = $this->resolveName($translations, $validated['name'] ?? null);
        [$masterSource, $apiSourceId] = $this->resolveSourceBinding($validated);

        $attribute = CodeGenerator::createWithRetry('attributes', 'attribute', fn ($code) => Attribute::create([
            ...$validated,
            'code' => $code,
            'name' => $name,
            'master_source' => $masterSource,
            'api_source_id' => $apiSourceId,
            'is_required' => $request->boolean('is_required'),
            'is_unique' => $request->boolean('is_unique'),
            'is_locale_based' => $request->boolean('is_locale_based'),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'is_channel_based' => $request->boolean('is_channel_based'),
            'is_filterable' => $request->boolean('is_filterable'),
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]));

        $this->syncTranslations($attribute, $translations);
        $this->autoTranslate($attribute, $translations);

        $newTranslations = $this->currentTranslations($attribute);
        if (!empty($newTranslations)) {
            AuditLog::record('labels_set', $attribute, null, $newTranslations);
        }

        $syncWarning = null;
        if ($attribute->master_source !== null) {
            app(MasterAttributeOptionSync::class)->rebuildAttribute($attribute);
        } elseif ($attribute->api_source_id !== null) {
            $syncWarning = $this->syncApiOptionsSafely($attribute);
        }

        Attribute::bumpCodeMapVersion();
        Attribute::bumpListVersion();

        $response = to_route('catalog.attributes.index');

        // Only ever flash one of success/warning (see FlashToast's docblock
        // on why a redirect must not carry both).
        return $syncWarning !== null
            ? $response->with('warning', $syncWarning)
            : $response->with('success', 'Attribute created successfully.');
    }

    /**
     * Unlike a master_source (an internal table — effectively always
     * reachable), an AttributeApiSource is an external HTTP call that can
     * fail (network blip, bad credentials, endpoint down). The attribute
     * itself has already been saved and bound to the source by this point,
     * so a sync failure here shouldn't 500 the whole request — the admin
     * still gets their attribute, just with a warning that options didn't
     * sync yet (they can retry from `catalog:sync-api-options` or by
     * re-saving the attribute once the source is reachable).
     */
    private function syncApiOptionsSafely(Attribute $attribute): ?string
    {
        try {
            app(ApiAttributeOptionSync::class)->rebuildAttribute($attribute);

            return null;
        } catch (\Throwable $e) {
            return "Attribute saved, but syncing its options from the API source failed: {$e->getMessage()}";
        }
    }

    /**
     * A select/multiselect attribute binds to at most one option source —
     * either a master_source or an AttributeApiSource, never both. The
     * create/edit forms only ever submit one of the two (see the "Source
     * Type" selector in attributes/create.tsx and edit.tsx), but this is
     * enforced here too rather than trusted from the client.
     *
     * @param  array{type: string, master_source?: ?string, api_source_id?: ?int}  $validated
     * @return array{0: ?string, 1: ?int}
     */
    private function resolveSourceBinding(array $validated): array
    {
        if (! in_array($validated['type'], ['select', 'multiselect'], true)) {
            return [null, null];
        }

        if (! empty($validated['api_source_id'])) {
            return [null, (int) $validated['api_source_id']];
        }

        return [$validated['master_source'] ?? null, null];
    }

    public function update(Request $request, Attribute $attribute): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'type' => ['required', 'in:text,textarea,price,number,boolean,select,multiselect,datetime,date,image,gallery,file,checkbox,video'],
            'swatch_type' => ['nullable', 'required_if:type,select,multiselect', 'in:text,color,image'],
            'master_source' => ['nullable', 'in:' . implode(',', MasterAttributeOptionSync::keys())],
            'api_source_id' => ['nullable', 'exists:attribute_api_sources,id'],
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
        $oldTranslations = $this->currentTranslations($attribute);
        $oldMasterSource = $attribute->master_source;
        $oldApiSourceId = $attribute->api_source_id;

        [$masterSource, $apiSourceId] = $this->resolveSourceBinding($validated);

        $attribute->update([
            ...$validated,
            'name' => $this->resolveName($translations, $validated['name'] ?? null),
            'master_source' => $masterSource,
            'api_source_id' => $apiSourceId,
            'is_required' => $request->boolean('is_required'),
            'is_unique' => $request->boolean('is_unique'),
            'is_locale_based' => $request->boolean('is_locale_based'),
            'is_ai_translate' => $request->boolean('is_ai_translate'),
            'is_channel_based' => $request->boolean('is_channel_based'),
            'is_filterable' => $request->boolean('is_filterable'),
            'updated_by' => $request->user()->id,
        ]);

        $this->syncTranslations($attribute, $translations);
        $this->autoTranslate($attribute, $translations);

        $newTranslations = $this->currentTranslations($attribute);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $attribute, $oldTranslations, $newTranslations);
        }

        // Rebound (or unbound) either source — regenerate the whole option
        // list from the new one. A no-op source keeps whatever options exist.
        $syncWarning = null;
        if ($attribute->master_source !== $oldMasterSource && $attribute->master_source !== null) {
            app(MasterAttributeOptionSync::class)->rebuildAttribute($attribute);
        } elseif ($attribute->api_source_id !== $oldApiSourceId && $attribute->api_source_id !== null) {
            $syncWarning = $this->syncApiOptionsSafely($attribute);
        }

        Attribute::bumpListVersion();

        $response = to_route('catalog.attributes.index');

        return $syncWarning !== null
            ? $response->with('warning', $syncWarning)
            : $response->with('success', 'Attribute updated successfully.');
    }

    /**
     * ดึง map locale_id => label ของ translation ปัจจุบันของ attribute
     * แบบสดๆ (ไม่ใช้ cache) — ใช้สำหรับ snapshot สถานะก่อน/หลัง เพื่อไปทำ
     * audit diff
     */
    private function currentTranslations(Attribute $attribute): array
    {
        return $attribute->translations()->get()
            ->mapWithKeys(fn (AttributeTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();
    }

    private function resolveName(array $translations, ?string $name, ?string $code = null): string
    {
        $defaultLocaleId = Locale::where('code', config('app.locale'))->value('id');

        if ($defaultLocaleId !== null && !empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');
        if ($firstNonEmpty !== null) {
            return trim($firstNonEmpty);
        }

        return $name ?? ($code !== null ? ucfirst($code) : 'Attribute');
    }

    /**
     * ถ้าเปิด "AI translate" ไว้ และมีการกรอก label ของ locale default
     * แล้ว จะ queue job ไปเติม label ให้ทุก locale ที่ active อยู่แล้ว
     * ยังไม่มี translation — ตั้งใจให้ทำงานนอก request/response cycle
     * เพราะเป็นการยิง call ไปยัง translation provider หลายครั้ง (ครั้งละ
     * locale ที่ขาด) ซึ่งช้าเกินกว่าจะให้ Save รอ จะข้ามไปเลยถ้า label
     * ของ locale default เองว่างเปล่า เพราะงั้นเราจะไม่มีต้นฉบับ
     * ข้อความ/ภาษาที่เชื่อถือได้ให้แปลจาก
     */
    private function autoTranslate(Attribute $attribute, array $translations): void
    {
        if (!$attribute->is_ai_translate) {
            return;
        }

        [$sourceLocaleId, $sourceLabel] = $this->resolveAutoTranslateSource($translations);

        if ($sourceLocaleId === null || $sourceLabel === '') {
            return;
        }

        TranslationTracking::dispatchLabels(
            AttributeTranslation::class,
            'attribute_id',
            $attribute->id,
            $sourceLocaleId,
            $sourceLabel,
            'attributes',
            $attribute->code,
            auth()->id(),
        );
    }

    /**
     * เลือกว่าจะแปลจาก locale ไหน จะพยายามใช้ locale default ของแอปก่อน
     * ถ้ามีค่ากรอกไว้ แต่ถ้าไม่มีก็ fallback ไปใช้ locale ไหนก็ได้ที่มี
     * label อยู่ — ถ้าฟอร์มส่งมาแค่ translation ของ locale ที่ไม่ใช่
     * default (เช่น ผู้แก้ไขทำงานอยู่ใน locale อื่นที่ไม่ใช่ default ของ
     * แอป) จะทำให้ auto-translation ถูกข้ามไปเงียบๆ ทั้งหมด เพราะตั้งแต่
     * แรกไม่มีอะไรอยู่ใน locale default เลย
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

        Attribute::bumpCodeMapVersion();
        Attribute::bumpListVersion();

        return to_route('catalog.attributes.index')->with('success', 'Attribute deleted successfully.');
    }
}
