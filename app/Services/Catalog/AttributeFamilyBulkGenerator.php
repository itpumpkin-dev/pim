<?php

namespace App\Services\Catalog;

use App\Models\AttributeFamily;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\FamilyAttribute;
use App\Services\CodeGenerator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Bulk-creates one Attribute Family per selected Product Group (leaf
 * Category), named from a user-supplied pattern (e.g. "สเปค-{name}"), and
 * binds each new family to its Product Group — the same job a user would
 * otherwise repeat by hand via Create Attribute Family + the "assign default
 * family" picker, once per Product Group. Used by
 * AttributeFamilyController::bulkGenerate().
 *
 * A Product Group almost always already has at least one family bound (a
 * "default" one assigned earlier) — this ADDS the newly generated family
 * alongside whatever's already there rather than requiring the group to
 * start empty. It always appends at the *end* of the group's family list
 * (never sort_order 0), the same convention the Lazada/Shopee/TikTok/
 * WooCommerce family generators use (see e.g.
 * LazadaAttributeFamilyGenerator::attachFamilyToCategory()) — so it never
 * silently displaces whichever family the group already treats as its
 * default.
 */
class AttributeFamilyBulkGenerator
{
    /**
     * @param  array<int, int>  $categoryIds  must already be validated as real, depth-3 leaf category ids
     * @return array{created: int}
     */
    public function generate(array $categoryIds, string $namePattern, ?AttributeFamily $template, ?int $userId): array
    {
        if (empty($categoryIds)) {
            return ['created' => 0];
        }

        $created = 0;

        $groups = Category::whereIn('id', $categoryIds)
            ->with('attributeFamilies:id')
            ->orderBy('id')
            ->get();

        foreach ($groups as $group) {
            DB::transaction(function () use ($group, $namePattern, $template, $userId) {
                $name = str_replace('{name}', $group->name, $namePattern);

                $newFamily = CodeGenerator::createWithRetry(
                    'attribute_families',
                    Str::slug($group->code, '_') ?: 'family',
                    fn ($code) => AttributeFamily::create([
                        'code' => $code,
                        'name' => $name,
                        'created_by' => $userId,
                        'updated_by' => $userId,
                    ]),
                );

                if ($template) {
                    foreach (FamilyAttribute::where('family_id', $template->id)->get() as $familyAttribute) {
                        FamilyAttribute::create([
                            'family_id' => $newFamily->id,
                            'attribute_id' => $familyAttribute->attribute_id,
                            'attribute_group_id' => $familyAttribute->attribute_group_id,
                            'sort_order' => $familyAttribute->sort_order,
                        ]);
                    }
                }

                $this->appendFamilyToCategory($group, $newFamily->id);

                AuditLog::record('generated_from_product_group', $newFamily, null, [
                    'category_id' => $group->id,
                    'category_name' => $group->name,
                    'template_family_id' => $template?->id,
                ]);
            });

            $created++;
        }

        AttributeFamily::bumpListVersion();

        return ['created' => $created];
    }

    /**
     * Appends $familyId after every family the group already has — mirrors
     * each marketplace generator's own attachFamilyToCategory() (see
     * LazadaAttributeFamilyGenerator) so a group's existing default (whatever
     * sits at sort_order 0) is never displaced.
     */
    private function appendFamilyToCategory(Category $group, int $familyId): void
    {
        $existingIds = $group->attributeFamilies()->pluck('attribute_families.id')->all();
        $orderedIds = array_values(array_unique(array_merge($existingIds, [$familyId])));

        $pivotData = [];
        foreach ($orderedIds as $index => $id) {
            $pivotData[$id] = ['sort_order' => $index];
        }

        $group->attributeFamilies()->sync($pivotData);
    }
}
