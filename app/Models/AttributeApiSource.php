<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AttributeApiSource extends Model
{
    use Auditable;

    protected static array $auditExcluded = ['credentials'];

    protected $fillable = [
        'name',
        'endpoint',
        'method',
        'auth_type',
        'credentials',
        'rows_path',
        'code_path',
        'label_path',
        'is_active_path',
        'is_active',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'credentials' => 'encrypted:array',
        'is_active' => 'boolean',
    ];

    protected $hidden = [
        'credentials',
    ];

    public function boundAttributes(): HasMany
    {
        return $this->hasMany(Attribute::class, 'api_source_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
