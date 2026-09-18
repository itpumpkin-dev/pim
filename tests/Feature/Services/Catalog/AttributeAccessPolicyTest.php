<?php

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\FamilyAttribute;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Services\Catalog\AttributeAccessPolicy;

function makeGroup(string $code): AttributeGroup
{
    return AttributeGroup::create(['code' => $code]);
}

function makeAttr(string $code): Attribute
{
    return Attribute::create(['code' => $code, 'type' => 'text']);
}

function makeRole(array $attributes = []): Role
{
    return Role::create(array_merge(['label' => 'Role '.uniqid()], $attributes));
}

function grant(Role $role, string $resource, string $action, bool $granted = true): void
{
    RolePermission::create([
        'role_id' => $role->id,
        'resource' => $resource,
        'action' => $action,
        'granted' => $granted,
    ]);
}

function userWithRole(Role $role): User
{
    $user = User::factory()->create();
    $user->roles()->attach($role);

    return $user;
}

beforeEach(function () {
    $this->policy = new AttributeAccessPolicy();

    // Role::guest() memoizes its result in a *static* (process-lifetime, not
    // per-instance) cache with no invalidation hook — harmless in real usage
    // (one PHP-FPM process per request, so it's fresh again next request),
    // but every test in this run shares one PHP process, so an earlier
    // test's "no guest role yet" (null) would otherwise stick around and
    // leak into a later test that creates one. Reset it here so each test
    // sees the DB state it actually set up.
    $guestReflection = new ReflectionClass(Role::class);
    $guestReflection->getProperty('cachedGuest')->setValue(null, null);
    $guestReflection->getProperty('guestResolved')->setValue(null, false);
});

// --- canViewGroup ---

test('an anonymous visitor can view any group when no guest role is configured', function () {
    $group = makeGroup('specs');

    expect($this->policy->canViewGroup(null, $group))->toBeTrue();
});

test('a role that has never touched view_attribute_groups permissions can view any group by default', function () {
    $role = makeRole();
    $user = userWithRole($role);
    $group = makeGroup('specs');

    expect($this->policy->canViewGroup($user, $group))->toBeTrue();
});

test('a role with explicit view_attribute_groups permissions can only view groups it was granted', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_specs');
    $user = userWithRole($role);

    $allowed = makeGroup('specs');
    $denied = makeGroup('pricing');

    expect($this->policy->canViewGroup($user, $allowed))->toBeTrue();
    expect($this->policy->canViewGroup($user, $denied))->toBeFalse();
});

test('a resource whose only permission row is granted=false still falls back to default-allow', function () {
    // Documents actual (verified) behavior, not the docblock's stated intent
    // ("no data for this resource at all" allows by default) — Role/User's
    // allPermissions() builds its list via ->where('granted', true), so a
    // resource with only an explicit denial and no explicit grant looks
    // identical to "never touched this resource" to hasAnyPermissionForResource(),
    // and the untouched-resource default-allow fallback fires regardless.
    // In practice this is hard to hit via the real admin UI (unchecking one
    // group while any other stays checked leaves a granted=true row for the
    // same resource, so it still counts as "touched") — known edge case,
    // left as-is per product decision, not something to silently patch here.
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_specs', granted: false);
    $user = userWithRole($role);

    $group = makeGroup('specs');

    expect($this->policy->canViewGroup($user, $group))->toBeTrue();
});

test('an anonymous visitor is bound by the configured guest role permissions', function () {
    $guestRole = makeRole(['is_guest' => true]);
    grant($guestRole, 'view_attribute_groups', 'view_public');

    $publicGroup = makeGroup('public');
    $privateGroup = makeGroup('internal');

    expect($this->policy->canViewGroup(null, $publicGroup))->toBeTrue();
    expect($this->policy->canViewGroup(null, $privateGroup))->toBeFalse();
});

// --- canEditGroup ---

test('editing a group requires viewing it first, regardless of edit permissions', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_specs');
    grant($role, 'edit_attribute_groups', 'edit_pricing');
    $user = userWithRole($role);

    $pricing = makeGroup('pricing');

    // Not viewable at all (only 'specs' is granted for view), so edit must
    // be denied even though an edit_pricing grant technically exists.
    expect($this->policy->canEditGroup($user, $pricing))->toBeFalse();
});

test('a role that only ever set view permissions (never touched edit) cannot edit despite the "untouched resource" fallback', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_specs');
    $user = userWithRole($role);

    $specs = makeGroup('specs');

    // view_attribute_groups HAS been touched, so canEditGroup's fallback
    // ("neither view nor edit resource ever touched") does not apply here —
    // this must resolve strictly on the (absent) edit_attribute_groups grant.
    expect($this->policy->canEditGroup($user, $specs))->toBeFalse();
});

test('a role that has never touched view or edit attribute-group permissions can edit any viewable group by default', function () {
    $role = makeRole();
    $user = userWithRole($role);

    $group = makeGroup('specs');

    expect($this->policy->canEditGroup($user, $group))->toBeTrue();
});

test('a role with explicit edit grants can only edit groups it was granted, even though it can view others', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_specs');
    grant($role, 'edit_attribute_groups', 'edit_specs');
    $user = userWithRole($role);

    $group = makeGroup('specs');

    expect($this->policy->canViewGroup($user, $group))->toBeTrue();
    expect($this->policy->canEditGroup($user, $group))->toBeTrue();
});

// --- canViewAttribute / canEditAttribute mirror the group logic ---

test('attribute view/edit permissions mirror group permissions using the attribute code', function () {
    $role = makeRole();
    grant($role, 'view_attributes', 'view_pbrand');
    $user = userWithRole($role);

    $brand = makeAttr('pbrand');
    $color = makeAttr('pcolor');

    expect($this->policy->canViewAttribute($user, $brand))->toBeTrue();
    expect($this->policy->canViewAttribute($user, $color))->toBeFalse();
});

// --- hasAnyGroupRestriction ---

test('hasAnyGroupRestriction is false for an anonymous visitor with no guest role', function () {
    expect($this->policy->hasAnyGroupRestriction(null))->toBeFalse();
});

test('hasAnyGroupRestriction is false when a role has never touched group permissions', function () {
    $role = makeRole();
    $user = userWithRole($role);
    makeGroup('specs');

    expect($this->policy->hasAnyGroupRestriction($user))->toBeFalse();
});

test('hasAnyGroupRestriction is false when a role is granted view on every existing group', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_specs');
    grant($role, 'view_attribute_groups', 'view_pricing');
    $user = userWithRole($role);

    makeGroup('specs');
    makeGroup('pricing');

    expect($this->policy->hasAnyGroupRestriction($user))->toBeFalse();
});

test('hasAnyGroupRestriction is true as soon as one group is not viewable', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_specs');
    $user = userWithRole($role);

    makeGroup('specs');
    makeGroup('pricing'); // not granted

    expect($this->policy->hasAnyGroupRestriction($user))->toBeTrue();
});

// --- canViewAttributeAcrossFamilies / canEditAttributeAcrossFamilies ---

test('an attribute assigned to a restricted group in even one family is denied across families', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_open');
    $user = userWithRole($role);

    $openGroup = makeGroup('open');
    $restrictedGroup = makeGroup('restricted');
    $attribute = makeAttr('pcolor');

    $familyA = AttributeFamily::create(['code' => 'family_a']);
    $familyB = AttributeFamily::create(['code' => 'family_b']);

    FamilyAttribute::create(['family_id' => $familyA->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $openGroup->id]);
    FamilyAttribute::create(['family_id' => $familyB->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $restrictedGroup->id]);

    // 'restricted' was never granted, so canViewGroup denies it, which must
    // sink the across-families check even though 'open' is fine.
    expect($this->policy->canViewAttributeAcrossFamilies($user, $attribute))->toBeFalse();
});

test('an attribute viewable in every family it belongs to is viewable across families', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_open');
    $user = userWithRole($role);

    $openGroup = makeGroup('open');
    $attribute = makeAttr('pcolor');
    $family = AttributeFamily::create(['code' => 'family_a']);

    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $attribute->id, 'attribute_group_id' => $openGroup->id]);

    expect($this->policy->canViewAttributeAcrossFamilies($user, $attribute))->toBeTrue();
});

test('an attribute not directly viewable is denied across families before family membership is even checked', function () {
    $role = makeRole();
    grant($role, 'view_attributes', 'view_pbrand'); // only pbrand, not pcolor
    $user = userWithRole($role);

    $attribute = makeAttr('pcolor');

    expect($this->policy->canViewAttributeAcrossFamilies($user, $attribute))->toBeFalse();
});

// --- filterAttributes / filterAttributeCodes ---

test('filterAttributes returns the input untouched for an anonymous visitor with no guest role', function () {
    $attributes = collect([makeAttr('pcolor'), makeAttr('pbrand')]);

    $result = $this->policy->filterAttributes(null, $attributes);

    expect($result->pluck('code')->all())->toBe(['pcolor', 'pbrand']);
});

test('filterAttributes on an empty collection returns it untouched', function () {
    $role = makeRole();
    $user = userWithRole($role);

    $result = $this->policy->filterAttributes($user, collect());

    expect($result)->toBeEmpty();
});

test('filterAttributes keeps only attributes viewable in every family they belong to, preserving order', function () {
    $role = makeRole();
    grant($role, 'view_attribute_groups', 'view_open');
    $user = userWithRole($role);

    $openGroup = makeGroup('open');
    $restrictedGroup = makeGroup('restricted');

    $color = makeAttr('pcolor');
    $brand = makeAttr('pbrand');
    $size = makeAttr('psize');

    $family = AttributeFamily::create(['code' => 'family_a']);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $color->id, 'attribute_group_id' => $openGroup->id]);
    FamilyAttribute::create(['family_id' => $family->id, 'attribute_id' => $brand->id, 'attribute_group_id' => $restrictedGroup->id]);
    // psize has no family membership at all -> only the direct attribute check applies.

    $result = $this->policy->filterAttributes($user, collect([$color, $brand, $size]));

    expect($result->pluck('code')->all())->toBe(['pcolor', 'psize']);
});

test('filterAttributes in edit mode uses edit permissions, not view permissions', function () {
    $role = makeRole();
    grant($role, 'view_attributes', 'view_pcolor');
    grant($role, 'view_attributes', 'view_pbrand');
    grant($role, 'edit_attributes', 'edit_pcolor');
    $user = userWithRole($role);

    $color = makeAttr('pcolor');
    $brand = makeAttr('pbrand');

    $result = $this->policy->filterAttributes($user, collect([$color, $brand]), 'edit');

    expect($result->pluck('code')->all())->toBe(['pcolor']);
});

test('filterAttributeCodes resolves codes to attributes, filters, and returns codes in original order', function () {
    $role = makeRole();
    grant($role, 'view_attributes', 'view_pcolor');
    $user = userWithRole($role);

    makeAttr('pcolor');
    makeAttr('pbrand');

    $result = $this->policy->filterAttributeCodes($user, ['pbrand', 'pcolor', 'unknown_code']);

    expect($result)->toBe(['pcolor']);
});

test('filterAttributeCodes on an empty list returns it untouched', function () {
    $role = makeRole();
    $user = userWithRole($role);

    expect($this->policy->filterAttributeCodes($user, []))->toBe([]);
});
