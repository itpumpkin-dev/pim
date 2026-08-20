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

    /** Per-request memoization of allPermissions() — see that method's docblock. */
    private ?array $permissionsCache = null;

    /** Per-request memoization of guest() — see that method's docblock. */
    private static ?self $cachedGuest = null;

    private static bool $guestResolved = false;

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
     *
     * Memoized for the lifetime of the request/process: AttributeAccessPolicy
     * calls actorFor() — and therefore this — once per attribute and once
     * per attribute-group check, so an uncached version turned a single
     * public product page into dozens of `roles` queries.
     */
    public static function guest(): ?self
    {
        if (! self::$guestResolved) {
            self::$cachedGuest = static::where('is_guest', true)->first();
            self::$guestResolved = true;
        }

        return self::$cachedGuest;
    }

    /**
     * Flat "resource.action" permission list for this role alone — same
     * shape as User::getAllPermissions(), but for exactly one role instead
     * of aggregating a user's own + group-inherited roles.
     *
     * Memoized per-instance for the same reason as guest() above:
     * hasPermission()/hasAnyPermissionForResource() are each called once per
     * attribute/group by AttributeAccessPolicy, and guest() now returns the
     * same instance every time, so this cache actually gets reused instead
     * of re-querying `role_permissions` on every check.
     */
    public function allPermissions(): array
    {
        return $this->permissionsCache ??= $this->permissions()
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
