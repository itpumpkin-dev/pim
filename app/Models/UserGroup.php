<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class UserGroup extends Model
{
    use Auditable, SoftDeletes;

    public $timestamps = false;

    protected $fillable = [
        'name',
        'description',
    ];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_group_user', 'group_id', 'user_id');
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user_group', 'group_id', 'role_id');
    }
}
