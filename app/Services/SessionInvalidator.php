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

            // Bust the permissions cache for the affected users
            foreach ($ids as $id) {
                $user = User::find($id);
                if ($user) {
                    \Illuminate\Support\Facades\Cache::forget("user:{$id}:permissions:v{$user->permissions_version}");
                    \Illuminate\Support\Facades\Cache::forget("user:{$id}:permissions:v" . ($user->permissions_version - 1));
                    \Illuminate\Support\Facades\Cache::forget("user:{$id}:permissions:v" . ($user->permissions_version + 1));
                }
            }

            $ids->each(fn (int $id) => event(new UserPermissionsChanged($id)));
        }
    }

    /**
     * Same as {@see self::users()}, but never force-logs-out whoever is
     * making the change themselves — they already know what they just
     * changed, so there's no need to surprise-logout the acting admin.
     * Everyone else affected is still invalidated as normal.
     *
     * If the actor is themselves in the affected set (e.g. editing a role
     * they hold, directly or via a group), their `getAllPermissions()`
     * result is still cached forever under the *old* `permissions_version`
     * — skipping them entirely would leave them looking at stale (e.g.
     * read-only) permissions for the rest of the session. So their version
     * is bumped too, busting that cache, but their session's stored version
     * is immediately synced to match so EnsureFreshPermissions doesn't see
     * a mismatch and force them out.
     *
     * @param  iterable<int>  $userIds
     */
    public static function usersExceptCurrentActor(iterable $userIds): void
    {
        $actingUserId = auth()->id();
        $ids = Collection::make($userIds)->map(fn ($id) => (int) $id)->unique()->values();

        static::users($ids->reject(fn (int $id) => $id === $actingUserId));

        if ($actingUserId !== null && $ids->contains($actingUserId)) {
            $actor = User::find($actingUserId);

            if ($actor) {
                $actor->increment('permissions_version');
                request()->session()->put('permissions_version', $actor->permissions_version);

                // Bust the permissions cache for the acting user
                \Illuminate\Support\Facades\Cache::forget("user:{$actingUserId}:permissions:v{$actor->permissions_version}");
                \Illuminate\Support\Facades\Cache::forget("user:{$actingUserId}:permissions:v" . ($actor->permissions_version - 1));
                \Illuminate\Support\Facades\Cache::forget("user:{$actingUserId}:permissions:v" . ($actor->permissions_version + 1));
            }
        }
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
