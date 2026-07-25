<?php

namespace App\Services;

use App\Events\UserPermissionsChanged;
use App\Models\Role;
use App\Models\User;
use App\Models\UserGroup;
use Illuminate\Support\Collection;

/**
 * Forces already-logged-in users to re-authenticate once their effective
 * permissions change, by bumping `users.permissions_version`. The session
 * carries the version it was issued with; EnsureFreshPermissions compares
 * it against the current value on every request and logs the user out on
 * a mismatch.
 */
class SessionInvalidator
{
    /**
     * Bump the permissions version for a set of user ids, forcing their
     * next request to be treated as stale and logged out.
     *
     * @param  iterable<int>  $userIds
     */
    public static function users(iterable $userIds): void
    {
        $ids = Collection::make($userIds)->map(fn ($id) => (int) $id)->unique()->values();

        if ($ids->isNotEmpty()) {
            User::whereIn('id', $ids)->increment('permissions_version');

            $ids->each(fn (int $id) => event(new UserPermissionsChanged($id)));
        }
    }

    /**
     * Same as {@see self::users()}, but never force-logs-out whoever is
     * making the change themselves — they already know what they just
     * changed, so there's no need to surprise-logout the acting admin.
     * Everyone else affected is still invalidated as normal.
     *
     * @param  iterable<int>  $userIds
     */
    public static function usersExceptCurrentActor(iterable $userIds): void
    {
        $actingUserId = auth()->id();

        static::users(
            Collection::make($userIds)
                ->map(fn ($id) => (int) $id)
                ->reject(fn (int $id) => $id === $actingUserId)
        );
    }

    /**
     * All user ids affected by a role: users assigned to it directly, plus
     * users who inherit it through a user group.
     *
     * @return array<int>
     */
    public static function roleUserIds(Role $role): array
    {
        $directUserIds = $role->users()->pluck('users.id');

        $groupUserIds = $role->userGroups()
            ->with('users:id')
            ->get()
            ->flatMap(fn (UserGroup $group) => $group->users->pluck('id'));

        return $directUserIds->merge($groupUserIds)->unique()->values()->all();
    }

    /**
     * @return array<int>
     */
    public static function userGroupUserIds(UserGroup $group): array
    {
        return $group->users()->pluck('users.id')->all();
    }
}
