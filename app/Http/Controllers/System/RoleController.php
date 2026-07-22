<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreRoleRequest;
use App\Http\Requests\System\UpdateRoleRequest;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Services\GridManager;
use App\Services\PermissionCatalog;
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
        ]);
    }

    public function store(StoreRoleRequest $request): RedirectResponse
    {
        $role = Role::create([
            'label' => $request->label,
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
                'permissions' => $this->groupedPermissions($role),
                'user_ids' => $role->users->pluck('id'),
            ],
        ]);
    }

    public function destroy(Role $role): RedirectResponse
    {
        $role->delete();

        return to_route('system.roles.index');
    }

    public function update(UpdateRoleRequest $request, Role $role): RedirectResponse
    {
        $role->update(['label' => $request->label]);

        $oldPermissions = $this->groupedPermissions($role);
        $newPermissions = $request->input('permissions', []);

        $role->permissions()->delete();
        $this->savePermissions($role, $newPermissions);

        if ($this->permissionsChanged($oldPermissions, $newPermissions)) {
            AuditLog::record('permissions_updated', $role, $oldPermissions, $newPermissions);
        }

        $oldUserIds = $role->users->pluck('id')->all();
        $newUserIds = array_map('intval', $request->input('users', []));
        $role->users()->sync($newUserIds);

        if ($this->idsChanged($oldUserIds, $newUserIds)) {
            AuditLog::record('users_updated', $role, ['user_ids' => $oldUserIds], ['user_ids' => $newUserIds]);
        }

        return to_route('system.roles.index')->with('success', 'Role updated successfully.');
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
