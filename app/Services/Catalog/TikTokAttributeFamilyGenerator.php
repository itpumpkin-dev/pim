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
use App\Models\TikTokAttributeMapping;
use App\Models\TikTokCategoryAttribute;
use App\Services\CodeGenerator;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Mirror ของ ShopeeAttributeFamilyGenerator เป๊ะ (รวมทุก fix ที่เจอจาก code
 * review ไว้ตั้งแต่ต้นแล้ว — ไม่ทับชื่อ family ที่แก้เอง, กัน race condition
 * ด้วย UniqueConstraintViolationException, ไม่ log ซ้ำตอนสร้างใหม่, log ให้
 * pivot ทั้งสองจุด) — ดู ShopeeAttributeFamilyGenerator's docblock สำหรับ
 * เหตุผลเต็มๆ ต่างกันแค่:
 *  - `GROUP_CODE`/`platform` = 'tiktok' แทน 'shopee'
 *  - จับคู่ด้วย `tiktok_category_id` แทน `shopee_category_id`
 *  - resolveMappedAttributeIds() join ผ่าน TikTokAttribute.id (string) แทน
 *    ShopeeAttribute.id (ตัวเลข)
 */
class TikTokAttributeFamilyGenerator
{
    private const GROUP_CODE = 'tiktok';

    /**
     * @return array{family: AttributeFamily, attribute_count: int}
     */
    public function syncForCategory(Category $category): array
    {
        $tiktokCategoryId = $category->tiktok_category_id;
        if (!$tiktokCategoryId) {
            throw new RuntimeException("Category '{$category->name}' is not mapped to a TikTok category yet.");
        }

        $attributeIds = $this->resolveMappedAttributeIds((int) $tiktokCategoryId);
        if ($attributeIds === []) {
            throw new RuntimeException('No PIM attribute is mapped to any TikTok attribute of this category yet — map at least one first.');
        }

        return DB::transaction(function () use ($category, $tiktokCategoryId, $attributeIds) {
            $group = $this->findOrCreateTikTokGroup();
            $family = $this->findOrCreateFamily($category, (int) $tiktokCategoryId);

            $this->replaceFamilyAttributes($family, $attributeIds, $group->id);
            $this->attachFamilyToCategory($category, $family->id);

            AttributeFamily::bumpListVersion();

            return ['family' => $family->fresh(), 'attribute_count' => count($attributeIds)];
        });
    }

    /**
     * PIM attribute_id ที่แมปไว้แล้ว (target_field='tiktok_attribute') สำหรับ
     * ทุก TikTok attribute ของ category นี้ — เรียงตาม sort_order, ไม่ซ้ำ
     */
    private function resolveMappedAttributeIds(int $tiktokCategoryId): array
    {
        // มาจาก tiktok_category_attributes เสมอตอนนี้ (ไม่ใช่ tiktok_attributes.
        // category_id ที่ deprecated แล้ว — ดู TikTokCategoryAttribute's docblock)
        $tiktokAttributeIds = TikTokCategoryAttribute::where('category_id', $tiktokCategoryId)->pluck('tiktok_attribute_id');
        if ($tiktokAttributeIds->isEmpty()) {
            return [];
        }

        return TikTokAttributeMapping::where('target_field', 'tiktok_attribute')
            ->whereIn('tiktok_attribute_id', $tiktokAttributeIds)
            ->whereHas('attribute')
            ->with('attribute:id')
            ->orderBy('sort_order')
            ->get()
            ->pluck('attribute.id')
            ->unique()
            ->values()
            ->all();
    }

    private function findOrCreateTikTokGroup(): AttributeGroup
    {
        $group = AttributeGroup::firstOrCreate(
            ['code' => self::GROUP_CODE],
            ['name' => 'TikTok', 'platform' => 'tiktok']
        );
        if ($group->platform !== 'tiktok') {
            $group->update(['platform' => 'tiktok']);
        }

        $this->setDefaultLocaleLabel(
            AttributeGroupTranslation::class,
            'attribute_group_id',
            $group->id,
            'TikTok'
        );

        return $group;
    }

    private function findOrCreateFamily(Category $category, int $tiktokCategoryId): AttributeFamily
    {
        $family = AttributeFamily::firstOrNew(['tiktok_category_id' => $tiktokCategoryId]);
        $isNew = !$family->exists;

        if ($isNew) {
            $family->code = CodeGenerator::sequential('attribute_families', 'tiktok_family');
            $family->name = "TikTok — {$category->name}";

            try {
                $family->save();
            } catch (UniqueConstraintViolationException) {
                $family = AttributeFamily::where('tiktok_category_id', $tiktokCategoryId)->firstOrFail();
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
            AuditLog::record('tiktok_synced', $family, null, ['name' => $family->name]);
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
                'tiktok_family_attributes_synced',
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
            AuditLog::record('tiktok_family_attached_to_category', $category, null, ['attribute_family_id' => $familyId]);
        }
    }
}
