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
use App\Models\WooCommerceAttributeMapping;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * "สร้าง/อัปเดต Attribute Family" ของ Section 2 ที่ woocommerce-products.tsx
 * (Object Page ต่อสินค้า) — mirror ของ LazadaAttributeFamilyGenerator/
 * ShopeeAttributeFamilyGenerator/TikTokAttributeFamilyGenerator แต่ต่างกัน
 * ตรงจุดสำคัญหนึ่งจุด: WooCommerce ไม่มี category-attribute schema เลย
 * (WooCommerceAttribute เป็น global ทั้งร้าน ไม่ผูกกับ category — ดู
 * WooCommerceAttributeMappingController's docblock) ดังนั้นจึงไม่มี "1
 * marketplace category = 1 family" แบบ 3 ตัวเดิม — แทนที่ด้วย "1 ร้าน = 1
 * family" (ทุก PIM attribute ที่แมปไว้กับ target_field='wc_attribute' ตัวไหน
 * ก็ตาม รวมกันเป็น family เดียวของทั้งระบบ) แล้วผูก family ตัวนั้นเข้ากับ PIM
 * Category ที่กำลังดูอยู่ (เหมือน 3 ตัวเดิม) เพื่อให้ฟิลด์โผล่ในหน้า Edit
 * Product ของสินค้าในหมวดหมู่นั้นทันที — เรียก syncForCategory() ซ้ำจาก
 * หมวดหมู่อื่นๆ ก็แค่ผูก family เดียวกันนี้เพิ่มเข้าไปอีก ไม่สร้างซ้ำ
 *
 * ตัวนี้เอง (LazadaAttributeFamilyGenerator ก็เช่นกัน) แค่จัดกลุ่มของที่แมปไว้
 * แล้วเท่านั้น ไม่รู้จักสร้าง PIM Attribute ใหม่ — ส่วน auto-create ให้
 * WooCommerce attribute ที่ยังไม่มีใครแมปเลยเป็นหน้าที่ของ
 * WooCommerceMappedAttributeCreator แยกไฟล์ต่างหาก (mirror ของ
 * LazadaMappedAttributeCreator) เรียกก่อนตัวนี้เสมอจาก
 * WooCommerceAttributeMappingController::syncAttributeFamily()
 */
class WooCommerceAttributeFamilyGenerator
{
    // Attribute Group ใช้ร่วมกันทุกครั้งที่ sync — เหตุผลเดียวกับ
    // LazadaAttributeFamilyGenerator::GROUP_CODE (ProductController::
    // buildProductFormProps() group ฟิลด์ตาม AttributeGroup.id จริง)
    private const GROUP_CODE = 'woocommerce';

    // attribute_families.code มี unique constraint อยู่แล้วตั้งแต่ต้น (ดู
    // migration create_attribute_families_table) — ใช้ค่าคงที่นี้เป็น
    // idempotent lookup key ได้ตรงๆ โดยไม่ต้องเพิ่ม column ใหม่แบบ
    // lazada_category_id/shopee_category_id/tiktok_category_id เพราะ
    // WooCommerce มี family เดียวเท่านั้นทั้งระบบ ไม่ต้องแยกต่อ category
    private const FAMILY_CODE = 'woocommerce_family';

    private const FAMILY_NAME = 'WooCommerce';

    /**
     * @return array{family: AttributeFamily, attribute_count: int}
     */
    public function syncForCategory(Category $category): array
    {
        $attributeIds = $this->resolveMappedAttributeIds();
        if ($attributeIds === []) {
            throw new RuntimeException('No PIM attribute is mapped to a WooCommerce attribute yet — map at least one first.');
        }

        return DB::transaction(function () use ($category, $attributeIds) {
            $group = $this->findOrCreateWooCommerceGroup();
            $family = $this->findOrCreateFamily();

            $this->replaceFamilyAttributes($family, $attributeIds, $group->id);
            $this->attachFamilyToCategory($category, $family->id);

            AttributeFamily::bumpListVersion();

            return ['family' => $family->fresh(), 'attribute_count' => count($attributeIds)];
        });
    }

    /**
     * PIM attribute_id ที่แมปไว้แล้ว (target_field='wc_attribute') ทั้งหมด —
     * ไม่กรองตาม category เลยเพราะ WooCommerce attribute เป็น global ตรงกับ
     * ชุดเดียวกับที่ Section 2 ของ woocommerce-products.tsx แสดงเป็น "mapped"
     * ไม่ว่าจะเปิดดูสินค้า/หมวดหมู่ไหนก็ตาม
     */
    private function resolveMappedAttributeIds(): array
    {
        return WooCommerceAttributeMapping::where('target_field', 'wc_attribute')
            ->whereHas('attribute')
            ->with('attribute:id')
            ->orderBy('sort_order')
            ->get()
            ->pluck('attribute.id')
            ->unique()
            ->values()
            ->all();
    }

    private function findOrCreateWooCommerceGroup(): AttributeGroup
    {
        $group = AttributeGroup::firstOrCreate(
            ['code' => self::GROUP_CODE],
            ['name' => self::FAMILY_NAME, 'platform' => 'woocommerce']
        );
        if ($group->platform !== 'woocommerce') {
            $group->update(['platform' => 'woocommerce']);
        }

        $this->setDefaultLocaleLabel(
            AttributeGroupTranslation::class,
            'attribute_group_id',
            $group->id,
            self::FAMILY_NAME
        );

        return $group;
    }

    private function findOrCreateFamily(): AttributeFamily
    {
        $family = AttributeFamily::firstOrNew(['code' => self::FAMILY_CODE]);
        $isNew = !$family->exists;

        if ($isNew) {
            $family->name = self::FAMILY_NAME;

            try {
                // Nested DB::transaction() (SAVEPOINT) — required under
                // Postgres for the catch below to be safe at all; see
                // LazadaAttributeFamilyGenerator::findOrCreateFamily()'s
                // docblock for why.
                DB::transaction(fn () => $family->save());
            } catch (UniqueConstraintViolationException) {
                // แข่งกับ request อื่นที่สร้างแถวนี้ไปก่อนแล้ว — เหตุผลเดียวกับ
                // LazadaAttributeFamilyGenerator::findOrCreateFamily()
                $family = AttributeFamily::where('code', self::FAMILY_CODE)->firstOrFail();
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
            AuditLog::record('woocommerce_synced', $family, null, ['name' => $family->name]);
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
     * Full-replace — same convention as LazadaAttributeFamilyGenerator::
     * replaceFamilyAttributes(): delete every existing row for this family
     * then re-insert the current set, rather than diffing.
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

        if ($oldAttributeIds !== $newAttributeIds) {
            AuditLog::record(
                'woocommerce_family_attributes_synced',
                $family,
                ['attribute_ids' => $oldAttributeIds],
                ['attribute_ids' => $newAttributeIds]
            );
        }
    }

    /**
     * Mirrors LazadaAttributeFamilyGenerator::attachFamilyToCategory() exactly
     * — appends at the end so it never displaces whichever family already
     * sits at sort_order 0 (the category's real "default family").
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

        if (!$alreadyAttached) {
            AuditLog::record('woocommerce_family_attached_to_category', $category, null, ['attribute_family_id' => $familyId]);
        }
    }
}
