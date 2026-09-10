<?php

namespace App\Services\Catalog;

use App\Models\AttributeFamily;
use App\Models\AttributeFamilyTranslation;
use App\Models\AttributeGroup;
use App\Models\AttributeGroupTranslation;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Models\Locale;
use App\Models\ShopeeAttributeMapping;
use App\Models\ShopeeCategoryAttribute;
use App\Services\CodeGenerator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Mirror ของ LazadaAttributeFamilyGenerator เป๊ะ (รวมทุก fix ที่เจอจาก code
 * review รอบก่อนไว้ตั้งแต่ต้นแล้ว — ไม่ทับชื่อ family ที่แก้เอง, กัน race
 * condition ด้วย UniqueConstraintViolationException, ไม่ log ซ้ำตอนสร้างใหม่,
 * log ให้ pivot ทั้งสองจุด) — ดู LazadaAttributeFamilyGenerator's docblock
 * สำหรับเหตุผลเต็มๆ ต่างกันแค่:
 *  - `GROUP_CODE`/`platform` = 'shopee' แทน 'lazada'
 *  - จับคู่ด้วย `shopee_category_id` แทน `lazada_category_id`
 *  - resolveMappedAttributeIds() join ผ่าน ShopeeAttribute.id (ตัวเลข) แทน
 *    LazadaAttribute.name (string)
 */
class ShopeeAttributeFamilyGenerator
{
    // AttributeGroup โค้ดตายตัว ใช้ร่วมกันทุก Shopee-family ทุก category —
    // เหตุผลเดียวกับ LazadaAttributeFamilyGenerator::GROUP_CODE
    private const GROUP_CODE = 'shopee';

    /**
     * @return array{family: AttributeFamily, attribute_count: int}
     */
    public function syncForCategory(Category $category): array
    {
        $shopeeCategoryId = $category->shopee_category_id;
        if (!$shopeeCategoryId) {
            throw new RuntimeException("Category '{$category->name}' is not mapped to a Shopee category yet.");
        }

        $attributeIds = $this->resolveMappedAttributeIds((int) $shopeeCategoryId);
        if ($attributeIds === []) {
            throw new RuntimeException('No PIM attribute is mapped to any Shopee attribute of this category yet — map at least one first.');
        }

        return DB::transaction(function () use ($category, $shopeeCategoryId, $attributeIds) {
            $group = $this->findOrCreateShopeeGroup();
            $family = $this->findOrCreateFamily($category, (int) $shopeeCategoryId);

            $this->replaceFamilyAttributes($family, $attributeIds, $group->id);
            $this->attachFamilyToCategory($category, $family->id);

            AttributeFamily::bumpListVersion();

            return ['family' => $family->fresh(), 'attribute_count' => count($attributeIds)];
        });
    }

    /**
     * PIM attribute_id ที่แมปไว้แล้ว (target_field='shopee_attribute') สำหรับ
     * ทุก Shopee attribute ของ category นี้ — เรียงตาม sort_order, ไม่ซ้ำ
     */
    private function resolveMappedAttributeIds(int $shopeeCategoryId): array
    {
        // ดู ShopeeCategoryAttribute's docblock — attribute ไหนอยู่ในหมวดหมู่นี้
        // บ้าง มาจากตารางนี้เสมอตอนนี้ ไม่ใช่ shopee_attributes.category_id
        // ที่ deprecated แล้ว
        $shopeeAttributeIds = ShopeeCategoryAttribute::where('category_id', $shopeeCategoryId)->pluck('shopee_attribute_id');
        if ($shopeeAttributeIds->isEmpty()) {
            return [];
        }

        return ShopeeAttributeMapping::where('target_field', 'shopee_attribute')
            ->whereIn('shopee_attribute_id', $shopeeAttributeIds)
            ->whereHas('attribute')
            ->with('attribute:id')
            ->orderBy('sort_order')
            ->get()
            ->pluck('attribute.id')
            ->unique()
            ->values()
            ->all();
    }

    private function findOrCreateShopeeGroup(): AttributeGroup
    {
        $group = AttributeGroup::firstOrCreate(
            ['code' => self::GROUP_CODE],
            ['name' => 'Shopee', 'platform' => 'shopee']
        );
        if ($group->platform !== 'shopee') {
            $group->update(['platform' => 'shopee']);
        }

        $this->setDefaultLocaleLabel(
            AttributeGroupTranslation::class,
            'attribute_group_id',
            $group->id,
            'Shopee'
        );

        return $group;
    }

    private function findOrCreateFamily(Category $category, int $shopeeCategoryId): AttributeFamily
    {
        $family = AttributeFamily::firstOrNew(['shopee_category_id' => $shopeeCategoryId]);
        $isNew = !$family->exists;

        if ($isNew) {
            $family->code = CodeGenerator::sequential('attribute_families', 'shopee_family');
            $family->name = "Shopee — {$category->name}";

            try {
                $family->save();
            } catch (UniqueConstraintViolationException) {
                $family = AttributeFamily::where('shopee_category_id', $shopeeCategoryId)->firstOrFail();
                $isNew = false;
            }
        }

        $this->setDefaultLocaleLabel(
            AttributeFamilyTranslation::class,
            'attribute_family_id',
            $family->id,
            $family->name
        );

        if (!$isNew) {
            AuditLog::record('shopee_synced', $family, null, ['name' => $family->name]);
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

        if ($oldAttributeIds !== $newAttributeIds) {
            AuditLog::record(
                'shopee_family_attributes_synced',
                $family,
                ['attribute_ids' => $oldAttributeIds],
                ['attribute_ids' => $newAttributeIds]
            );
        }
    }

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

        if (!$alreadyAttached) {
            AuditLog::record('shopee_family_attached_to_category', $category, null, ['attribute_family_id' => $familyId]);
        }
    }
}
