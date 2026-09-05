<?php

namespace App\Services\Catalog;

use App\Models\AttributeFamily;
use App\Models\Category;

/**
 * Shared logic behind "set this attribute family as the default for every
 * product group" — used by both `catalog:assign-default-family` (CLI) and
 * AttributeFamilyController::setDefaultForAllGroups() (the button on the
 * Attribute Family edit page), so the two stay in lockstep instead of
 * drifting into two slightly different implementations.
 *
 * There is no `is_default` column anywhere on `attribute_families` or on
 * the `category_attribute_family` pivot — "default" is purely positional:
 * whichever family sits at sort_order 0 (see Category::attributeFamilies(),
 * ordered by pivot sort_order), the same convention
 * ProductGroupController's edit page relies on for its "ค่าเริ่มต้น" badge
 * (only ever shown on index 0).
 *
 * Scoped to product groups using the exact same depth-3 join
 * ProductGroupController::index() uses (a `categories` row whose parent is
 * a subcategory whose parent is a real root, i.e. root.parent_id is null)
 * — not a stored "depth" column.
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
        }

        return ['updated' => $updated, 'skipped' => $skipped];
    }
}
