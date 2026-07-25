<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreUserRequest;
use App\Http\Requests\System\UpdateUserRequest;
use App\Models\AuditLog;
use App\Models\Locale;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserGroup;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use App\Services\GridManager;
use App\Services\SessionInvalidator;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $grid = new GridManager('user_grid');

        return Inertia::render('system/user/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function summary(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'group_id' => ['sometimes', 'integer', 'exists:user_groups,id'],
            'role_id' => ['sometimes', 'integer', 'exists:roles,id'],
        ]);

        $query = $this->summaryQuery();

        if (! empty($validated['group_id'])) {
            $groupId = $validated['group_id'];
            $query->whereHas('groups', fn ($q) => $q->where('user_groups.id', $groupId));
        }

        if (! empty($validated['role_id'])) {
            $roleId = $validated['role_id'];
            $query->where(function ($q) use ($roleId) {
                $q->whereHas('roles', fn ($q2) => $q2->where('roles.id', $roleId))
                    ->orWhereHas('groups.roles', fn ($q2) => $q2->where('roles.id', $roleId));
            });
        }

        $users = $query->orderBy('username')->get(['id', 'username', 'first_name', 'last_name', 'email', 'enabled']);

        return response()->json([
            'total_users' => $users->count(),
            'total_groups' => UserGroup::count(),
            'total_roles' => Role::count(),
            'filters' => $validated,
            'users' => $users->map(fn (User $user) => $this->transformUserSummary($user))->values(),
        ]);
    }

    public function summaryShow(User $user): JsonResponse
    {
        $user->load($this->summaryRelations());

        return response()->json($this->transformUserSummary($user));
    }

    /**
     * @return array<string, mixed>
     */
    private function summaryRelations(): array
    {
        return [
            'roles:id,label',
            'roles.permissions' => function ($query) {
                $query->where('granted', true)->select(['id', 'role_id', 'resource', 'action']);
            },
            'groups:id,name',
            'groups.roles:id,label',
            'groups.roles.permissions' => function ($query) {
                $query->where('granted', true)->select(['id', 'role_id', 'resource', 'action']);
            },
        ];
    }

    private function summaryQuery(): Builder
    {
        return User::query()->with($this->summaryRelations());
    }

    private function mapRoleSummary(Role $role): array
    {
        return [
            'id' => $role->id,
            'label' => $role->label,
            'permissions' => $role->permissions->map(fn (RolePermission $permission) => [
                'resource' => $permission->resource,
                'action' => $permission->action,
            ])->values(),
        ];
    }

    private function transformUserSummary(User $user): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'name' => $user->name,
            'email' => $user->email,
            'enabled' => $user->enabled,
            'roles' => $user->roles->map(fn (Role $role) => $this->mapRoleSummary($role))->values(),
            'groups' => $user->groups->map(fn (UserGroup $group) => [
                'id' => $group->id,
                'name' => $group->name,
                'roles' => $group->roles->map(fn (Role $role) => $this->mapRoleSummary($role))->values(),
            ])->values(),
            'effective_permissions' => $user->getAllPermissions(),
        ];
    }

    public function store(StoreUserRequest $request): RedirectResponse
    {
        User::create([
            'username' => $request->username,
            'employee_id' => $request->employee_id,
            'password_hash' => $request->password,
            'first_name' => $request->first_name,
            'last_name' => $request->last_name,
            'email' => $request->email,
        ]);

        return to_route('system.user.index')->with('success', 'User created successfully.');
    }

    public function edit(Request $request, User $user): Response
    {
        $this->authorizeUserAccess($request, $user);

        $user->load(['groups:id,name', 'roles:id,label']);

        return Inertia::render('system/user/edit', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'name_prefix' => $user->name_prefix,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'phone' => $user->phone,
                'email' => $user->email,
                'enabled' => $user->enabled,
                'avatar_url' => $user->avatar_url,
                'ui_locale_id' => $user->ui_locale_id,
                'timezone' => $user->timezone,
                'created_at' => $user->created_at,
                'updated_at' => $user->updated_at,
                'last_login_at' => $user->last_login_at,
                'login_count' => $user->login_count,
                'group_ids' => $user->groups->pluck('id'),
                'role_ids' => $user->roles->pluck('id'),
            ],
            'groups' => UserGroup::orderBy('name')->get(['id', 'name']),
            'roles' => Role::orderBy('label')->get(['id', 'label']),
            'locales' => Locale::orderBy('code')->get(['id', 'code']),
            'timezones' => timezone_identifiers_list(),
            'canManageAccess' => $request->user()->hasPermission('users', 'edit_users'),
        ]);
    }

    public function update(UpdateUserRequest $request, User $user): RedirectResponse
    {
        $this->authorizeUserAccess($request, $user);

        // Only holders of `users.edit_users` may change account access (status, groups,
        // roles). Anyone editing their own profile without that permission may only
        // change their own personal details, never their own privileges.
        $canManageAccess = $request->user()->hasPermission('users', 'edit_users');

        $fields = ['name_prefix', 'first_name', 'last_name', 'phone', 'email', 'ui_locale_id', 'timezone'];
        if ($canManageAccess) {
            $fields[] = 'enabled';
        }
        $data = $request->safe()->only($fields);

        if ($request->hasFile('avatar')) {
            if ($user->avatar_path) {
                Storage::disk('public')->delete($user->avatar_path);
            }

            $data['avatar_path'] = $request->file('avatar')->store('avatars', 'public');
        }

        $passwordChanged = $request->filled('password');
        if ($passwordChanged) {
            $data['password_hash'] = $request->password;
        }

        $user->update($data);

        if ($passwordChanged) {
            AuditLog::record('password_reset', $user);
        }

        if ($canManageAccess) {
            $oldGroupIds = $user->groups->pluck('id')->all();
            $newGroupIds = array_map('intval', $request->input('groups', []));
            $user->groups()->sync($newGroupIds);
            $groupsChanged = $this->idsChanged($oldGroupIds, $newGroupIds);
            if ($groupsChanged) {
                AuditLog::record('groups_updated', $user, ['group_ids' => $oldGroupIds], ['group_ids' => $newGroupIds]);
            }

            $oldRoleIds = $user->roles->pluck('id')->all();
            $newRoleIds = array_map('intval', $request->input('roles', []));
            $user->roles()->sync($newRoleIds);
            $rolesChanged = $this->idsChanged($oldRoleIds, $newRoleIds);
            if ($rolesChanged) {
                AuditLog::record('roles_updated', $user, ['role_ids' => $oldRoleIds], ['role_ids' => $newRoleIds]);
            }

            if ($groupsChanged || $rolesChanged) {
                SessionInvalidator::usersExceptCurrentActor([$user->id]);
            }
        }

        if ($request->user()->hasPermission('users', 'list_users')) {
            return to_route('system.user.index')->with('success', 'User updated successfully.');
        }

        return to_route('system.user.edit', $user)->with('success', 'User updated successfully.');
    }

    /**
     * A user may always view/edit their own account. Viewing or editing anyone
     * else's account requires the `users.edit_users` permission.
     */
    private function authorizeUserAccess(Request $request, User $user): void
    {
        $currentUser = $request->user();

        abort_unless(
            $currentUser->id === $user->id || $currentUser->hasPermission('users', 'edit_users'),
            403,
            'You do not have permission to perform this action.'
        );
    }

    private function idsChanged(array $old, array $new): bool
    {
        sort($old);
        sort($new);

        return $old !== $new;
    }

    public function destroy(User $user): RedirectResponse
    {
        abort_if(
            $user->roles()->where('label', 'Administrator')->exists(),
            403,
            'Users with the Administrator role cannot be deleted.'
        );

        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

        $user->delete();

        return to_route('system.user.index');
    }
}
