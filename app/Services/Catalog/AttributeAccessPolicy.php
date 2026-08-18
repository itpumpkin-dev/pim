<?php

namespace App\Services\Catalog;

use App\Models\Attribute;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Shared "Attribute Access" permission checks — whether a user's role can
 * view/edit a given Attribute Group or individual Attribute. Extracted from
 * ProductController (still the canonical place these rules were designed
 * for — the product edit page) so the same rules can gate other surfaces
 * that expose attribute values outside that page, e.g. bulk product
 * import/export columns, and the public (no-login) product preview page.
 */
class AttributeAccessPolicy
{
    /**
     * Which role's permissions actually govern this check: the given user's
     * own, or — when there's no user at all (an anonymous visitor) — the
     * designated `is_guest` role's, if one has been configured (see
     * Role::guest()). Null means "fully unrestricted", preserving the
     * original behavior for anonymous visitors on an install that hasn't
     * set up a guest role.
     */
    private function actorFor(?User $user): User|Role|null
    {
        return $user ?? Role::guest();
    }

    /**
     * Uses permission format: 'view_attribute_groups.view_{group_code}'.
     * If a role has never touched the "Attribute Access" section at all (no
     * rows for this resource), access is granted by default — backward
     * compatible with every role that predates this permission.
     */
    public function canViewGroup(?User $user, AttributeGroup $group): bool
    {
        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attribute_groups')) {
            return true;
        }

        return $actor->hasPermission('view_attribute_groups', "view_{$group->code}");
    }

    /**
     * Uses permission format: 'view_attributes.view_{attribute_code}'. Same
     * "untouched resource = default allow" fallback as canViewGroup().
     */
    public function canViewAttribute(?User $user, Attribute $attribute): bool
    {
        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attributes')) {
            return true;
        }

        return $actor->hasPermission('view_attributes', "view_{$attribute->code}");
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

        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attribute_groups') && !$actor->hasAnyPermissionForResource('edit_attribute_groups')) {
            return true;
        }

        return $actor->hasPermission('edit_attribute_groups', "edit_{$group->code}");
    }

    /**
     * Same "touched at all" fallback as canEditGroup() above.
     */
    public function canEditAttribute(?User $user, Attribute $attribute): bool
    {
        if (!$this->canViewAttribute($user, $attribute)) {
            return false;
        }

        $actor = $this->actorFor($user);
        if (!$actor) {
            return true;
        }

        if (!$actor->hasAnyPermissionForResource('view_attributes') && !$actor->hasAnyPermissionForResource('edit_attributes')) {
            return true;
        }

        return $actor->hasPermission('edit_attributes', "edit_{$attribute->code}");
    }

    /**
     * True only if there's at least one attribute group this user/role
     * cannot view. Unlike a coarse "has the view_attribute_groups resource
     * been touched at all" check, this correctly treats a role that has
     * every group explicitly granted the same as one that's never touched
     * the section — both mean unrestricted — instead of flagging any
     * explicit grant as a restriction. Used to gate import/export job
     * details, which can't be checked against one particular group since a
     * product job's data spans every attribute group at once.
     */
    public function hasAnyGroupRestriction(?User $user): bool
    {
        if (!$this->actorFor($user)) {
            return false;
        }

        return AttributeGroup::all()->contains(fn (AttributeGroup $group) => !$this->canViewGroup($user, $group));
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

        if (!$this->actorFor($user)) {
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
        if ($attributes->isEmpty() || !$this->actorFor($user)) {
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
        if (empty($codes) || !$this->actorFor($user)) {
            return $codes;
        }

        $attributes = Attribute::whereIn('code', $codes)->get(['id', 'code']);
        $allowedCodes = $this->filterAttributes($user, $attributes, $mode)->pluck('code')->all();

        return array_values(array_filter($codes, fn ($code) => in_array($code, $allowedCodes, true)));
    }
}
