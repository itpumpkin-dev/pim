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

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_role');
    }

    public function hasPermission(string $resource, string $action): bool
    {
        $hasDirectRolePermission = $this->roles()
            ->whereHas('permissions', function ($query) use ($resource, $action) {
                $query->where('resource', $resource)
                    ->where('action', $action)
                    ->where('granted', true);
            })
            ->exists();

        if ($hasDirectRolePermission) {
            return true;
        }

        return $this->groups()
            ->whereHas('roles.permissions', function ($query) use ($resource, $action) {
                $query->where('resource', $resource)
                    ->where('action', $action)
                    ->where('granted', true);
            })
            ->exists();
    }

    public function getAllPermissions(): array
    {
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

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(UserGroup::class, 'user_group_user', 'user_id', 'group_id');
    }
}
