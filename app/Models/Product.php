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
        'configurable_attributes',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'parent_id' => 'integer',
            'configurable_attributes' => 'array',
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

    public function associations(): HasMany
    {
        return $this->hasMany(ProductAssociation::class, 'owner_product_id');
    }

    public function associatedWith(): HasMany
    {
        return $this->hasMany(ProductAssociation::class, 'associated_product_id');
    }

    /**
     * Apply smart defaults to this product. Sets pid and pname to the SKU if they are empty/null.
     */
    public function applySmartDefaults(): void
    {
        // 1. Set `pid` = SKU if empty/not set
        $pidAttr = Attribute::where('code', 'pid')->first();
        if ($pidAttr) {
            $exists = $this->values()
                ->where('attribute_id', $pidAttr->id)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->first();
            if (!$exists || $exists->value === null || $exists->value === '') {
                $this->values()->updateOrCreate(
                    [
                        'attribute_id' => $pidAttr->id,
                        'channel_id' => null,
                        'locale_id' => null,
                    ],
                    ['value' => $this->sku]
                );
            }
        }

        // 2. Set `pname` = SKU for each locale if empty/not set
        $pnameAttr = Attribute::where('code', 'pname')->first();
        if ($pnameAttr) {
            $locales = Locale::all();
            foreach ($locales as $locale) {
                $exists = $this->values()
                    ->where('attribute_id', $pnameAttr->id)
                    ->whereNull('channel_id')
                    ->where('locale_id', $locale->id)
                    ->first();
                if (!$exists || $exists->value === null || $exists->value === '') {
                    $this->values()->updateOrCreate(
                        [
                            'attribute_id' => $pnameAttr->id,
                            'channel_id' => null,
                            'locale_id' => $locale->id,
                        ],
                        ['value' => $this->sku]
                    );
                }
            }
        }
    }
}

