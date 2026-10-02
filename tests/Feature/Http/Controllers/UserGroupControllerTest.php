<?php

use App\Models\Role;
use App\Models\User;
use App\Models\UserGroup;
use Illuminate\Support\Facades\DB;

/**
 * User groups carry an auto-generated code, an active/inactive status and
 * created/updated audit stamps; an inactive group stops granting its roles.
 */
function ugActingAs(array $extraActions = []): User
{
    $user = User::factory()->create(['first_name' => 'Group', 'last_name' => 'Admin', 'employee_id' => 'EMP001']);
    $role = Role::create(['label' => 'Role '.uniqid()]);
    $user->roles()->attach($role->id);
    DB::table('role_permissions')->insert(
        collect(['list_user_groups', 'create_user_groups', 'edit_user_groups', ...$extraActions])
            ->map(fn ($action) => ['role_id' => $role->id, 'resource' => 'user_groups', 'action' => $action, 'granted' => true])
            ->all()
    );

    $user->forceFill(['enabled' => true])->save();
    $user = $user->fresh();
    test()->actingAs($user)->withSession(['permissions_version' => $user->permissions_version]);

    return $user;
}

it('creates a group with the code typed in the form, status and audit stamps', function () {
    $actor = ugActingAs();

    $this->get('/system/userGroup/create')->assertInertia(fn ($page) => $page->where('suggestedCode', 'group_1'));

    $this->post('/system/userGroup', ['code' => 'SALES-01', 'name' => 'Sales', 'description' => 'd', 'is_active' => false])
        ->assertRedirect();

    $sales = UserGroup::where('name', 'Sales')->first();
    expect($sales->code)->toBe('SALES-01')
        ->and($sales->is_active)->toBeFalse()
        ->and($sales->created_by)->toBe($actor->id)
        ->and($sales->updated_by)->toBe($actor->id)
        ->and($sales->created_at)->not->toBeNull();
});

it('rejects a missing, malformed or duplicate group code', function () {
    ugActingAs();
    $deleted = UserGroup::create(['code' => 'TAKEN', 'name' => 'Old', 'description' => 'd']);
    $deleted->delete();

    foreach (['' , 'has space', 'TAKEN'] as $code) {
        $this->post('/system/userGroup', ['code' => $code, 'name' => 'New '.uniqid(), 'description' => 'd', 'is_active' => true])
            ->assertSessionHasErrors('code');
    }

    expect(UserGroup::count())->toBe(0);
});

it('lists code, status and created/updated by on the index page', function () {
    $actor = ugActingAs();
    UserGroup::create(['code' => 'group_1', 'name' => 'Sales', 'description' => 'd', 'created_by' => $actor->id, 'updated_by' => $actor->id]);

    $this->get('/system/userGroup')->assertInertia(fn ($page) => $page
        ->where('gridData.data.0.code', 'group_1')
        ->where('gridData.data.0.is_active', true)
        ->where('gridData.data.0.created_by_code', 'EMP001')
        ->where('gridData.data.0.created_by_name', 'Group Admin')
        ->where('gridData.data.0.updated_by_code', 'EMP001')
        ->where('gridData.data.0.updated_by_name', 'Group Admin')
        ->has('gridConfig.columns.updated_by_name'));
});

it('lists the permissions a group grants through its roles, once per permission', function () {
    ugActingAs();
    $group = UserGroup::create(['code' => 'group_1', 'name' => 'IT Information', 'description' => 'd']);
    $editor = Role::create(['label' => 'Editor']);
    $viewer = Role::create(['label' => 'Viewer']);
    DB::table('role_permissions')->insert([
        ['role_id' => $editor->id, 'resource' => 'user_groups', 'action' => 'edit_user_groups', 'granted' => true],
        ['role_id' => $editor->id, 'resource' => 'user_groups', 'action' => 'list_user_groups', 'granted' => true],
        ['role_id' => $viewer->id, 'resource' => 'user_groups', 'action' => 'list_user_groups', 'granted' => true],
        ['role_id' => $viewer->id, 'resource' => 'user_groups', 'action' => 'delete_user_groups', 'granted' => false],
    ]);
    $group->roles()->attach([$editor->id, $viewer->id]);

    $this->get("/system/userGroup/{$group->id}/permissions")->assertInertia(fn ($page) => $page
        ->component('system/userGroup/permissions')
        ->where('group.name', 'IT Information')
        ->has('permissions', 2)
        ->where('permissions.0.id', 1)
        ->where('permissions.0.permission_id', 'user_groups.edit_user_groups')
        ->where('permissions.0.permission_name', 'User Groups: Edit User Groups')
        ->where('permissions.0.roles', 'Editor')
        ->where('permissions.1.permission_id', 'user_groups.list_user_groups')
        ->where('permissions.1.roles', 'Editor, Viewer'));
});

it('stamps updated_by when only the roles change', function () {
    ugActingAs();
    $group = UserGroup::create(['code' => 'group_1', 'name' => 'Sales', 'description' => 'd']);
    $role = Role::create(['label' => 'Extra']);

    $this->put("/system/userGroup/{$group->id}", ['name' => 'Sales', 'description' => 'd', 'is_active' => true, 'roles' => [$role->id]])
        ->assertRedirect();

    expect($group->fresh()->updated_by)->toBe(auth()->id());
});

it('an inactive group no longer grants its roles', function () {
    $member = User::factory()->create();
    $role = Role::create(['label' => 'Granting']);
    DB::table('role_permissions')->insert(['role_id' => $role->id, 'resource' => 'products', 'action' => 'view_products', 'granted' => true]);
    $group = UserGroup::create(['code' => 'group_1', 'name' => 'Sales', 'description' => 'd']);
    $group->roles()->attach($role->id);
    $group->users()->attach($member->id);

    expect($member->fresh()->getAllPermissions())->toContain('products.view_products');

    $group->update(['is_active' => false]);
    $member = $member->fresh();
    $member->forceFill(['permissions_version' => $member->permissions_version + 1])->save();

    expect($member->fresh()->getAllPermissions())->not->toContain('products.view_products');
});

it('renames a group code only with user_groups.edit_code', function () {
    ugActingAs();
    $group = UserGroup::create(['code' => 'group_1', 'name' => 'Sales', 'description' => 'd']);
    $payload = ['name' => 'Sales', 'description' => 'd', 'is_active' => true];

    $this->get("/system/userGroup/{$group->id}/edit")->assertInertia(fn ($page) => $page->where('canEditCode', false));

    // Sending the unchanged code back still saves without the permission.
    $this->put("/system/userGroup/{$group->id}", $payload + ['code' => 'group_1'])->assertRedirect();
    $this->put("/system/userGroup/{$group->id}", $payload + ['code' => 'SALES'])->assertForbidden();
    expect($group->fresh()->code)->toBe('group_1');
});

it('a user with user_groups.edit_code can rename, subject to format and uniqueness', function () {
    ugActingAs(['edit_code']);
    $group = UserGroup::create(['code' => 'group_1', 'name' => 'Sales', 'description' => 'd']);
    UserGroup::create(['code' => 'TAKEN', 'name' => 'Other', 'description' => 'd']);
    $payload = ['name' => 'Sales', 'description' => 'd', 'is_active' => true];

    $this->get("/system/userGroup/{$group->id}/edit")->assertInertia(fn ($page) => $page->where('canEditCode', true));

    $this->put("/system/userGroup/{$group->id}", $payload + ['code' => 'TAKEN'])->assertSessionHasErrors('code');
    $this->put("/system/userGroup/{$group->id}", $payload + ['code' => 'bad code'])->assertSessionHasErrors('code');

    $this->put("/system/userGroup/{$group->id}", $payload + ['code' => 'SALES-01'])->assertRedirect()->assertSessionHasNoErrors();
    expect($group->fresh()->code)->toBe('SALES-01');
});
