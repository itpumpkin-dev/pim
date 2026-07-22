<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CategoryField extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'type',
        'is_required',
        'value_per_locale',
        'status',
        'position',
        'display_section',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'value_per_locale' => 'boolean',
            'status' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function values(): HasMany
    {
        return $this->hasMany(CategoryFieldValue::class);
    }
}
