<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Shared "Attribute Access" permission checks — whether a user's role can
 * view/edit a given Attribute Group or individual Attribute. Extracted from
 * ProductController (still the canonical place these rules were designed
 * for — the product edit page) so the same rules can gate other surfaces
 * that expose attribute values outside that page, e.g. bulk product
 * import/export columns.
 */
class AttributeAccessPolicy
{
    /**
     * Uses permission format: 'view_attribute_groups.view_{group_code}'.
     * If a role has never touched the "Attribute Access" section at all (no
     * rows for this resource), access is granted by default — backward
     * compatible with every role that predates this permission.
     */
    public function canViewGroup(?User $user, AttributeGroup $group): bool
    {
        if (!$user) {
            return true;
        }

        if (!$user->hasAnyPermissionForResource('view_attribute_groups')) {
            return true;
        }

        return $user->hasPermission('view_attribute_groups', "view_{$group->code}");
    }

    /**
     * Uses permission format: 'view_attributes.view_{attribute_code}'. Same
     * "untouched resource = default allow" fallback as canViewGroup().
     */
    public function canViewAttribute(?User $user, Attribute $attribute): bool
    {
        if (!$user) {
            return true;
        }

        if (!$user->hasAnyPermissionForResource('view_attributes')) {
            return true;
        }

        return $user->hasPermission('view_attributes', "view_{$attribute->code}");
    }

    /**
     * Always a subset of view access. Falls back to "editable" only when the
     * role hasn't touched attribute group access AT ALL (no view rows
     * either) — a role given Read-only access (view rows exist, but no Edit
     * was ever checked) has zero edit_attribute_groups rows too, which would
     * wrongly fall back to "editable" if that resource were checked alone.
     */
    public function canEditGroup(?User $user, AttributeGroup $group): bool
    {
        if (!$this->canViewGroup($user, $group)) {
            return false;
        }

        if (!$user) {
            return true;
        }

        if (!$user->hasAnyPermissionForResource('view_attribute_groups') && !$user->hasAnyPermissionForResource('edit_attribute_groups')) {
            return true;
        }

        return $user->hasPermission('edit_attribute_groups', "edit_{$group->code}");
    }

    /**
     * Same "touched at all" fallback as canEditGroup() above.
     */
    public function canEditAttribute(?User $user, Attribute $attribute): bool
    {
        if (!$this->canViewAttribute($user, $attribute)) {
            return false;
        }

        if (!$user) {
            return true;
        }

        if (!$user->hasAnyPermissionForResource('view_attributes') && !$user->hasAnyPermissionForResource('edit_attributes')) {
            return true;
        }

        return $user->hasPermission('edit_attributes', "edit_{$attribute->code}");
    }

    /**
     * An attribute's group membership is per-family (family_attributes.
     * attribute_group_id), not fixed on the attribute itself — the same
     * attribute can sit in an allowed group for one family and a restricted
     * one for another. A bulk export/import isn't scoped to a single family,
     * so this asks the conservative version of the question: is $attribute
     * viewable considering *every* family it's assigned to? One restricted
     * group anywhere is enough to exclude it — consistent with treating
     * "any restriction configured" as the safer default everywhere else
     * this permission is enforced.
     *
     * @param  callable(?User, Attribute): bool  $attributeCheck  canViewAttribute or canEditAttribute
     * @param  callable(?User, AttributeGroup): bool  $groupCheck  canViewGroup or canEditGroup
     */
    private function acrossFamilies(?User $user, Attribute $attribute, callable $attributeCheck, callable $groupCheck): bool
    {
        if (!$attributeCheck($user, $attribute)) {
            return false;
        }

        if (!$user) {
            return true;
        }

        foreach (FamilyAttribute::where('attribute_id', $attribute->id)->with('attributeGroup')->get() as $familyAttribute) {
            if ($familyAttribute->attributeGroup && !$groupCheck($user, $familyAttribute->attributeGroup)) {
                return false;
            }
        }

        return true;
    }

    public function canViewAttributeAcrossFamilies(?User $user, Attribute $attribute): bool
    {
        return $this->acrossFamilies($user, $attribute, [$this, 'canViewAttribute'], [$this, 'canViewGroup']);
    }

    public function canEditAttributeAcrossFamilies(?User $user, Attribute $attribute): bool
    {
        return $this->acrossFamilies($user, $attribute, [$this, 'canEditAttribute'], [$this, 'canEditGroup']);
    }

    /**
     * Batched version of canViewAttributeAcrossFamilies()/canEditAttributeAcrossFamilies()
     * for filtering a whole attribute list (e.g. export/import columns) in a
     * bounded number of queries instead of one family lookup per attribute.
     *
     * @param  Collection<int, Attribute>  $attributes
     * @param  'view'|'edit'  $mode
     * @return Collection<int, Attribute>
     */
    public function filterAttributes(?User $user, Collection $attributes, string $mode = 'view'): Collection
    {
        if (!$user || $attributes->isEmpty()) {
            return $attributes;
        }

        $attributeCheck = $mode === 'edit' ? [$this, 'canEditAttribute'] : [$this, 'canViewAttribute'];
        $groupCheck = $mode === 'edit' ? [$this, 'canEditGroup'] : [$this, 'canViewGroup'];

        $groupsByAttributeId = FamilyAttribute::whereIn('attribute_id', $attributes->pluck('id'))
            ->with('attributeGroup')
            ->get()
            ->groupBy('attribute_id');

        return $attributes->filter(function (Attribute $attribute) use ($user, $attributeCheck, $groupCheck, $groupsByAttributeId) {
            if (!$attributeCheck($user, $attribute)) {
                return false;
            }

            foreach ($groupsByAttributeId->get($attribute->id, collect()) as $familyAttribute) {
                if ($familyAttribute->attributeGroup && !$groupCheck($user, $familyAttribute->attributeGroup)) {
                    return false;
                }
            }

            return true;
        })->values();
    }

    /**
     * Same as filterAttributes(), but for a plain list of attribute codes
     * (e.g. bulk product import/export columns) rather than Attribute
     * models — resolves the codes to models, filters, and returns just the
     * codes that survived, in their original order.
     *
     * @param  array<int, string>  $codes
     * @param  'view'|'edit'  $mode
     * @return array<int, string>
     */
    public function filterAttributeCodes(?User $user, array $codes, string $mode = 'view'): array
    {
        if (!$user || empty($codes)) {
            return $codes;
        }

        $attributes = Attribute::whereIn('code', $codes)->get(['id', 'code']);
        $allowedCodes = $this->filterAttributes($user, $attributes, $mode)->pluck('code')->all();

        return array_values(array_filter($codes, fn ($code) => in_array($code, $allowedCodes, true)));
    }
}
