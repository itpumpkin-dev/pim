<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Concerns\HasVersionHistory;
use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeFamilyTranslation;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Services\Catalog\DefaultAttributeFamilyAssigner;
use App\Services\CodeGenerator;
use App\Services\GridManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class AttributeFamilyController extends Controller
{
    use HasVersionHistory;

    /**
     * attribute ที่ไม่ควรถูกผูกเข้า group ไหนเลย — mirror ของ
     * ProductController::MASTER_CATEGORY_ATTRIBUTE_CODES/
     * PRODUCT_TYPE_ATTRIBUTE_CODE บวก producttype/price/qty (attribute
     * ควบคุมแกน variant ของสินค้า configurable) แก้คนละที่กันเพราะสอง
     * controller ไม่ได้ share constant กัน แต่ต้องอัปเดตพร้อมกันถ้ารายชื่อ
     * เปลี่ยน — ProductController มีแผงของตัวเองสำหรับ attribute พวกนี้แยกจาก
     * groupsData อยู่แล้ว (Master Categories panel / Product Type field /
     * variant price-qty) การให้ผูกเข้า family_attributes group เพิ่มอีกที
     * จะทำให้เห็นฟิลด์เดียวกันซ้ำสองที่ในหน้าแก้ไขสินค้า และ (ตั้งแต่
     * product_values มี attribute_group_id — migration
     * 2026_09_23_000001_add_attribute_group_id_to_product_values_table)
     * ทำให้ดีไซน์ "attribute พวกนี้ไม่มี group เสมอ = NULL sentinel" ที่โค้ด
     * หลายจุดพึ่งพาอยู่ (buildProductFormProps(), attributeValues() ฯลฯ)
     * ผิดไปด้วย
     */
    private const SYSTEM_ATTRIBUTE_CODES = ['pcatname', 'psubcatname', 'productgroupname', 'producttype', 'price', 'qty'];

    public function index(Request $request): Response
    {
        $grid = new GridManager('attribute_family_grid');

        // `name` เป็นคอลัมน์ fallback ที่ไม่ผูกกับภาษาไหนเป็นพิเศษ (ดู
        // accessor AttributeFamily::name()) — สิ่งที่ grid โชว์จริงๆ คือ
        // label ที่แปลแล้วของแต่ละ family ซึ่งอยู่ในตาราง translations
        // แยกต่างหาก ฟีเจอร์ search/filter ทั่วไปของ GridManager รู้แค่
        // วิธี LIKE-match กับคอลัมน์จริงเท่านั้น เลยต้องมาจัดการ match ด้วย
        // name ตรงนี้แทน โดยเอา block `filters.global` ใน
        // attribute_family_grid.yml ออกไปทั้งหมด (เพราะ GridManager จะเอา
        // search clause ของตัวเองมา AND กับสิ่งที่ closure นี้เพิ่มเข้าไป
        // ถ้ามี clause แคบๆ ที่ built-in ไว้แบบ `code` เท่านั้น มันจะกลืน
        // และทำลาย clause ที่กว้างกว่าด้านล่างนี้ไปเงียบๆ) แล้วก็ตัด
        // `name` ออกจาก input ของ per-column filters ก่อนที่ GridManager
        // จะเห็นมัน จากนั้นค่อยจัดการทั้งคู่ด้านล่างนี้กับทั้งคอลัมน์
        // fallback และตาราง translations
        $search = $request->input('search');
        // cast เป็น (array) — ดูคอมเมนต์ใน GridManager::getData() ประกอบ:
        // ถ้า query param `?filters=` ว่างเปล่า มันจะมาถึงตรงนี้เป็น null ตรงๆ
        $originalFilters = (array) $request->input('filters', []);
        $nameFilter = $originalFilters['name'] ?? null;

        if ($nameFilter !== null && $nameFilter !== '') {
            $request->merge(['filters' => collect($originalFilters)->except('name')->all()]);
        }

        $gridData = $grid->getData($request, function ($query) use ($search, $nameFilter) {
            if ($search) {
                $query->where(function ($q) use ($search) {
                    $q->where('code', 'ilike', "%{$search}%")
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
        });

        return Inertia::render('catalog/attribute-families/index', [
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

    public function create(): Response
    {
        $groups = AttributeGroup::select('id', 'code', 'name')->get();
        $attributes = Attribute::select('id', 'code', 'name', 'type')->whereNotIn('code', self::SYSTEM_ATTRIBUTE_CODES)->get();

        return Inertia::render('catalog/attribute-families/create', [
            'groups' => $groups,
            'attributes' => $attributes,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'group_attributes' => ['nullable', 'array'],
            'group_attributes.*.attribute_id' => ['required', 'exists:attributes,id', Rule::notIn(Attribute::whereIn('code', self::SYSTEM_ATTRIBUTE_CODES)->pluck('id'))],
            'group_attributes.*.attribute_group_id' => ['required', 'exists:attribute_groups,id'],
        ]);
        $this->guardAgainstDuplicateGroupAssignment($validator, $request);
        $validated = $validator->validate();

        $translations = $validated['translations'] ?? [];
        $name = $this->resolveName($translations, $validated['name'] ?? null);

        $family = CodeGenerator::createWithRetry('attribute_families', 'family', fn ($code) => AttributeFamily::create([
            'code' => $code,
            'name' => $name,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]));

        $this->syncTranslations($family, $translations);

        $newTranslations = $this->currentTranslations($family);
        if (!empty($newTranslations)) {
            AuditLog::record('labels_set', $family, null, $newTranslations);
        }

        if (!empty($validated['group_attributes'])) {
            foreach ($validated['group_attributes'] as $index => $item) {
                FamilyAttribute::create([
                    'family_id' => $family->id,
                    'attribute_id' => $item['attribute_id'],
                    'attribute_group_id' => $item['attribute_group_id'],
                    'sort_order' => $index,
                ]);
            }
        }

        $newAssignments = $this->familyAttributesSnapshot($family->id);
        if (!empty($newAssignments)) {
            AuditLog::record('attributes_set', $family, null, ['attributes' => $newAssignments]);
        }

        AttributeFamily::bumpListVersion();

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family created successfully.');
    }

    public function edit(AttributeFamily $attributeFamily): Response
    {
        $groups = AttributeGroup::select('id', 'code', 'name')->get();
        $attributes = Attribute::select('id', 'code', 'name', 'type')->whereNotIn('code', self::SYSTEM_ATTRIBUTE_CODES)->get();

        $familyAttributes = FamilyAttribute::with(['attribute', 'attributeGroup'])
            ->where('family_id', $attributeFamily->id)
            ->orderBy('sort_order')
            ->get();

        return Inertia::render('catalog/attribute-families/edit', [
            'family' => $attributeFamily->only(['id', 'code', 'name']),
            'translations' => $attributeFamily->translations()->get()
                ->mapWithKeys(fn (AttributeFamilyTranslation $t) => [(string) $t->locale_id => $t->label]),
            'groups' => $groups,
            'attributes' => $attributes,
            'familyAttributes' => $familyAttributes,
            'canViewHistory' => auth()->user()?->hasPermission('attribute_families', 'view_history') ?? false,
            'canAssignDefaultFamily' => auth()->user()?->hasPermission('attribute_families', 'assign_default_family') ?? false,
        ]);
    }

    public function history(AttributeFamily $attributeFamily): JsonResponse
    {
        return response()->json(['history' => $this->versionHistoryFor($attributeFamily)]);
    }

    public function update(Request $request, AttributeFamily $attributeFamily): RedirectResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['nullable', 'string', 'max:255'],
            'translations' => ['nullable', 'array'],
            'translations.*' => ['nullable', 'string', 'max:255'],
            'group_attributes' => ['nullable', 'array'],
            'group_attributes.*.attribute_id' => ['required', 'exists:attributes,id', Rule::notIn(Attribute::whereIn('code', self::SYSTEM_ATTRIBUTE_CODES)->pluck('id'))],
            'group_attributes.*.attribute_group_id' => ['required', 'exists:attribute_groups,id'],
        ]);
        $this->guardAgainstDuplicateGroupAssignment($validator, $request);
        $validated = $validator->validate();

        $translations = $validated['translations'] ?? [];
        $oldTranslations = $this->currentTranslations($attributeFamily);
        $oldAssignments = $this->familyAttributesSnapshot($attributeFamily->id);

        $attributeFamily->update([
            'name' => $this->resolveName($translations, $validated['name'] ?? null),
            'updated_by' => $request->user()?->id,
        ]);

        $this->syncTranslations($attributeFamily, $translations);

        $newTranslations = $this->currentTranslations($attributeFamily);
        if ($oldTranslations !== $newTranslations) {
            AuditLog::record('labels_updated', $attributeFamily, $oldTranslations, $newTranslations);
        }

        // ซิงก์ความสัมพันธ์ pivot ของ family_attributes ให้ตรงกับข้อมูลใหม่
        FamilyAttribute::where('family_id', $attributeFamily->id)->delete();

        if (!empty($validated['group_attributes'])) {
            foreach ($validated['group_attributes'] as $index => $item) {
                FamilyAttribute::create([
                    'family_id' => $attributeFamily->id,
                    'attribute_id' => $item['attribute_id'],
                    'attribute_group_id' => $item['attribute_group_id'],
                    'sort_order' => $index,
                ]);
            }
        }

        $newAssignments = $this->familyAttributesSnapshot($attributeFamily->id);
        if ($oldAssignments !== $newAssignments) {
            AuditLog::record('attributes_updated', $attributeFamily, ['attributes' => $oldAssignments], ['attributes' => $newAssignments]);
        }

        AttributeFamily::bumpListVersion();

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family updated successfully.');
    }

    /**
     * "Set as default for every product group" button on this page's edit
     * form — see DefaultAttributeFamilyAssigner for the shared logic (also
     * used by the `catalog:assign-default-family` artisan command). Always
     * overrides any product group's current default, never just fills in
     * empty ones — matches the CLI command's own default behavior.
     *
     * Gated on its own `attribute_families,assign_default_family` permission
     * (routes/catalog.php), separate from `edit_attribute_families` — this
     * mass-overwrites every product group's default at once, unlike editing
     * one family at a time.
     */
    public function setDefaultForAllGroups(AttributeFamily $attributeFamily, DefaultAttributeFamilyAssigner $assigner): RedirectResponse
    {
        $result = $assigner->assignToAllProductGroups($attributeFamily);

        if ($result['updated'] === 0) {
            return back()->with('success', "'{$attributeFamily->name}' was already the default for every product group.");
        }

        return back()->with('success', "Set '{$attributeFamily->name}' as the default attribute family for {$result['updated']} product group(s).");
    }

    /**
     * รายชื่อ "กลุ่มสินค้า" (leaf ระดับ 3 ของต้นไม้ categories — join เดียวกับ
     * ProductGroupController::index()) แบบค้นหา/แบ่งหน้าได้ พร้อม flag
     * is_default ต่อแถวว่าตระกูลนี้เป็นค่าเริ่มต้นของกลุ่มนั้นอยู่แล้วหรือยัง —
     * ให้ dialog "กำหนดค่าเริ่มต้นบางกลุ่มสินค้า" บนหน้าแก้ไขเรียกผ่าน fetch()
     * ไม่ใช้ Inertia::render() เพราะเป็นแค่ข้อมูลป้อน dialog บนหน้าเดิม ไม่ใช่
     * หน้าใหม่ทั้งหน้า
     */
    public function productGroupsForDefaultPicker(Request $request, AttributeFamily $attributeFamily): JsonResponse
    {
        $search = $request->input('search');
        $perPage = (int) $request->input('per_page', 15);
        if (! in_array($perPage, [10, 15, 25, 50], true)) {
            $perPage = 15;
        }

        $groups = Category::query()
            ->select('categories.*')
            ->join('categories as sub', 'categories.parent_id', '=', 'sub.id')
            ->join('categories as root', 'sub.parent_id', '=', 'root.id')
            ->whereNull('root.parent_id')
            ->with(['parent:id,name,parent_id', 'parent.parent:id,name', 'attributeFamilies:id'])
            ->when($search, function ($q) use ($search) {
                $q->where(function ($qq) use ($search) {
                    $qq->where('categories.code', 'ilike', "%{$search}%")
                        ->orWhere('categories.name', 'ilike', "%{$search}%")
                        ->orWhereHas('translations', fn ($tq) => $tq->where('label', 'ilike', "%{$search}%"));
                });
            })
            ->orderBy('root.name')
            ->orderBy('sub.name')
            ->orderBy('categories.name')
            ->paginate($perPage)
            ->withQueryString();

        $groups->getCollection()->transform(fn (Category $group) => [
            'id' => $group->id,
            'name' => $group->name,
            'subcategory_name' => $group->parent?->name,
            'category_name' => $group->parent?->parent?->name,
            // แถวแรกของ attributeFamilies (orderByPivot('sort_order') — ดู
            // Category::attributeFamilies()) คือ "ค่าเริ่มต้น" ปัจจุบันของกลุ่มนี้
            // เทียบตรรกะเดียวกับ DefaultAttributeFamilyAssigner
            'is_default' => $group->attributeFamilies->first()?->id === $attributeFamily->id,
        ]);

        return response()->json($groups);
    }

    /**
     * "กำหนดค่าเริ่มต้นบางกลุ่มสินค้า" — เหมือน setDefaultForAllGroups() ทุก
     * อย่างแต่จำกัดเฉพาะกลุ่มสินค้าที่เลือกไว้จาก picker เท่านั้น (ดู
     * DefaultAttributeFamilyAssigner::assignToProductGroups())
     */
    public function setDefaultForSelectedGroups(Request $request, AttributeFamily $attributeFamily, DefaultAttributeFamilyAssigner $assigner): RedirectResponse
    {
        $validated = $request->validate([
            'category_ids' => ['required', 'array', 'min:1'],
            'category_ids.*' => ['integer'],
        ]);

        // ต้องเป็นกลุ่มสินค้าจริงๆ (leaf ระดับ 3) เท่านั้น — กัน request ที่ยิง id
        // ของ category ระดับอื่น (root/subcategory) มาตรงๆ ข้าม UI ที่กรองไว้แล้ว
        $validCategoryIds = Category::query()
            ->join('categories as sub', 'categories.parent_id', '=', 'sub.id')
            ->join('categories as root', 'sub.parent_id', '=', 'root.id')
            ->whereNull('root.parent_id')
            ->whereIn('categories.id', $validated['category_ids'])
            ->pluck('categories.id')
            ->all();

        $result = $assigner->assignToProductGroups($attributeFamily, $validCategoryIds);

        if ($result['updated'] === 0) {
            return back()->with('success', "'{$attributeFamily->name}' was already the default for every selected product group.");
        }

        return back()->with('success', "Set '{$attributeFamily->name}' as the default attribute family for {$result['updated']} selected product group(s).");
    }

    /**
     * สร้างตระกูลแอตทริบิวต์ใหม่โดย copy จากตัวเดิม: name/คำแปลทุกภาษา และชุด
     * attribute ที่ผูกกับ group ต่างๆ (family_attributes) เหมือนกันหมด แต่ใช้
     * code ใหม่ที่ auto-generate ต่อท้ายด้วย "-copy" — เหมือนแพทเทิร์นเดียวกับ
     * ProductController::duplicate()'s "{sku}-copy" ทุกประการ ผู้ใช้ต้องไป
     * ตรวจสอบ/ปรับแก้ที่หน้า Edit เอง (ซึ่งจะพาไปที่นั่นต่อ)
     */
    public function duplicate(Request $request, AttributeFamily $attributeFamily): RedirectResponse
    {
        $duplicate = DB::transaction(function () use ($attributeFamily, $request) {
            $newFamily = CodeGenerator::createWithRetry(
                'attribute_families',
                $attributeFamily->code.'-copy',
                fn ($code) => AttributeFamily::create([
                    'code' => $code,
                    'name' => $attributeFamily->name,
                    'created_by' => $request->user()?->id,
                    'updated_by' => $request->user()?->id,
                ]),
            );

            foreach ($attributeFamily->translations()->get() as $translation) {
                AttributeFamilyTranslation::create([
                    'attribute_family_id' => $newFamily->id,
                    'locale_id' => $translation->locale_id,
                    'label' => $translation->label,
                ]);
            }

            foreach (FamilyAttribute::where('family_id', $attributeFamily->id)->get() as $familyAttribute) {
                FamilyAttribute::create([
                    'family_id' => $newFamily->id,
                    'attribute_id' => $familyAttribute->attribute_id,
                    'attribute_group_id' => $familyAttribute->attribute_group_id,
                    'sort_order' => $familyAttribute->sort_order,
                ]);
            }

            return $newFamily;
        });

        AuditLog::record('duplicated', $duplicate, null, [
            'duplicated_from_id' => $attributeFamily->id,
            'duplicated_from_code' => $attributeFamily->code,
        ]);

        AttributeFamily::bumpListVersion();

        return to_route('catalog.attributeFamilies.edit', $duplicate)
            ->with('success', "Duplicated as \"{$duplicate->code}\". Review and update before use.");
    }

    /**
     * 1 attribute อยู่ได้หลาย group ภายใน family เดียวกันแล้ว (ดู migration
     * 2026_09_22_000002_allow_same_family_multi_group_family_attributes) แต่
     * คู่ (attribute_id, attribute_group_id) เดียวกันเป๊ะๆ ห้ามซ้ำ — มี unique
     * constraint คุมไว้ที่ DB อยู่แล้ว แต่ปล่อยให้ FamilyAttribute::create()
     * ชนเองจะกลายเป็น raw exception (500) แทนที่จะเป็น validation error ที่
     * อ่านรู้เรื่อง เช็คตรงนี้ก่อนเพื่อให้ error friendly เหมือนจุดอื่นๆ ในฟอร์มนี้
     * (ปกติ frontend เองก็กันไม่ให้ส่งคู่ซ้ำอยู่แล้ว — นี่คือด่านสุดท้ายเผื่อ
     * request ยิงตรงมาที่ endpoint เอง ข้าม UI ไปเลย)
     */
    private function guardAgainstDuplicateGroupAssignment($validator, Request $request): void
    {
        $validator->after(function ($validator) use ($request) {
            $seenPairs = [];

            foreach ((array) $request->input('group_attributes', []) as $index => $item) {
                $attributeId = $item['attribute_id'] ?? null;
                $groupId = $item['attribute_group_id'] ?? null;
                if ($attributeId === null || $groupId === null) {
                    continue;
                }

                $pairKey = $attributeId.'-'.$groupId;
                if (isset($seenPairs[$pairKey])) {
                    $validator->errors()->add(
                        "group_attributes.{$index}.attribute_id",
                        'This attribute is already assigned to this same group.'
                    );

                    continue;
                }

                $seenPairs[$pairKey] = true;
            }
        });
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

        return $name ?? ($code !== null ? ucfirst($code) : 'Attribute Family');
    }

    /**
     * ดึง map locale_id => label ของ translation ปัจจุบันของ family
     * แบบสดๆ (ไม่ใช้ cache) — ใช้สำหรับ snapshot สถานะก่อน/หลัง เพื่อไปทำ
     * audit diff
     */
    private function currentTranslations(AttributeFamily $family): array
    {
        return $family->translations()->get()
            ->mapWithKeys(fn (AttributeFamilyTranslation $t) => [(string) $t->locale_id => $t->label])
            ->all();
    }

    /**
     * รายการ "attributeCode→groupCode" ของการจับคู่ attribute/group
     * ปัจจุบันของ family — ใช้สำหรับ snapshot สถานะก่อน/หลัง เพื่อไปทำ
     * audit diff
     */
    private function familyAttributesSnapshot(int $familyId): array
    {
        return FamilyAttribute::with(['attribute:id,code', 'attributeGroup:id,code'])
            ->where('family_id', $familyId)
            ->get()
            ->map(fn (FamilyAttribute $fa) => sprintf(
                '%s→%s',
                $fa->attribute->code ?? "attribute_{$fa->attribute_id}",
                $fa->attributeGroup->code ?? "group_{$fa->attribute_group_id}",
            ))
            ->sort()
            ->values()
            ->all();
    }

    private function syncTranslations(AttributeFamily $family, array $translations): void
    {
        foreach ($translations as $localeId => $label) {
            $label = is_string($label) ? trim($label) : '';

            if ($label === '') {
                AttributeFamilyTranslation::where('attribute_family_id', $family->id)
                    ->where('locale_id', $localeId)
                    ->delete();

                continue;
            }

            AttributeFamilyTranslation::updateOrCreate(
                ['attribute_family_id' => $family->id, 'locale_id' => $localeId],
                ['label' => $label]
            );
        }
    }

    /**
     * นับกลุ่มสินค้า/สินค้าที่กำลังใช้ตระกูลนี้อยู่ ให้หน้า index เรียกก่อนเปิด
     * ไดอะล็อกยืนยันลบ — category_attribute_family.family_id ผูก cascadeOnDelete
     * ไว้ (ดู migration create_category_attribute_family_table) ลบตระกูลปุ๊บ
     * ความผูกกับกลุ่มสินค้าเหล่านี้หายไปทันทีแบบเงียบๆ ไม่มี dialog เตือนอะไร
     * เลยก่อนนี้ — effectiveFamilyIds() ของสินค้าในกลุ่มนั้นก็จะไม่เห็นตระกูลนี้
     * อีกต่อไป (ค่า product_values ที่กรอกไว้ไม่ได้ถูกลบ แค่ไม่มี group ไหน
     * อ้างอิงให้แสดงในหน้าแก้ไขสินค้าอีกแล้ว) จำนวนสินค้านับจากกลุ่มสินค้าที่ผูกไว้
     * เท่านั้น (นิยามเดียวกับ effectiveFamilyIds()) ไม่ใช่จาก products.family_id
     * เดิมที่เป็น legacy column แล้ว
     */
    public function usage(AttributeFamily $attributeFamily): JsonResponse
    {
        $categoryIds = DB::table('category_attribute_family')
            ->where('family_id', $attributeFamily->id)
            ->pluck('category_id');

        $productCount = $categoryIds->isEmpty()
            ? 0
            : DB::table('product_category')
                ->whereIn('category_id', $categoryIds)
                ->distinct()
                ->count('product_id');

        return response()->json([
            'product_group_count' => $categoryIds->count(),
            'product_count' => $productCount,
        ]);
    }

    public function destroy(AttributeFamily $attributeFamily): RedirectResponse
    {
        FamilyAttribute::where('family_id', $attributeFamily->id)->delete();
        $attributeFamily->delete();

        AttributeFamily::bumpListVersion();

        return to_route('catalog.attributeFamilies.index')->with('success', 'Attribute Family deleted successfully.');
    }
}
