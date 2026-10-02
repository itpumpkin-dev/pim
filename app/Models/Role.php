<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Services\CodeGenerator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Role extends Model
{
    use Auditable, SoftDeletes;

    /** Can never be deactivated — it's how admins keep access to everything. */
    public const ADMINISTRATOR_LABEL = 'Administrator';

    protected $fillable = [
        'code',
        'label',
        // An inactive role keeps its permissions/members but grants nothing —
        // User::getAllPermissions()/isAdministrator()/allowedShopIds() only
        // follow active roles. The Administrator and guest roles must stay
        // active (StoreRoleRequest/UpdateRoleRequest).
        'is_active',
        'is_guest',
        'created_by',
        'updated_by',
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
            'is_active' => 'boolean',
        ];
    }

    /**
     * Records created outside the admin form (seeders, registration's
     * firstOrCreate, tests) don't pass a code — give them the next free
     * "{prefix}_N" so the NOT NULL + unique code column is always satisfied.
     */
    protected static function booted(): void
    {
        static::creating(function (self $model) {
            if (blank($model->code)) {
                $model->code = CodeGenerator::sequential('roles', 'role');
            }
        });
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
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

    /**
     * Shops this role is whitelisted for, across every platform. Only
     * meaningful for a platform the role has actually restricted (see
     * hasShopRestrictionFor()) — for an unrestricted platform this can be
     * empty, partial, or stale leftovers from before the restriction was
     * turned off, none of which matter since allowedShopIdsFor() is never
     * consulted unless hasShopRestrictionFor() said yes first. Configured on
     * the role form's "Shops" tab.
     */
    public function salesPlatformShops(): BelongsToMany
    {
        return $this->belongsToMany(SalesPlatformShop::class, 'role_sales_platform_shop');
    }

    /**
     * Platforms this role has explicitly turned shop-restriction on for —
     * i.e. the "restrict to selected shops" toggle on the role form's
     * "Shops" tab, per platform. This is a separate on/off flag from the
     * whitelist itself (salesPlatformShops()) precisely so "restricted, but
     * to zero shops" (block the whole platform) is a real, distinct state
     * from "not restricted at all" — both used to look identical (an empty
     * checkbox list), so unchecking every shop silently fell back to
     * unrestricted instead of blocking the platform. See
     * hasShopRestrictionFor().
     */
    public function restrictedPlatforms(): BelongsToMany
    {
        return $this->belongsToMany(SalesPlatform::class, 'role_sales_platform_restrictions');
    }

    /**
     * Whether this role has turned shop-restriction on for the given
     * platform at all. False means unrestricted for that platform (every
     * shop of it is allowed, including ones added later) regardless of
     * whatever rows happen to sit in salesPlatformShops() — a role can be
     * restricted on one platform and unrestricted on another, since the
     * toggle is scoped per platform, not per role.
     */
    public function hasShopRestrictionFor(int $salesPlatformId): bool
    {
        return $this->restrictedPlatforms()->where('sales_platforms.id', $salesPlatformId)->exists();
    }

    /**
     * The whitelisted shop ids for the given platform. Only meaningful when
     * hasShopRestrictionFor() is true for that platform — call that first
     * (see User::allowedShopIds(), which does). An empty array here, with
     * hasShopRestrictionFor() true, is a deliberate "block every shop of
     * this platform" — not "unrestricted".
     *
     * @return array<int, int>
     */
    public function allowedShopIdsFor(int $salesPlatformId): array
    {
        return $this->salesPlatformShops()
            ->where('sales_platform_shops.sales_platform_id', $salesPlatformId)
            ->pluck('sales_platform_shops.id')
            ->all();
    }
}
