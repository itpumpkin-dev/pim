<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeOption;
use App\Models\AttributeOptionTranslation;
use App\Models\AuditLog;
use App\Models\BaseUnit;
use App\Models\BaseUnitTranslation;
use App\Models\Brand;
use App\Models\BrandTranslation;
use App\Models\BusinessType;
use App\Models\BusinessTypeTranslation;
use App\Models\Locale;
use App\Models\ProductType;
use App\Models\ProductTypeTranslation;
use App\Services\CodeGenerator;
use App\Support\TranslationTracking;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * จัดการ CRUD ของตัวเลือก (option) แบบ select/multiselect ของ attribute
 * รวมถึงค่า swatch ของมันด้วย (สีแบบ hex, รูปที่อัปโหลด หรือข้อความล้วน
 * แล้วแต่ค่า `swatch_type` ของ attribute แม่) ออกแบบให้ซ้อนอยู่ใต้ attribute
 * ไม่ใช่ resource แยกต่างหาก เพราะ option จะมีความหมายก็ต่อเมื่ออยู่ใน
 * บริบทของ attribute เท่านั้น พอทำเสร็จจะ redirect กลับไปหน้าแก้ไข attribute
 * เหมือน controller อื่นๆ ใน catalog แทนที่จะ return JSON เพื่อให้ flow
 * การ submit ฟอร์มปกติของ Inertia (CSRF, validation error bag ฯลฯ) ทำงานได้เลย
 *
 * ถ้า attribute ผูก master_source ไว้ (ดู MasterAttributeOptionSync) ตัวเลือก
 * ของมัน "ต้อง" มาจาก master table เท่านั้น — สร้าง AttributeOption ตรงๆ
 * ตรงนี้จะโดนลบทิ้งเงียบๆ ทันทีที่มีการ rebuildAttribute() ครั้งถัดไป (เช่น
 * ตอนแก้ master record อื่น หรือรัน `catalog:sync-master-options`) เพราะฉะนั้น
 * store() จะเช็คก่อนเสมอว่า attribute นี้ผูก master ไว้หรือเปล่า ถ้าใช่ก็สร้าง
 * record ใน master table แทน (ดู storeMasterBackedOption()) ไม่ใช่สร้าง
 * AttributeOption ตรงๆ — ใช้ได้เฉพาะ master ที่ auto-generate code เอง
 * (business_types/product_types/base_units/brands) เท่านั้น เพราะ dialog
 * quick-add บนหน้าแก้ไขสินค้าไม่ได้เก็บ field code มาด้วย ส่วน master ที่ต้อง
 * พิมพ์ code เอง (currencies/product_grades/vendors) หรือมีโครงสร้างซับซ้อน
 * กว่านั้น (points/commission_groups/categories/subcategories/product_groups)
 * จะแจ้ง error กลับไปให้ไปเพิ่มที่หน้าจัดการ master นั้นโดยตรงแทน
 */
class AttributeOptionController extends Controller
{
    /**
     * master_source => การตั้งค่าสำหรับสร้าง record ใหม่แบบเร็วๆ (แค่ชื่อ +
     * code auto-generate) — เฉพาะ master ที่ครบ 3 เงื่อนไขนี้: (1) ไม่มีคอลัมน์
     * required อื่นนอกจาก code/name (2) code auto-generate ได้ ไม่ต้องพิมพ์เอง
     * (3) มีโมเดลคำแปลแยกต่างหากรูปแบบเดียวกันหมด (parent_id + locale_id +
     * label) — Points/CommissionGroups (โครงสร้างคอลัมน์ไม่ตรงแบบนี้เลย) และ
     * Currencies/ProductGrades/Vendors (code ต้องพิมพ์เอง) จึงไม่อยู่ในนี้
     */
    private const QUICK_ADD_MASTER_CONFIG = [
        // `unique_name` mirrors that master's OWN controller exactly: Business
        // Type/Product Type both validate `Rule::unique($table, 'name')`
        // before creating (their tables carry a real DB unique constraint on
        // `name`) — Base Unit/Brand don't (no such constraint, and their own
        // controllers never check it either). Getting this wrong isn't
        // cosmetic: skipping it where the DB *does* enforce it turns a
        // duplicate-name quick-add into an uncaught QueryException instead
        // of a normal validation error.
        'business_types' => ['model' => BusinessType::class, 'translation' => BusinessTypeTranslation::class, 'fk' => 'business_type_id', 'table' => 'business_types', 'prefix' => 'biztype', 'unique_name' => true],
        'product_types' => ['model' => ProductType::class, 'translation' => ProductTypeTranslation::class, 'fk' => 'product_type_id', 'table' => 'product_types', 'prefix' => 'ptype', 'unique_name' => true],
        'base_units' => ['model' => BaseUnit::class, 'translation' => BaseUnitTranslation::class, 'fk' => 'base_unit_id', 'table' => 'base_units', 'prefix' => 'unit', 'unique_name' => false],
        'brands' => ['model' => Brand::class, 'translation' => BrandTranslation::class, 'fk' => 'brand_id', 'table' => 'brands', 'prefix' => 'brand', 'unique_name' => false],
    ];

    public function store(Request $request, Attribute $attribute): RedirectResponse
    {
        if ($attribute->master_source !== null) {
            return $this->storeMasterBackedOption($request, $attribute);
        }

        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'swatch_value' => ['nullable', 'string', 'max:255'],
            'swatch_image' => ['nullable', 'image', 'max:2048'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $translations = $validated['translations'] ?? [];
        $adminLabel = $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null);

        $swatchValue = $validated['swatch_value'] ?? null;
        if ($attribute->swatch_type === 'image' && $request->hasFile('swatch_image')) {
            $swatchValue = $request->file('swatch_image')->store('attribute-options', 'public');
        }

        $option = CodeGenerator::createWithRetry(
            'attribute_options',
            'option',
            fn ($code) => $attribute->options()->create([
                'code' => $code,
                'admin_label' => $adminLabel,
                'swatch_value' => $swatchValue,
                'sort_order' => $validated['sort_order'] ?? 0,
            ]),
            scope: ['attribute_id' => $attribute->id],
        );

        $this->syncTranslations($option, $translations);
        $this->autoTranslate($attribute, $option, $translations);

        AuditLog::record('option_created', $attribute, null, $this->optionAuditFields($option));

        // โค้ดนี้ server เป็นคนสร้างให้ (ดู CodeGenerator) — flash กลับไปด้วย
        // เพื่อให้ dialog quick-add ในหน้าแก้ไขสินค้าเลือก option นี้ได้ทันที
        // โดยไม่ต้องให้ฝั่งเรียกเดาหรือใส่โค้ดเอง
        return back()->with('success', 'Option added successfully.')->with('created_option_code', $option->code);
    }

    /**
     * เวอร์ชัน "สร้างตัวเลือกใหม่" สำหรับ attribute ที่ผูก master ไว้ — สร้าง
     * record ในตาราง master จริงๆ (ไม่ใช่ AttributeOption ตรงๆ) แล้วปล่อยให้
     * model 'saved' event ที่ผูกไว้แล้วใน AppServiceProvider::MASTER_MODELS
     * เป็นคน mirror เข้า AttributeOption ให้เองอัตโนมัติ — ไม่ต้องเรียก
     * MasterAttributeOptionSync ตรงๆ ในนี้เลย เหมือนกับที่ทุก master
     * controller (BrandController, BusinessTypeController, ...) ทำอยู่แล้ว
     */
    private function storeMasterBackedOption(Request $request, Attribute $attribute): RedirectResponse
    {
        $config = self::QUICK_ADD_MASTER_CONFIG[$attribute->master_source] ?? null;

        if ($config === null) {
            throw ValidationException::withMessages([
                'translations' => "This attribute's options come from a Master data screen that needs more information than a quick add can provide (e.g. a code you type yourself) — add it from that Master's own page instead.",
            ]);
        }

        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
        ]);

        $translations = $validated['translations'] ?? [];
        $name = $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null);

        // ต้องเช็คก่อนสร้างจริง ไม่ใช่ปล่อยให้ DB unique constraint (ถ้ามี)
        // เป็นคนจับแทน — business_types/product_types มี unique('name') จริง
        // ที่ระดับ DB (ดู QUICK_ADD_MASTER_CONFIG ด้านบน) ถ้าไม่เช็คตรงนี้ก่อน
        // ชื่อซ้ำจะกลายเป็น QueryException ดิบๆ (500) แทนที่จะเป็น validation
        // error ปกติที่ dialog แสดงให้ผู้ใช้เห็นได้
        if ($config['unique_name'] && $name !== null) {
            Validator::make(
                ['translations' => $name],
                ['translations' => [Rule::unique($config['table'], 'name')]],
            )->validate();
        }

        /** @var class-string<Model> $modelClass */
        $modelClass = $config['model'];
        $hasSortOrder = Schema::hasColumn($config['table'], 'sort_order');
        $nextSort = $hasSortOrder ? (int) $modelClass::max('sort_order') + 1 : null;

        $model = CodeGenerator::createWithRetry(
            $config['table'],
            $config['prefix'],
            function ($code) use ($modelClass, $name, $hasSortOrder, $nextSort) {
                $data = ['code' => $code, 'name' => $name ?? $code];
                if ($hasSortOrder) {
                    $data['sort_order'] = $nextSort;
                }

                return $modelClass::create($data);
            },
        );

        /** @var class-string<Model> $translationClass */
        $translationClass = $config['translation'];
        $fk = $config['fk'];
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';
            if ($label === '') {
                continue;
            }

            $translationClass::updateOrCreate([$fk => $model->id, 'locale_id' => $localeId], ['label' => $label]);
        }

        // model->save() ข้างบน (ผ่าน CodeGenerator::createWithRetry()) และการ
        // สร้างแถวคำแปลข้างต้น ทั้งคู่ยิง 'saved' event ที่ mirror เข้า
        // AttributeOption ให้เองแล้ว (ดู AppServiceProvider) — ไม่ต้องเรียก
        // MasterAttributeOptionSync ตรงๆ ในนี้เลย ต่างจาก AuditLog ที่ยังต้อง
        // เขียนเองตรงนี้ เพราะแต่ละ master controller ปกติเป็นคนเขียนเอง
        // (event เดียวกันไม่ได้ทำ audit log ให้)
        AuditLog::record('option_created', $attribute, null, ["master_option#{$model->id}.code" => $model->code, "master_option#{$model->id}.name" => $model->name]);

        return back()->with('success', 'Option added successfully.')->with('created_option_code', $model->code);
    }

    public function update(Request $request, Attribute $attribute, AttributeOption $option): RedirectResponse
    {
        $validated = $request->validate([
            'admin_label' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'swatch_value' => ['nullable', 'string', 'max:255'],
            'swatch_image' => ['nullable', 'image', 'max:2048'],
            'sort_order' => ['nullable', 'integer'],
        ]);

        $translations = $validated['translations'] ?? [];

        $swatchValue = $validated['swatch_value'] ?? $option->swatch_value;
        if ($attribute->swatch_type === 'image' && $request->hasFile('swatch_image')) {
            $swatchValue = $request->file('swatch_image')->store('attribute-options', 'public');
        }

        $oldFields = $this->optionAuditFields($option);

        $option->update([
            'admin_label' => $this->resolveAdminLabel($translations, $validated['admin_label'] ?? null),
            'swatch_value' => $swatchValue,
            'sort_order' => $validated['sort_order'] ?? $option->sort_order,
        ]);

        $this->syncTranslations($option, $translations);
        $this->autoTranslate($attribute, $option, $translations);

        $newFields = $this->optionAuditFields($option);
        if ($oldFields !== $newFields) {
            AuditLog::record('option_updated', $attribute, $oldFields, $newFields);
        }

        return back()->with('success', 'Option updated successfully.');
    }

    /**
     * เซฟ option ทุกแถวในคำขอเดียว แทนที่จะยิง PUT ทีละแถวแบบปกติ — จำเป็น
     * เมื่อ attribute หนึ่งมี option เยอะเกินกว่าจะจัดการทีละอัน (บาง list
     * มีเป็นร้อยรายการ) ซึ่งถ้าให้กด Save ทีละแถวคงไม่ไหว
     *
     * ตั้งใจไม่ให้รัน auto-translation ตรงนี้ (ดู autoTranslate() ใน
     * store()/update()) เพราะถ้ามีเป็นร้อยแถว การยิง call ไปยัง translation
     * provider ทีละ locale ที่ขาดในแต่ละแถวแบบ synchronous จะเสี่ยงทำให้
     * request timeout ได้ ดังนั้น option ที่เซฟผ่านทางนี้จะเก็บ label ตามที่
     * พิมพ์มา แล้วปล่อยให้ไปแปลเองทีหลังแบบ manual
     */
    public function batchUpdate(Request $request, Attribute $attribute): RedirectResponse
    {
        $validated = $request->validate([
            'options' => ['required', 'array'],
            'options.*.id' => [
                'required', 'integer',
                Rule::exists('attribute_options', 'id')->where('attribute_id', $attribute->id),
            ],
            'options.*.admin_label' => ['nullable', 'string', 'max:255'],
            'options.*.translations' => ['nullable', 'array'],
            'options.*.translations.*' => ['nullable', 'string', 'max:255'],
            'options.*.swatch_value' => ['nullable', 'string', 'max:255'],
            'options.*.swatch_image' => ['nullable', 'image', 'max:2048'],
        ]);

        $allOldFields = [];
        $allNewFields = [];

        DB::transaction(function () use ($validated, $attribute, $request, &$allOldFields, &$allNewFields) {
            foreach ($validated['options'] as $index => $optionData) {
                $option = AttributeOption::where('attribute_id', $attribute->id)->findOrFail($optionData['id']);
                $translations = $optionData['translations'] ?? [];

                $swatchValue = $optionData['swatch_value'] ?? $option->swatch_value;
                if ($attribute->swatch_type === 'image' && $request->hasFile("options.{$index}.swatch_image")) {
                    $swatchValue = $request->file("options.{$index}.swatch_image")->store('attribute-options', 'public');
                }

                $oldFields = $this->optionAuditFields($option);

                $option->update([
                    'admin_label' => $this->resolveAdminLabel($translations, $optionData['admin_label'] ?? null),
                    'swatch_value' => $swatchValue,
                ]);

                $this->syncTranslations($option, $translations);

                $newFields = $this->optionAuditFields($option);
                if ($oldFields !== $newFields) {
                    $allOldFields += $oldFields;
                    $allNewFields += $newFields;
                }
            }
        });

        if (!empty($allOldFields) || !empty($allNewFields)) {
            AuditLog::record('options_batch_updated', $attribute, $allOldFields, $allNewFields);
        }

        return back()->with('success', 'Options updated successfully.');
    }

    public function destroy(Attribute $attribute, AttributeOption $option): RedirectResponse
    {
        $oldFields = $this->optionAuditFields($option);
        $option->delete();

        AuditLog::record('option_deleted', $attribute, $oldFields, null);

        return back()->with('success', 'Option deleted successfully.');
    }

    /**
     * การสร้าง/แก้ไข/ลบ option จะถูกบันทึกไว้ที่ attribute แม่ (ไม่ใช่ที่ตัว
     * option เอง) เพราะ option จะถูกดูผ่านหน้าแก้ไขของ attribute เท่านั้น
     * — นี่คือสิ่งที่ไปโผล่ในแท็บ History ของ attribute นั้น key จะใส่
     * option id นำหน้าไว้ เพื่อไม่ให้การเปลี่ยนชื่อ option ถูกเข้าใจผิดว่า
     * เป็น option อื่นที่หายไป
     */
    private function optionAuditFields(AttributeOption $option): array
    {
        $prefix = "option#{$option->id}";

        return collect($option->only(['code', 'admin_label', 'swatch_value', 'sort_order']))
            ->mapWithKeys(fn ($value, $key) => ["{$prefix}.{$key}" => $value])
            ->all();
    }

    /**
     * คอลัมน์ `admin_label` ดิบๆ นี้ทำหน้าที่สองอย่าง คือเป็นค่า fallback
     * ที่โชว์เวลาไม่มี translation (ดู AttributeOption::adminLabel()) และ
     * เป็นค่าตรงๆ ที่ฝั่งเรียกซึ่งข้าม accessor ไปอ่านโดยตรง (เช่น
     * ProductPresenter ที่ใช้ `pluck('admin_label', ...)`) ต้องคอยทำให้
     * ค่านี้ตรงกับ locale ที่เป็นค่า default ของแอปอยู่เสมอ เหมือนกับที่
     * AttributeGroupController::resolveName() ทำ
     */
    private function resolveAdminLabel(array $translations, ?string $adminLabel): ?string
    {
        $defaultLocaleId = Locale::idForCode(config('app.locale'));

        if ($defaultLocaleId !== null && !empty(trim((string) ($translations[$defaultLocaleId] ?? '')))) {
            return trim($translations[$defaultLocaleId]);
        }

        $firstNonEmpty = collect($translations)->first(fn ($label) => is_string($label) && trim($label) !== '');
        if ($firstNonEmpty !== null) {
            return trim($firstNonEmpty);
        }

        return $adminLabel !== null && trim($adminLabel) !== '' ? trim($adminLabel) : null;
    }

    /**
     * ทำงานเหมือน AttributeController::autoTranslate() คือ pre-fill label
     * ให้อัตโนมัติ แต่จะอิงจากค่า flag "AI translate" ของ attribute แม่
     * เพราะ option เองไม่มี flag ของตัวเอง — option มีอยู่ได้ก็แค่ภายใต้
     * attribute เดียวเท่านั้น ดังนั้น flag นี้จึงเป็นจุดที่เหมาะสมให้แอดมิน
     * เลือกเปิดใช้งาน
     */
    private function autoTranslate(Attribute $attribute, AttributeOption $option, array $translations): void
    {
        if (!$attribute->is_ai_translate) {
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
            'attribute_options',
            $option->code,
            auth()->id(),
        );
    }

    /**
     * เลือกว่าจะแปลจาก locale ไหน จะพยายามใช้ locale default ของแอปก่อน
     * ถ้ามีค่ากรอกไว้ (ให้ priority เหมือนกับ resolveAdminLabel()) แต่ถ้า
     * ไม่มีก็จะ fallback ไปใช้ locale ไหนก็ได้ที่มี label อยู่ — เช่น
     * dialog quick-add-option ในหน้าแก้ไขสินค้าจะส่งมาแค่ locale ที่กำลัง
     * แก้อยู่ตอนนั้นเท่านั้น ซึ่งบ่อยครั้งไม่ใช่ locale default ของแอป
     * ถ้าบังคับให้ต้องมี locale default เท่านั้นจะทำให้ auto-translation
     * เงียบๆ ไม่ทำงานเลยสำหรับ option ที่เพิ่มผ่านทางนี้
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
