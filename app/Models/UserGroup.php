<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Services\CodeGenerator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class UserGroup extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'code',
        'name',
        'description',
        // An inactive group keeps its members and roles but stops granting
        // those roles — User::getAllPermissions()/isAdministrator()/allowedShopIds()
        // only follow active groups.
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    /**
     * Records created outside the admin form (seeders, registration's
     * firstOrCreate, tests) don't pass a code — give them the next free
     * "{prefix}_N" so the NOT NULL + unique code column is always satisfied.
     */
    protected static function booted(): void
    {
        static::creating(function (self $model) {
            if (blank($model->code)) {
                $model->code = CodeGenerator::sequential('user_groups', 'group');
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
        return $this->belongsToMany(User::class, 'user_group_user', 'group_id', 'user_id');
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user_group', 'group_id', 'role_id');
    }
}
