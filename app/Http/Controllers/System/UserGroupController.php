<?php

namespace App\Http\Controllers\System;

use App\Http\Controllers\Controller;
use App\Http\Requests\System\StoreUserGroupRequest;
use App\Http\Requests\System\UpdateUserGroupRequest;
use App\Models\AuditLog;
use App\Models\User;
use App\Models\UserGroup;
use App\Services\GridManager;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserGroupController extends Controller
{
    public function index(Request $request)
    {
        $grid = new GridManager('user_group_grid');

        return Inertia::render('system/userGroup/index', [
            'gridConfig' => $grid->getConfig(),
            'gridData' => $grid->getData($request),
            'filters' => $request->only(['search', 'sort', 'dir']),
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('system/userGroup/create', [
            'users' => $this->userOptions(),
        ]);
    }

    public function store(StoreUserGroupRequest $request): RedirectResponse
    {
        $group = UserGroup::create([
            'name' => $request->name,
            'description' => $request->description,
        ]);

        $userIds = $request->input('users', []);
        $group->users()->sync($userIds);
        if (!empty($userIds)) {
            AuditLog::record('users_assigned', $group, null, ['user_ids' => $userIds]);
        }

        return to_route('system.userGroup.index')->with('success', 'Group created successfully.');
    }

    public function edit(UserGroup $userGroup): Response
    {
        $userGroup->load('users:id');

        return Inertia::render('system/userGroup/edit', [
            'users' => $this->userOptions(),
            'group' => [
                'id' => $userGroup->id,
                'name' => $userGroup->name,
                'description' => $userGroup->description,
                'user_ids' => $userGroup->users->pluck('id'),
            ],
        ]);
    }

    public function update(UpdateUserGroupRequest $request, UserGroup $userGroup): RedirectResponse
    {
        $userGroup->update([
            'name' => $request->name,
            'description' => $request->description,
        ]);

        $oldUserIds = $userGroup->users->pluck('id')->all();
        $newUserIds = array_map('intval', $request->input('users', []));
        $userGroup->users()->sync($newUserIds);

        if ($this->idsChanged($oldUserIds, $newUserIds)) {
            AuditLog::record('users_updated', $userGroup, ['user_ids' => $oldUserIds], ['user_ids' => $newUserIds]);
        }

        return to_route('system.userGroup.index')->with('success', 'Group updated successfully.');
    }

    public function destroy(UserGroup $userGroup): RedirectResponse
    {
        $userGroup->delete();

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
