<?php

namespace App\Services\Catalog;

use App\Models\AttributeFamily;
use App\Models\AttributeFamilyTranslation;
use App\Models\AttributeGroup;
use App\Models\AttributeGroupTranslation;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\LazadaAttributeMapping;
use App\Models\LazadaCategoryAttribute;
use App\Models\Locale;
use App\Services\CodeGenerator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * "สร้าง/อัปเดต Attribute Family" ที่ section 2 ของ lazada-products.tsx (Object
 * Page ต่อสินค้า) — auto-generate ตระกูลแอตทริบิวต์จาก PIM attribute ที่แมปไว้แล้ว
 * กับ Lazada attribute ของ category นี้ แล้วผูกเข้ากับ PIM Category ผ่านกลไก
 * Category::attributeFamilies() ที่มีอยู่แล้ว (ใช้จริงอยู่แล้วที่หน้า Product
 * Group edit) — พอผูกเสร็จ ProductController::effectiveFamilyIds() (union
 * family ของทุก category ของสินค้า) จะเห็น family นี้เองทันที ฟิลด์โผล่ในหน้า
 * Edit Product โดยไม่ต้องแก้อะไรฝั่งนั้นเลย
 *
 * Mirror โครงสร้างเดียวกับ DefaultAttributeFamilyAssigner (bulk
 * attributeFamilies()->sync() service แยกจาก controller) และ
 * AttributeFamilyController::duplicate() (transaction + copy
 * family_attributes + audit log + bump list version) — ต่างกันตรงที่ตัวนี้
 * "generate จาก Lazada mapping" แทนที่จะ "copy จาก family อื่น" และผูกกับ
 * category ต่อท้าย (sort_order สูงสุด) แทนที่จะเป็นตัวแรก เพราะไม่ควรไปแทน
 * ตระกูล "เริ่มต้น" จริงของ category นั้น (sort_order 0 — ดู
 * DefaultAttributeFamilyAssigner's docblock)
 */
class LazadaAttributeFamilyGenerator
{
    // AttributeGroup โค้ดตายตัว ใช้ร่วมกันทุก Lazada-family ทุก category — ต้อง
    // reuse row เดิมเสมอ ไม่สร้างใหม่ทุกครั้งที่ sync เพราะ
    // ProductController::buildProductFormProps() group ฟิลด์ตาม AttributeGroup.id
    // จริง (ไม่ใช่ name/code) ถ้าสร้างซ้ำจะเห็นแท็บ "Lazada" ซ้ำกันหลายอันในหน้า
    // Edit Product ของสินค้าที่บังเอิญมีมากกว่าหนึ่ง Lazada-family ผูกอยู่
    private const GROUP_CODE = 'lazada';

    /**
     * @return array{family: AttributeFamily, attribute_count: int}
     */
    public function syncForCategory(Category $category): array
    {
        $lazadaCategoryId = $category->lazada_category_id;
        if (!$lazadaCategoryId) {
            throw new RuntimeException("Category '{$category->name}' is not mapped to a Lazada category yet.");
        }

        $attributeIds = $this->resolveMappedAttributeIds((int) $lazadaCategoryId);
        if ($attributeIds === []) {
            throw new RuntimeException('No PIM attribute is mapped to any Lazada attribute of this category yet — map at least one first.');
        }

        return DB::transaction(function () use ($category, $lazadaCategoryId, $attributeIds) {
            $group = $this->findOrCreateLazadaGroup();
            $family = $this->findOrCreateFamily($category, (int) $lazadaCategoryId);

            $this->replaceFamilyAttributes($family, $attributeIds, $group->id);
            $this->attachFamilyToCategory($category, $family->id);

            AttributeFamily::bumpListVersion();

            return ['family' => $family->fresh(), 'attribute_count' => count($attributeIds)];
        });
    }

    /**
     * PIM attribute_id ที่แมปไว้แล้ว (target_field='lazada_attribute') สำหรับ
     * ทุก Lazada attribute ของ category นี้ — เรียงตาม sort_order, ไม่ซ้ำ —
     * ตรงกับชุดเดียวกับที่ section 2 ของ lazada-products.tsx แสดงเป็น "mapped"
     */
    private function resolveMappedAttributeIds(int $lazadaCategoryId): array
    {
        // ดึงจาก lazada_category_attributes ไม่ใช่ lazada_attributes.category_id
        // ที่ deprecated แล้ว (ดู LazadaCategoryAttribute's docblock)
        $lazadaAttributeNames = LazadaCategoryAttribute::where('category_id', $lazadaCategoryId)->pluck('lazada_attribute_name');
        if ($lazadaAttributeNames->isEmpty()) {
            return [];
        }

        return LazadaAttributeMapping::where('target_field', 'lazada_attribute')
            ->whereIn('lazada_attribute_name', $lazadaAttributeNames)
            ->whereHas('attribute')
            ->with('attribute:id')
            ->orderBy('sort_order')
            ->get()
            ->pluck('attribute.id')
            ->unique()
            ->values()
            ->all();
    }

    private function findOrCreateLazadaGroup(): AttributeGroup
    {
        $group = AttributeGroup::firstOrCreate(
            ['code' => self::GROUP_CODE],
            ['name' => 'Lazada', 'platform' => 'lazada']
        );
        // ถ้าแถวนี้ถูกสร้างไว้ก่อนงาน platform-permission-split (ไม่มี platform
        // ตั้งไว้) ให้ backfill ให้ตรงด้วย — firstOrCreate() เองไม่ทำถ้าแถวมีอยู่แล้ว
        if ($group->platform !== 'lazada') {
            $group->update(['platform' => 'lazada']);
        }

        $this->setDefaultLocaleLabel(
            AttributeGroupTranslation::class,
            'attribute_group_id',
            $group->id,
            'Lazada'
        );

        return $group;
    }

    private function findOrCreateFamily(Category $category, int $lazadaCategoryId): AttributeFamily
    {
        $family = AttributeFamily::firstOrNew(['lazada_category_id' => $lazadaCategoryId]);
        $isNew = !$family->exists;

        if ($isNew) {
            // ตั้ง code/name แค่ตอนสร้างใหม่เท่านั้น — sync ซ้ำครั้งต่อไป (เช่น
            // แมป attribute เพิ่มแล้วกดปุ่มอีกที) ต้องไม่ไปทับชื่อที่แอดมินอาจแก้
            // เองแล้วจากหน้า Attribute Family edit (บั๊กจริงที่เจอจาก code
            // review: เดิมตั้ง name ทุกครั้งที่ sync ไม่ว่าจะสร้างใหม่หรือมีอยู่
            // แล้วก็ตาม)
            $family->code = CodeGenerator::sequential('attribute_families', 'lazada_family');
            $family->name = "Lazada — {$category->name}";

            try {
                $family->save();
            } catch (UniqueConstraintViolationException) {
                // แข่งกับ request อื่นที่ insert lazada_category_id เดียวกันไป
                // ก่อนแล้ว (บั๊กจริงที่เจอจาก code review: firstOrNew()+save()
                // ไม่ atomic กับ unique constraint บนคอลัมน์นี้ — ผู้ใช้เห็นเป็น
                // error 500 ดิบๆ แทนที่จะ idempotent ตามที่ตั้งใจ, controller
                // ดักจับแค่ RuntimeException เท่านั้น) — หยิบแถวที่ request อื่น
                // สร้างไว้มาใช้แทน ไม่ throw ต่อ
                $family = AttributeFamily::where('lazada_category_id', $lazadaCategoryId)->firstOrFail();
                $isNew = false;
            }
        }

        $this->setDefaultLocaleLabel(
            AttributeFamilyTranslation::class,
            'attribute_family_id',
            $family->id,
            $family->name
        );

        // ตอนสร้างใหม่ ($isNew) ไม่ต้อง log เอง — $family->save() ด้านบน (ใน
        // if ($isNew) block) ยิง 'created' อัตโนมัติผ่าน AttributeFamily's
        // Auditable trait อยู่แล้ว (บั๊กจริงที่เจอจาก code review: เดิม log
        // เองซ้ำอีกรอบตรงนี้ไม่ว่า $isNew หรือไม่ ทำให้ audit_logs มี 2 แถว
        // 'created' ซ้อนกันทุกครั้งที่สร้าง family ใหม่ — ยืนยันจากข้อมูลจริง
        // ในฐานข้อมูลแล้ว) — log เฉพาะกรณี re-sync (ไม่มี save() เกิดขึ้นเลย
        // ในเส้นทางนี้ เลยไม่มี event อัตโนมัติใดๆ ให้พึ่ง)
        if (!$isNew) {
            AuditLog::record('lazada_synced', $family, null, ['name' => $family->name]);
        }

        return $family;
    }

    /**
     * @param class-string<AttributeFamilyTranslation|AttributeGroupTranslation> $translationClass
     */
    private function setDefaultLocaleLabel(string $translationClass, string $foreignKey, int $ownerId, string $label): void
    {
        $defaultLocaleId = Locale::where('code', config('app.locale'))->value('id')
            ?? Locale::where('enabled', true)->orderBy('id')->value('id');

        if (!$defaultLocaleId) {
            return;
        }

        $translationClass::updateOrCreate(
            [$foreignKey => $ownerId, 'locale_id' => $defaultLocaleId],
            ['label' => $label]
        );
    }

    /**
     * Full-replace — same convention as AttributeFamilyController::update():
     * delete every existing row for this family then re-insert the current
     * set, rather than diffing. Keeps re-sync simple and correct even if
     * attributes were unmapped since the last sync.
     */
    private function replaceFamilyAttributes(AttributeFamily $family, array $attributeIds, int $groupId): void
    {
        $oldAttributeIds = FamilyAttribute::where('family_id', $family->id)
            ->orderBy('sort_order')
            ->pluck('attribute_id')
            ->all();

        FamilyAttribute::where('family_id', $family->id)->delete();

        $newAttributeIds = array_values($attributeIds);
        foreach ($newAttributeIds as $index => $attributeId) {
            FamilyAttribute::create([
                'family_id' => $family->id,
                'attribute_id' => $attributeId,
                'attribute_group_id' => $groupId,
                'sort_order' => $index,
            ]);
        }

        // FamilyAttribute เป็น Pivot ล้วนๆ ไม่ใช้ Auditable (ดู FamilyAttribute
        // model) แล้ว full delete+recreate ข้างบนนี้ก็ไม่ผ่าน Eloquent event
        // ปกติของ AttributeFamily ด้วย (แก้ pivot table ตรงๆ ไม่ใช่แก้
        // attribute ของ $family เอง) — ไม่ log เองตรงนี้ จะไม่มีร่องรอยเลยว่า
        // แต่ละครั้งที่กด sync มีการเพิ่ม/ลด attribute อะไรบ้าง จึง log เทียบ
        // ชุดก่อน/หลัง แต่แค่ตอนที่ต่างกันจริง (กัน noise จากการกด sync ซ้ำ
        // โดยไม่มีอะไรเปลี่ยน เหมือน pattern ที่ Auditable::updated() เช็ค
        // empty($changes) ก่อน log)
        if ($oldAttributeIds !== $newAttributeIds) {
            AuditLog::record(
                'lazada_family_attributes_synced',
                $family,
                ['attribute_ids' => $oldAttributeIds],
                ['attribute_ids' => $newAttributeIds]
            );
        }
    }

    /**
     * Mirrors DefaultAttributeFamilyAssigner::assignToAllProductGroups()'s
     * exact pattern (fetch existing ids, merge, rebuild sort_order for the
     * whole set, sync()) — but appends this family at the END instead of
     * the front, so it never displaces whichever family already sits at
     * sort_order 0 (the category's real "default family for new products").
     * This family is meant to be a pure editing-time addition, never the
     * default guess.
     */
    private function attachFamilyToCategory(Category $category, int $familyId): void
    {
        $existingIds = $category->attributeFamilies()->pluck('attribute_families.id')->all();
        $alreadyAttached = in_array($familyId, $existingIds, true);

        $orderedIds = $alreadyAttached
            ? $existingIds
            : array_values(array_merge($existingIds, [$familyId]));

        $pivotData = [];
        foreach ($orderedIds as $index => $id) {
            $pivotData[$id] = ['sort_order' => $index];
        }

        $category->attributeFamilies()->sync($pivotData);

        // category_attribute_family เป็น pivot table ล้วนๆ ผูกผ่าน ->sync()
        // ตรงๆ ไม่ผ่าน Eloquent model ใดๆ เลยไม่มี event ให้ Auditable trait
        // ทำงานให้ (ทั้ง Category และ AttributeFamily เอง Auditable ก็ตาม) —
        // log เองแค่ตอนผูกใหม่จริงๆ เท่านั้น ถ้า attach ไว้แล้วจากการ sync
        // ครั้งก่อน ($alreadyAttached) sort_order ของทุกแถวเหมือนเดิมทุก
        // ประการ ไม่มีอะไรเปลี่ยนที่ pivot เลย ไม่ log ซ้ำ
        if (!$alreadyAttached) {
            AuditLog::record('lazada_family_attached_to_category', $category, null, ['attribute_family_id' => $familyId]);
        }
    }
}
