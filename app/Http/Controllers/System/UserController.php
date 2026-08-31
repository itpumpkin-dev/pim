<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreUserRequest;
use App\Http\Requests\System\UpdateUserRequest;
use App\Models\AuditLog;
use App\Models\Department;
use App\Models\JobPosition;
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
            'departments' => Department::where('enabled', true)->orderBy('name')->get(['id', 'name']),
            'jobPositions' => JobPosition::where('enabled', true)->orderBy('name')->get(['id', 'name']),
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
        return array_merge([
            'id' => $user->id,
            'username' => $user->username,
            'name' => $user->name,
            'email' => $user->email,
            'enabled' => $user->enabled,
        ], $this->permissionsPayload($user));
    }

    /**
     * Roles/groups a user has, each with the permissions they grant, plus a
     * flattened "resource.action" list of everything the user can do.
     */
    private function permissionsPayload(User $user): array
    {
        return [
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
            'department_id' => $request->department_id,
            'job_position_id' => $request->job_position_id,
        ]);

        return to_route('system.user.index')->with('success', 'User created successfully.');
    }

    public function edit(Request $request, User $user): Response
    {
        $this->authorizeUserAccess($request, $user);

        $user->load($this->summaryRelations());

        return Inertia::render('system/user/edit', [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'name_prefix' => $user->name_prefix,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'phone' => $user->phone,
                'email' => $user->email,
                'department_id' => $user->department_id,
                'job_position_id' => $user->job_position_id,
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
            // Named apart from the "locales" prop HandleInertiaRequests shares
            // globally (the active-only list the header's language switcher
            // reads) — page props with the same key would silently shadow
            // the shared one, and this picker intentionally lists every
            // locale (an admin may want to pre-assign one to a user before
            // it's switched on for everybody else).
            'localeOptions' => Locale::orderBy('code')->get(['id', 'code']),
            'timezones' => timezone_identifiers_list(),
            'departments' => Department::where('enabled', true)->orderBy('name')->get(['id', 'name']),
            'jobPositions' => JobPosition::where('enabled', true)->orderBy('name')->get(['id', 'name']),
            'canManageAccess' => $request->user()->hasPermission('users', 'edit_users'),
            'permissions' => $this->permissionsPayload($user),
        ]);
    }

    /**
     * Events recorded straight against the user record (login/logout are
     * flagged separately from account changes downstream).
     */
    private const TIMELINE_SIGNIN_EVENTS = ['login', 'logout', 'login_failed'];

    /**
     * Full activity timeline for this user, newest first, split into three
     * streams the UI can filter by:
     *  - signin : login / logout / failed sign-in attempts
     *  - account: changes to this user's own record (profile, password,
     *             group & role assignments)
     *  - work   : things this user did as the actor elsewhere in the app
     *             (created/edited a product, a category, ...)
     */
    public function history(Request $request, User $user): JsonResponse
    {
        $this->authorizeUserAccess($request, $user);

        $logs = AuditLog::query()
            ->where(function ($q) use ($user) {
                // audited against this user's own record
                $q->where(fn ($sub) => $sub
                    ->where('auditable_type', $user->getMorphClass())
                    ->where('auditable_id', $user->getKey()))
                    // actions this user performed as the actor
                    ->orWhere('user_id', $user->getKey())
                    // failed sign-ins carry no actor/auditable, only the
                    // attempted email (see AuditAuthEventSubscriber)
                    ->orWhere(fn ($sub) => $sub
                        ->where('event', 'login_failed')
                        ->where('new_values->email', $user->email));
            })
            ->orderByDesc('created_at')
            ->with('user:id,first_name,last_name,email')
            ->limit(400)
            ->get();

        return response()->json([
            'timeline' => $logs->map(function (AuditLog $log) use ($user) {
                $category = $this->timelineCategory($log, $user);

                return [
                    'event' => $log->event,
                    'category' => $category,
                    // for 'work' rows: what was acted on, e.g. Product #123
                    'subject_type' => $category === 'work' && $log->auditable_type
                        ? class_basename($log->auditable_type)
                        : null,
                    'subject_id' => $category === 'work' ? $log->auditable_id : null,
                    // ISO 8601 with an explicit UTC offset — see the same fix
                    // in HasVersionHistory::versionHistoryFor().
                    'created_at' => $log->created_at?->toIso8601String(),
                    'actor' => $log->user ? ($log->user->name ?: $log->user->email) : 'System',
                    'diff' => $this->diffFor($log),
                ];
            })->values(),
        ]);
    }

    private function timelineCategory(AuditLog $log, User $user): string
    {
        if (in_array($log->event, self::TIMELINE_SIGNIN_EVENTS, true)) {
            return 'signin';
        }

        if ($log->auditable_type === $user->getMorphClass() && (int) $log->auditable_id === $user->getKey()) {
            return 'account';
        }

        return 'work';
    }

    private function diffFor(AuditLog $log): array
    {
        $old = $log->old_values ?? [];
        $new = $log->new_values ?? [];

        // Some events store a bare list rather than a field => value map
        // (e.g. permissions_granted → [{resource, action}, ...]). A per-key
        // table over 0, 1, 2, ... is meaningless there — and would blow up
        // the frontend's humanize() — so collapse it to a single row.
        $oldIsList = ! empty($old) && array_is_list($old);
        $newIsList = ! empty($new) && array_is_list($new);
        if ($oldIsList || $newIsList) {
            return [[
                'key' => 'items',
                'old' => $old ?: null,
                'new' => $new ?: null,
            ]];
        }

        $keys = array_unique(array_merge(array_keys($old), array_keys($new)));

        return collect($keys)->map(fn ($key) => [
            'key' => (string) $key,
            'old' => $old[$key] ?? null,
            'new' => $new[$key] ?? null,
        ])->values()->all();
    }

    public function update(UpdateUserRequest $request, User $user): RedirectResponse
    {
        $this->authorizeUserAccess($request, $user);

        // Only holders of `users.edit_users` may change account access (status, groups,
        // roles). Anyone editing their own profile without that permission may only
        // change their own personal details, never their own privileges.
        $canManageAccess = $request->user()->hasPermission('users', 'edit_users');

        $fields = ['name_prefix', 'first_name', 'last_name', 'phone', 'email', 'department_id', 'job_position_id', 'ui_locale_id', 'timezone'];
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

        $wasEnabled = $user->enabled;

        $user->update($data);

        if ($passwordChanged) {
            AuditLog::record('password_reset', $user);
        }

        // A disabled account must be logged out immediately, not just
        // blocked from logging in again — an already-open session shouldn't
        // keep working. Group/role changes trigger the same invalidation, but
        // those are saved through updateAccess() now, not here.
        $justDisabled = $canManageAccess && $wasEnabled && ! $user->enabled;

        if ($justDisabled) {
            SessionInvalidator::usersExceptCurrentActor([$user->id]);
        }

        if ($request->user()->hasPermission('users', 'list_users')) {
            return to_route('system.user.index')->with('success', 'User updated successfully.');
        }

        return to_route('system.user.edit', $user)->with('success', 'User updated successfully.');
    }

    /**
     * Saves just the user's group and role assignments — the "Groups and Roles"
     * tab on the edit screen has its own Save, independent of the main profile
     * form. Route-gated by `users.edit_users`; the check is repeated here so the
     * guarantee lives with the action too.
     */
    public function updateAccess(Request $request, User $user): RedirectResponse
    {
        abort_unless($request->user()->hasPermission('users', 'edit_users'), 403);

        $validated = $request->validate([
            'groups' => ['array'],
            'groups.*' => ['integer', 'exists:user_groups,id'],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['integer', 'exists:roles,id'],
        ]);

        $oldGroupIds = $user->groups->pluck('id')->all();
        $newGroupIds = array_map('intval', $validated['groups'] ?? []);
        $user->groups()->sync($newGroupIds);
        $groupsChanged = $this->idsChanged($oldGroupIds, $newGroupIds);
        if ($groupsChanged) {
            AuditLog::record('groups_updated', $user, ['group_ids' => $oldGroupIds], ['group_ids' => $newGroupIds]);
        }

        $oldRoleIds = $user->roles->pluck('id')->all();
        $newRoleIds = array_map('intval', $validated['roles']);
        $user->roles()->sync($newRoleIds);
        $rolesChanged = $this->idsChanged($oldRoleIds, $newRoleIds);
        if ($rolesChanged) {
            AuditLog::record('roles_updated', $user, ['role_ids' => $oldRoleIds], ['role_ids' => $newRoleIds]);
        }

        // Same reasoning as update()'s $justDisabled path: a change to what an
        // account can do must not keep applying to sessions already open.
        if ($groupsChanged || $rolesChanged) {
            SessionInvalidator::usersExceptCurrentActor([$user->id]);
        }

        return back()->with('success', 'Groups and roles updated successfully.');
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
