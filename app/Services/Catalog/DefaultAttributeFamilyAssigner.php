<?php

namespace App\Services\Catalog;

use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use Illuminate\Support\Collection;

/**
 * Shared logic behind "set this attribute family as the default for every /
 * some product group(s)" — used by `catalog:assign-default-family` (CLI),
 * AttributeFamilyController::setDefaultForAllGroups() ("ตั้งเป็นค่าเริ่มต้นให้
 * ทุกกลุ่มสินค้า" บนหน้าแก้ไข Attribute Family), and
 * AttributeFamilyController::setDefaultForSelectedGroups() ("กำหนดค่าเริ่มต้น
 * บางกลุ่มสินค้า" — เลือกจาก picker) เพื่อให้ทั้งสามที่นี้ใช้ตรรกะเดียวกันเป๊ะๆ
 * ไม่มีวันเบี้ยวกันเอง
 *
 * There is no `is_default` column anywhere on `attribute_families` or on
 * the `category_attribute_family` pivot — "default" is purely positional:
 * whichever family sits at sort_order 0 (see Category::attributeFamilies(),
 * ordered by pivot sort_order), the same convention
 * ProductGroupController's edit page relies on for its "ค่าเริ่มต้น" badge
 * (only ever shown on index 0).
 *
 * "ทุกกลุ่มสินค้า" ใช้ depth-3 join เดียวกับ ProductGroupController::index()
 * (categories row ที่ parent เป็น subcategory ซึ่ง parent เป็น root จริงๆ —
 * root.parent_id เป็น null) ไม่มีคอลัมน์ "depth" เก็บไว้ตรงๆ
 */
class DefaultAttributeFamilyAssigner
{
    /**
     * @return array{updated: int, skipped: int}
     */
    public function assignToAllProductGroups(AttributeFamily $family, bool $onlyEmpty = false, bool $dryRun = false): array
    {
        $groups = Category::query()
            ->select('categories.*')
            ->join('categories as sub', 'categories.parent_id', '=', 'sub.id')
            ->join('categories as root', 'sub.parent_id', '=', 'root.id')
            ->whereNull('root.parent_id')
            ->with('attributeFamilies:id')
            ->orderBy('categories.id')
            ->get();

        return $this->assignToGroups($groups, $family, $onlyEmpty, $dryRun);
    }

    /**
     * เหมือน assignToAllProductGroups() ทุกอย่าง แค่จำกัดเฉพาะกลุ่มสินค้าที่
     * เลือกไว้ ($categoryIds) แทนที่จะเป็นทุกกลุ่มในระบบ — ไม่เช็คซ้ำว่าแต่ละ id
     * เป็นกลุ่มสินค้า (leaf ระดับ 3) จริงหรือไม่ ผู้เรียกต้อง validate มาก่อนแล้ว
     * (ดู AttributeFamilyController::setDefaultForSelectedGroups())
     *
     * @param  array<int, int>  $categoryIds
     * @return array{updated: int, skipped: int}
     */
    public function assignToProductGroups(AttributeFamily $family, array $categoryIds, bool $onlyEmpty = false, bool $dryRun = false): array
    {
        if (empty($categoryIds)) {
            return ['updated' => 0, 'skipped' => 0];
        }

        $groups = Category::whereIn('id', $categoryIds)
            ->with('attributeFamilies:id')
            ->orderBy('id')
            ->get();

        return $this->assignToGroups($groups, $family, $onlyEmpty, $dryRun);
    }

    /**
     * @param  Collection<int, Category>  $groups
     * @return array{updated: int, skipped: int}
     */
    private function assignToGroups(Collection $groups, AttributeFamily $family, bool $onlyEmpty, bool $dryRun): array
    {
        $updated = 0;
        $skipped = 0;

        foreach ($groups as $group) {
            $existingIds = $group->attributeFamilies->pluck('id')->all();

            if ($onlyEmpty && count($existingIds) > 0) {
                $skipped++;

                continue;
            }

            if (($existingIds[0] ?? null) === $family->id) {
                // Already the default here — nothing to change.
                $skipped++;

                continue;
            }

            $updated++;

            if ($dryRun) {
                continue;
            }

            // Chosen family goes first (sort_order 0); keep any other
            // families the group already had, just pushed after it.
            $orderedIds = array_values(array_unique(array_merge([$family->id], $existingIds)));

            $pivotData = [];
            foreach ($orderedIds as $index => $familyId) {
                $pivotData[$familyId] = ['sort_order' => $index];
            }
            $group->attributeFamilies()->sync($pivotData);

            // ->sync() never fires Category's own model events, and this one
            // action can silently overwrite the default family for every
            // product group in the catalog at once — log each affected group
            // individually (same event name ProductGroupController::
            // syncAttributeFamilies() logs for a manual single-group edit),
            // so it shows up on that group's own History tab too.
            AuditLog::record('attribute_families_updated', $group, ['family_ids' => $existingIds], ['family_ids' => $orderedIds]);
        }

        return ['updated' => $updated, 'skipped' => $skipped];
    }
}
