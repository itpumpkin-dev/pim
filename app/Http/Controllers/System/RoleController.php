<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreRoleRequest;
use App\Http\Requests\System\UpdateRoleRequest;
use App\Models\Attribute;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Services\GridManager;
use App\Services\PermissionCatalog;
use App\Services\SessionInvalidator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $grid = new GridManager('role_grid');

        return Inertia::render('system/role/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('system/role/create', [
            'catalog' => (new PermissionCatalog())->getCatalog(),
            'users' => $this->userOptions(),
            'attributeGroups' => AttributeGroup::orderBy('name')->get(['id', 'code', 'name']),
            'attributes' => Attribute::orderBy('name')->get(['id', 'code', 'name']),
        ]);
    }

    public function store(StoreRoleRequest $request): RedirectResponse
    {
        if ($request->boolean('is_guest')) {
            $this->clearOtherGuestRoles();
        }

        $role = Role::create([
            'label' => $request->label,
            'is_guest' => $request->boolean('is_guest'),
        ]);

        $permissions = $request->input('permissions', []);
        $this->savePermissions($role, $permissions);
        if (!empty($permissions)) {
            AuditLog::record('permissions_granted', $role, null, $permissions);
        }

        $userIds = $request->input('users', []);
        $role->users()->sync($userIds);
        if (!empty($userIds)) {
            AuditLog::record('users_assigned', $role, null, ['user_ids' => $userIds]);
            SessionInvalidator::usersExceptCurrentActor($userIds);
        }

        return to_route('system.roles.index')->with('success', 'Role created successfully.');
    }

    public function edit(Role $role): Response
    {
        $role->load(['users:id']);

        return Inertia::render('system/role/edit', [
            'catalog' => (new PermissionCatalog())->getCatalog(),
            'users' => $this->userOptions(),
            'role' => [
                'id' => $role->id,
                'label' => $role->label,
                'is_guest' => $role->is_guest,
                'permissions' => $this->groupedPermissions($role),
                'user_ids' => $role->users->pluck('id'),
            ],
            'attributeGroups' => AttributeGroup::orderBy('name')->get(['id', 'code', 'name']),
            'attributes' => Attribute::orderBy('name')->get(['id', 'code', 'name']),
        ]);
    }

    public function destroy(Role $role): RedirectResponse
    {
        $affectedUserIds = SessionInvalidator::roleUserIds($role);

        $role->delete();

        SessionInvalidator::usersExceptCurrentActor($affectedUserIds);

        return to_route('system.roles.index');
    }

    public function update(UpdateRoleRequest $request, Role $role): RedirectResponse
    {
        // Users who currently hold this role, directly or via a group, before
        // any of the changes below are applied.
        $previouslyAffectedUserIds = SessionInvalidator::roleUserIds($role);

        if ($request->boolean('is_guest') && !$role->is_guest) {
            $this->clearOtherGuestRoles($role->id);
        }

        $role->update(['label' => $request->label, 'is_guest' => $request->boolean('is_guest')]);

        $oldPermissions = $this->groupedPermissions($role);
        $newPermissions = $request->input('permissions', []);

        $role->permissions()->delete();
        $this->savePermissions($role, $newPermissions);

        $permissionsChanged = $this->permissionsChanged($oldPermissions, $newPermissions);
        if ($permissionsChanged) {
            AuditLog::record('permissions_updated', $role, $oldPermissions, $newPermissions);
        }

        $oldUserIds = $role->users->pluck('id')->all();
        $newUserIds = array_map('intval', $request->input('users', []));
        $role->users()->sync($newUserIds);

        $usersChanged = $this->idsChanged($oldUserIds, $newUserIds);
        if ($usersChanged) {
            AuditLog::record('users_updated', $role, ['user_ids' => $oldUserIds], ['user_ids' => $newUserIds]);
        }

        if ($permissionsChanged || $usersChanged) {
            // Union of who was affected before the change and who is affected
            // now, so both users who lost the role and users who gained it
            // are forced to re-authenticate.
            $nowAffectedUserIds = SessionInvalidator::roleUserIds($role);
            SessionInvalidator::usersExceptCurrentActor(array_merge($previouslyAffectedUserIds, $nowAffectedUserIds));
        }

        return to_route('system.roles.index')->with('success', 'Role updated successfully.');
    }

    /**
     * At most one role can be the guest role (see the `is_guest` migration's
     * partial unique index) — clear it off every other role first so
     * assigning it to this one doesn't trip that constraint.
     */
    private function clearOtherGuestRoles(?int $exceptRoleId = null): void
    {
        Role::where('is_guest', true)
            ->when($exceptRoleId, fn ($q) => $q->where('id', '!=', $exceptRoleId))
            ->update(['is_guest' => false]);
    }

    private function userOptions()
    {
        return User::orderBy('username')->get(['id', 'employee_id', 'username', 'email', 'first_name', 'last_name']);
    }

    private function savePermissions(Role $role, array $permissions): void
    {
        $rows = [];
        foreach ($permissions as $resource => $actions) {
            foreach ($actions as $action) {
                $rows[] = [
                    'role_id' => $role->id,
                    'resource' => $resource,
                    'action' => $action,
                    'granted' => true,
                ];
            }
        }

        if ($rows) {
            RolePermission::insert($rows);
        }
    }

    private function groupedPermissions(Role $role): array
    {
        $permissions = [];
        foreach ($role->permissions()->where('granted', true)->get() as $permission) {
            $permissions[$permission->resource][] = $permission->action;
        }

        return $permissions;
    }

    private function permissionsChanged(array $old, array $new): bool
    {
        $normalize = function (array $permissions) {
            foreach ($permissions as &$actions) {
                sort($actions);
            }
            ksort($permissions);

            return $permissions;
        };

        return $normalize($old) !== $normalize($new);
    }

    private function idsChanged(array $old, array $new): bool
    {
        sort($old);
        sort($new);

        return $old !== $new;
    }
}
