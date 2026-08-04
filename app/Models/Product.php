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
        'parent_id',
        'family_id',
        'type',
        'enabled',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'parent_id' => 'integer',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'parent_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(Product::class, 'parent_id');
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

    /**
     * Shops this product is marked to be published/pushed to. Editable from
     * Edit Product's Sales Channels panel; consumed by the Lazada push job.
     */
    public function platformShops(): BelongsToMany
    {
        return $this->belongsToMany(SalesPlatformShop::class, 'product_platform_shops');
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
