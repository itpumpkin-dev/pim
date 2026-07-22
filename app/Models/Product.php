<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use Auditable;

    protected $fillable = [
        'sku',
        'family_id',
        'type',
        'enabled',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
        ];
    }

    public function family(): BelongsTo
    {
        return $this->belongsTo(AttributeFamily::class, 'family_id');
    }

    public function values(): HasMany
    {
        return $this->hasMany(ProductValue::class);
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'product_category');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(ProductVersion::class);
    }

    public function associations(): HasMany
    {
        return $this->hasMany(ProductAssociation::class, 'owner_product_id');
    }

    public function associatedWith(): HasMany
    {
        return $this->hasMany(ProductAssociation::class, 'associated_product_id');
    }
}
