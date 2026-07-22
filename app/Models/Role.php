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
    ];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_role');
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class);
    }

    public function apiPermissions(): HasMany
    {
        return $this->hasMany(RoleApiPermission::class);
    }

    public function userGroups(): BelongsToMany
    {
        return $this->belongsToMany(UserGroup::class, 'role_user_group');
    }
}
