<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AttributeFamily extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'name',
        'created_by',
        'updated_by',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function attributes(): BelongsToMany
    {
        return $this->belongsToMany(Attribute::class, 'family_attributes', 'family_id', 'attribute_id')
            ->using(FamilyAttribute::class)
            ->withPivot('attribute_group_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'family_id');
    }
}
