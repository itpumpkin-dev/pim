<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Role extends Model
{
    use Auditable, SoftDeletes;

    public $timestamps = false;

    protected $fillable = [
        'label',
        'is_guest',
    ];

    protected function casts(): array
    {
        return [
            'is_guest' => 'boolean',
        ];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_role');
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class);
    }

    /**
     * The role representing visitors who aren't logged in (see the
     * `is_guest` migration) — AttributeAccessPolicy checks this role's
     * permissions for a null viewer instead of allowing everything
     * unconditionally. Null if no role has been designated yet, which
     * preserves the original "anonymous = unrestricted" behavior.
     */
    public static function guest(): ?self
    {
        return static::where('is_guest', true)->first();
    }

    /**
     * Flat "resource.action" permission list for this role alone — same
     * shape as User::getAllPermissions(), but for exactly one role instead
     * of aggregating a user's own + group-inherited roles. Deliberately
     * uncached (unlike the user-facing version): this is only ever queried
     * for anonymous requests to public pages, nowhere near the per-request
     * volume that justified caching the authenticated path, so it isn't
     * worth the invalidation complexity (the guest role has no real
     * `users()`/`userGroups()` rows for SessionInvalidator to bump).
     */
    public function allPermissions(): array
    {
        return $this->permissions()
            ->where('granted', true)
            ->get()
            ->map(fn (RolePermission $p) => "{$p->resource}.{$p->action}")
            ->unique()
            ->values()
            ->all();
    }

    public function hasPermission(string $resource, string $action): bool
    {
        return in_array("{$resource}.{$action}", $this->allPermissions(), true);
    }

    public function hasAnyPermissionForResource(string $resource): bool
    {
        $prefix = "{$resource}.";

        foreach ($this->allPermissions() as $permission) {
            if (str_starts_with($permission, $prefix)) {
                return true;
            }
        }

        return false;
    }

    public function apiPermissions(): HasMany
    {
        return $this->hasMany(RoleApiPermission::class);
    }

    public function userGroups(): BelongsToMany
    {
        return $this->belongsToMany(UserGroup::class, 'role_user_group', 'role_id', 'group_id');
    }
}
