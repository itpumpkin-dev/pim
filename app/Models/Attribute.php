<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Attribute extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'type',
        'is_required',
        'is_unique',
        'is_locale_based',
        'is_channel_based',
        'is_filterable',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_required' => 'boolean',
            'is_unique' => 'boolean',
            'is_locale_based' => 'boolean',
            'is_channel_based' => 'boolean',
            'is_filterable' => 'boolean',
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

    public function options(): HasMany
    {
        return $this->hasMany(AttributeOption::class);
    }

    public function families(): BelongsToMany
    {
        return $this->belongsToMany(AttributeFamily::class, 'family_attributes', 'attribute_id', 'family_id')
            ->using(FamilyAttribute::class)
            ->withPivot('attribute_group_id');
    }

    public function values(): HasMany
    {
        return $this->hasMany(ProductValue::class);
    }
}
