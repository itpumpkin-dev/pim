<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RolePermission extends Model
{
    use Auditable;

    public $timestamps = false;

    protected $fillable = [
        'role_id',
        'resource',
        'action',
        'granted',
    ];

    protected $casts = [
        'granted' => 'boolean',
    ];

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }
}
