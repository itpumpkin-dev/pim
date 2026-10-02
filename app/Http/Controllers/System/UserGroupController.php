<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreUserGroupRequest;
use App\Http\Requests\System\UpdateUserGroupRequest;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\CodeGenerator;
use App\Services\CodeRenameGuard;
use App\Services\GridManager;
use App\Services\PermissionCatalog;
use App\Services\SessionInvalidator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class UserGroupController extends Controller
{
    public function index(Request $request)
    {
        $grid = new GridManager('user_group_grid');

        $gridData = $grid->getData($request, fn ($query) => $query->with([
            'creator:id,employee_id,username,first_name,last_name',
            'updater:id,employee_id,username,first_name,last_name',
        ]));
        $gridData->getCollection()->transform(fn (UserGroup $group) => [
            'id' => $group->id,
            'code' => $group->code,
            'name' => $group->name,
            'is_active' => $group->is_active,
            'created_at' => $group->created_at?->toIso8601String(),
            'created_by_code' => $group->creator?->employee_id,
            'created_by_name' => $group->creator ? ($group->creator->name ?: $group->creator->username) : null,
            'updated_at' => $group->updated_at?->toIso8601String(),
            'updated_by_code' => $group->updater?->employee_id,
            'updated_by_name' => $group->updater ? ($group->updater->name ?: $group->updater->username) : null,
        ]);

        return Inertia::render('system/userGroup/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $gridData,
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    /**
     * Every permission the group grants through its roles, one row per
     * "resource.action" (a permission granted by several roles is listed
     * once, naming each role). There's no permissions master table — names
     * come from PermissionCatalog (route-derived), falling back to a
     * headline of the key for permissions only stored in role_permissions
     * (e.g. per-attribute view_/edit_ access).
     */
    public function permissions(UserGroup $userGroup, PermissionCatalog $catalog): Response
    {
        $labels = [];
        foreach ($catalog->getCatalog() as $module) {
            foreach ($module['resources'] as $resourceKey => $resource) {
                foreach ($resource['actions'] as $actionKey => $action) {
                    $labels["{$resourceKey}.{$actionKey}"] = [
                        'name' => "{$resource['label']}: {$action['label']}",
                        'module' => $module['label'],
                    ];
                }
            }
        }

        $rows = RolePermission::query()
            ->join('role_user_group', 'role_permissions.role_id', '=', 'role_user_group.role_id')
            ->join('roles', 'roles.id', '=', 'role_permissions.role_id')
            ->where('role_user_group.group_id', $userGroup->id)
            ->where('role_permissions.granted', true)
            ->orderBy('role_permissions.resource')
            ->orderBy('role_permissions.action')
            ->orderBy('roles.label')
            ->get(['role_permissions.resource', 'role_permissions.action', 'roles.label as role_label'])
            ->groupBy(fn ($row) => "{$row->resource}.{$row->action}")
            ->values()
            ->map(function ($grants, int $index) use ($labels) {
                $first = $grants->first();
                $key = "{$first->resource}.{$first->action}";
                $label = $labels[$key] ?? null;
                $roles = $grants->pluck('role_label')->unique()->implode(', ');

                return [
                    'id' => $index + 1,
                    'permission_id' => $key,
                    'permission_name' => $label['name'] ?? Str::headline($first->resource) . ': ' . Str::headline($first->action),
                    'module' => $label['module'] ?? null,
                    'roles' => $roles,
                ];
            });

        return Inertia::render('system/userGroup/permissions', [
            'group' => [
                'id' => $userGroup->id,
                'code' => $userGroup->code,
                'name' => $userGroup->name,
                'is_active' => $userGroup->is_active,
            ],
            'permissions' => $rows,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('system/userGroup/create', [
            // Prefills the Code field; the admin may replace it.
            'suggestedCode' => CodeGenerator::sequential('user_groups', 'group'),
            'users' => $this->userOptions(),
            'roles' => Role::orderBy('label')->get(['id', 'label']),
        ]);
    }

    public function store(StoreUserGroupRequest $request): RedirectResponse
    {
        $group = UserGroup::create([
            'code' => $request->code,
            'name' => $request->name,
            'description' => $request->description,
            'is_active' => $request->boolean('is_active'),
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        $userIds = $request->input('users', []);
        $group->users()->sync($userIds);
        if (!empty($userIds)) {
            AuditLog::record('users_assigned', $group, null, ['user_ids' => $userIds]);
            SessionInvalidator::usersExceptCurrentActor($userIds);
        }

        $roleIds = $request->input('roles', []);
        $group->roles()->sync($roleIds);
        if (!empty($roleIds)) {
            AuditLog::record('roles_assigned', $group, null, ['role_ids' => $roleIds]);
        }

        return to_route('system.userGroup.index')->with('success', 'Group created successfully.');
    }

    public function edit(UserGroup $userGroup): Response
    {
        $userGroup->load('users:id', 'roles:id');

        return Inertia::render('system/userGroup/edit', [
            'canEditCode' => CodeRenameGuard::canEdit('user_groups'),
            'users' => $this->userOptions(),
            'roles' => Role::orderBy('label')->get(['id', 'label']),
            'group' => [
                'id' => $userGroup->id,
                'code' => $userGroup->code,
                'name' => $userGroup->name,
                'is_active' => $userGroup->is_active,
                'description' => $userGroup->description,
                'user_ids' => $userGroup->users->pluck('id'),
                'role_ids' => $userGroup->roles->pluck('id'),
            ],
        ]);
    }

    public function update(UpdateUserGroupRequest $request, UserGroup $userGroup): RedirectResponse
    {
        // Nothing looks a group up by its code, so a rename needs no cascade —
        // just the user_groups.edit_code permission. Null = code unchanged.
        if ($newCode = CodeRenameGuard::resolve($request, $userGroup, 'user_groups')) {
            $userGroup->code = $newCode;
        }

        $userGroup->fill([
            'name' => $request->name,
            'description' => $request->description,
            'is_active' => $request->boolean('is_active'),
        ]);
        $statusChanged = $userGroup->isDirty('is_active');

        $oldUserIds = $userGroup->users->pluck('id')->all();
        $newUserIds = array_map('intval', $request->input('users', []));
        $userGroup->users()->sync($newUserIds);

        $usersChanged = $this->idsChanged($oldUserIds, $newUserIds);
        if ($usersChanged) {
            AuditLog::record('users_updated', $userGroup, ['user_ids' => $oldUserIds], ['user_ids' => $newUserIds]);
        }

        $oldRoleIds = $userGroup->roles->pluck('id')->all();
        $newRoleIds = array_map('intval', $request->input('roles', []));
        $userGroup->roles()->sync($newRoleIds);

        $rolesChanged = $this->idsChanged($oldRoleIds, $newRoleIds);
        if ($rolesChanged) {
            AuditLog::record('roles_updated', $userGroup, ['role_ids' => $oldRoleIds], ['role_ids' => $newRoleIds]);
        }

        if ($userGroup->isDirty() || $usersChanged || $rolesChanged) {
            // Membership/role edits live in pivot tables and don't dirty the
            // row itself — set updated_by so the save still stamps
            // updated_at/updated_by for the list's "updated" columns.
            $userGroup->updated_by = $request->user()?->id;
            if (!$userGroup->isDirty()) {
                $userGroup->updated_at = $userGroup->freshTimestamp();
            }
            $userGroup->save();
        }

        if ($usersChanged || $rolesChanged || $statusChanged) {
            // Both the members who left/joined and the members who stayed
            // need a fresh session: leaving/joining changes their own access,
            // staying members are affected if the group's roles or status
            // (inactive groups grant nothing) changed.
            SessionInvalidator::usersExceptCurrentActor(array_merge($oldUserIds, $newUserIds));
        }

        return to_route('system.userGroup.index')->with('success', 'Group updated successfully.');
    }

    public function destroy(UserGroup $userGroup): RedirectResponse
    {
        $affectedUserIds = SessionInvalidator::userGroupUserIds($userGroup);

        $userGroup->delete();

        SessionInvalidator::usersExceptCurrentActor($affectedUserIds);

        return to_route('system.userGroup.index');
    }

    private function userOptions()
    {
        return User::orderBy('username')->get(['id', 'employee_id', 'username', 'email', 'first_name', 'last_name']);
    }

    private function idsChanged(array $old, array $new): bool
    {
        sort($old);
        sort($new);

        return $old !== $new;
    }
}
