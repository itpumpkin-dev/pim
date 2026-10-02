<?php

use App\Models\Role;
use App\Models\User;
use App\Models\UserGroup;
use Illuminate\Support\Facades\DB;

/**
 * Roles carry a code, an active/inactive status and created/updated audit
 * stamps; an inactive role grants nothing, and the Administrator and guest
 * roles can't be deactivated.
 */
function rcActingAs(array $extraActions = []): User
{
    $user = User::factory()->create(['first_name' => 'Role', 'last_name' => 'Admin', 'employee_id' => 'EMP002']);
    $role = Role::create(['label' => 'Manager '.uniqid()]);
    $user->roles()->attach($role->id);
    DB::table('role_permissions')->insert(
        collect(['list_roles', 'create_roles', 'edit_roles', ...$extraActions])
            ->map(fn ($action) => ['role_id' => $role->id, 'resource' => 'roles', 'action' => $action, 'granted' => true])
            ->all()
    );

    $user->forceFill(['enabled' => true])->save();
    $user = $user->fresh();
    test()->actingAs($user)->withSession(['permissions_version' => $user->permissions_version]);

    return $user;
}

function rcPayload(array $overrides = []): array
{
    return array_merge(['label' => 'Editors', 'is_active' => true, 'is_guest' => false], $overrides);
}

it('creates a role with the typed code, status and audit stamps', function () {
    $actor = rcActingAs();

    $this->get('/system/roles/create')->assertInertia(fn ($page) => $page->has('suggestedCode'));

    $this->post('/system/roles', rcPayload(['code' => 'EDITOR', 'is_active' => false]))->assertRedirect();

    $role = Role::where('label', 'Editors')->first();
    expect($role->code)->toBe('EDITOR')
        ->and($role->is_active)->toBeFalse()
        ->and($role->created_by)->toBe($actor->id)
        ->and($role->updated_by)->toBe($actor->id);
});

it('a role created without a code (seeders, tests) gets a generated one', function () {
    expect(Role::create(['label' => 'Seeded'])->code)->toMatch('/^role_\d+$/');
});

it('lists code, status, guest flag and created/updated by on the index page', function () {
    $actor = rcActingAs();
    Role::create(['code' => 'EDITOR', 'label' => 'Editors', 'is_guest' => true, 'created_by' => $actor->id, 'updated_by' => $actor->id]);

    $this->get('/system/roles?search=EDITOR')->assertInertia(fn ($page) => $page
        ->where('gridData.data.0.code', 'EDITOR')
        ->where('gridData.data.0.is_active', true)
        ->where('gridData.data.0.is_guest', true)
        ->where('gridData.data.0.created_by_code', 'EMP002')
        ->where('gridData.data.0.created_by_name', 'Role Admin')
        ->where('gridData.data.0.updated_by_name', 'Role Admin')
        ->has('gridConfig.columns.updated_by_code'));
});

it('an inactive role grants nothing, directly or through a group', function () {
    $member = User::factory()->create();
    $role = Role::create(['label' => 'Granting']);
    DB::table('role_permissions')->insert(['role_id' => $role->id, 'resource' => 'products', 'action' => 'view_products', 'granted' => true]);
    $member->roles()->attach($role->id);
    $groupMember = User::factory()->create();
    $group = UserGroup::create(['name' => 'G', 'description' => 'd']);
    $group->roles()->attach($role->id);
    $group->users()->attach($groupMember->id);

    expect($member->fresh()->getAllPermissions())->toContain('products.view_products')
        ->and($groupMember->fresh()->getAllPermissions())->toContain('products.view_products');

    $role->update(['is_active' => false]);
    foreach ([$member, $groupMember] as $user) {
        $user = $user->fresh();
        $user->forceFill(['permissions_version' => $user->permissions_version + 1])->save();
        expect($user->fresh()->getAllPermissions())->not->toContain('products.view_products');
    }
});

it('refuses to deactivate the Administrator role or the guest role', function () {
    rcActingAs();
    $admin = Role::where('label', 'Administrator')->first() ?? Role::create(['label' => 'Administrator']);
    $guest = Role::create(['label' => 'Guest visitors', 'is_guest' => true]);

    $this->put("/system/roles/{$admin->id}", rcPayload(['label' => 'Administrator', 'is_active' => false]))
        ->assertSessionHasErrors('is_active');
    $this->put("/system/roles/{$guest->id}", rcPayload(['label' => 'Guest visitors', 'is_guest' => true, 'is_active' => false]))
        ->assertSessionHasErrors('is_active');

    expect($admin->fresh()->is_active)->toBeTrue()
        ->and($guest->fresh()->is_active)->toBeTrue();
});

it('stamps updated_by on save and renames the code only with roles.edit_code', function () {
    $actor = rcActingAs();
    $role = Role::create(['code' => 'EDITOR', 'label' => 'Editors']);

    $this->put("/system/roles/{$role->id}", rcPayload(['code' => 'EDITOR', 'label' => 'Editors 2']))->assertRedirect();
    expect($role->fresh()->updated_by)->toBe($actor->id);

    $this->put("/system/roles/{$role->id}", rcPayload(['code' => 'RENAMED']))->assertForbidden();
    expect($role->fresh()->code)->toBe('EDITOR');
});

it('a user with roles.edit_code can rename a role code', function () {
    rcActingAs(['edit_code']);
    $role = Role::create(['code' => 'EDITOR', 'label' => 'Editors']);

    $this->put("/system/roles/{$role->id}", rcPayload(['code' => 'bad code']))->assertSessionHasErrors('code');
    $this->put("/system/roles/{$role->id}", rcPayload(['code' => 'EDITOR-2']))->assertSessionHasNoErrors();

    expect($role->fresh()->code)->toBe('EDITOR-2');
});
