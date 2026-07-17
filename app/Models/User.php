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

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use Auditable, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'username',
        'employee_id',
        'password_hash',
        'first_name',
        'last_name',
        'email',
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

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(UserGroup::class, 'user_group_user', 'user_id', 'group_id');
    }
}
