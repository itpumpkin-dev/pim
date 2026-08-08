<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use Auditable, HasFactory, Notifiable, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'username',
        'name_prefix',
        'employee_id',
        'password_hash',
        'first_name',
        'last_name',
        'phone',
        'email',
        'avatar_path',
        'department_id',
        'job_position_id',
        'enabled',
        'catalog_locale_id',
        'ui_locale_id',
        'catalog_scope_id',
        'default_tree_id',
        'timezone',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password_hash',
        'remember_token',
    ];

    /**
     * The accessors to append to the model's array/JSON form.
     *
     * @var list<string>
     */
    protected $appends = [
        'name',
        'avatar_url',
    ];

    /**
     * Per-instance memoized result of getAllPermissions() — see that
     * method's docblock for why.
     */
    private ?array $permissionsCache = null;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password_hash' => 'hashed',
            'enabled' => 'boolean',
            'last_login_at' => 'datetime',
            'login_count' => 'integer',
            'permissions_version' => 'integer',
        ];
    }

    /**
     * Get the password column used for authentication.
     */
    public function getAuthPassword(): string
    {
        return $this->password_hash;
    }

    /**
     * The user's full display name, derived from first_name + last_name.
     */
    protected function name(): Attribute
    {
        return Attribute::make(
            get: fn () => trim("{$this->first_name} {$this->last_name}"),
        );
    }

    protected function avatarUrl(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->avatar_path ? Storage::disk('public')->url($this->avatar_path) : null,
        );
    }

    public function catalogLocale(): BelongsTo
    {
        return $this->belongsTo(Locale::class, 'catalog_locale_id');
    }

    public function uiLocale(): BelongsTo
    {
        return $this->belongsTo(Locale::class, 'ui_locale_id');
    }

    public function catalogScope(): BelongsTo
    {
        return $this->belongsTo(Channel::class, 'catalog_scope_id');
    }

    public function defaultTree(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'default_tree_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function jobPosition(): BelongsTo
    {
        return $this->belongsTo(JobPosition::class);
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_role');
    }

    /**
     * All of this user's "resource.action" permission strings (own roles
     * plus roles inherited through a group), cached per-user until their
     * `permissions_version` changes. That version is exactly the signal
     * EnsureFreshPermissions already uses to force a stale session to log
     * out the moment a role/group/permission change could affect them — so
     * keying the cache on it needs no separate invalidation: an old cached
     * entry can only ever be read back by a session already about to be
     * kicked out, never by one whose permissions have actually moved on.
     *
     * Every permission check in the app (hasPermission(),
     * hasAnyPermissionForResource()) reads from this single cached list
     * instead of its own fresh query — previously each one re-queried role/
     * group/role_permissions from scratch, which added up fast on pages
     * that check dozens of attributes/groups in a loop (e.g. the product
     * grid and edit page), and ran unconditionally on every single
     * navigation via HandleInertiaRequests' shared `auth.permissions` prop.
     *
     * Also memoized on the instance itself: `$request->user()` resolves to
     * the same object for the whole request, so a page checking permissions
     * dozens of times in a loop hits this in-memory array after the first
     * call instead of round-tripping to the cache store every time.
     */
    public function getAllPermissions(): array
    {
        if ($this->permissionsCache !== null) {
            return $this->permissionsCache;
        }

        return $this->permissionsCache = Cache::rememberForever(
            "user:{$this->id}:permissions:v{$this->permissions_version}",
            function () {
                $directPermissions = $this->roles()
                    ->join('role_permissions', 'roles.id', '=', 'role_permissions.role_id')
                    ->where('role_permissions.granted', true)
                    ->select('role_permissions.resource', 'role_permissions.action')
                    ->get()
                    ->map(function ($item) {
                        return $item->resource . '.' . $item->action;
                    });

                $groupPermissions = $this->groups()
                    ->join('role_user_group', 'user_groups.id', '=', 'role_user_group.group_id')
                    ->join('roles', 'role_user_group.role_id', '=', 'roles.id')
                    ->join('role_permissions', 'roles.id', '=', 'role_permissions.role_id')
                    ->where('role_permissions.granted', true)
                    ->select('role_permissions.resource', 'role_permissions.action')
                    ->get()
                    ->map(function ($item) {
                        return $item->resource . '.' . $item->action;
                    });

                return $directPermissions->concat($groupPermissions)
                    ->unique()
                    ->values()
                    ->toArray();
            }
        );
    }

    public function hasPermission(string $resource, string $action): bool
    {
        return in_array("{$resource}.{$action}", $this->getAllPermissions(), true);
    }

    public function hasAnyPermissionForResource(string $resource): bool
    {
        $prefix = "{$resource}.";

        foreach ($this->getAllPermissions() as $permission) {
            if (str_starts_with($permission, $prefix)) {
                return true;
            }
        }

        return false;
    }

    /**
     * True once a role's "Attribute Access" section (see role-form.tsx) has
     * been touched at all — i.e. it has at least one `view_attribute_groups`
     * row, meaning it was deliberately scoped to specific groups rather than
     * left at the backward-compatible "no rows = everything visible"
     * default (see ProductController::canUserViewAttributeGroup()). Used
     * anywhere that needs a coarse "does this role have ANY Attribute Group
     * restriction configured" signal without checking one specific group —
     * e.g. gating access to import/export job details, which can't be
     * checked against one particular group since a product job's data spans
     * every attribute group at once.
     */
    public function hasAttributeGroupRestrictions(): bool
    {
        return $this->hasAnyPermissionForResource('view_attribute_groups');
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(UserGroup::class, 'user_group_user', 'user_id', 'group_id');
    }
}
