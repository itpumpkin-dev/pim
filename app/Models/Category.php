<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    use Auditable;

    protected $fillable = [
        'code',
        'name',
        'description',
        'additional_data',
        'parent_id',
        'lazada_category_id',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'additional_data' => 'array',
        ];
    }

    public function getAdditionalData(string $code, $default = null)
    {
        return $this->additional_data[$code] ?? $default;
    }

    public function setAdditionalData(string $code, $value): void
    {
        $data = $this->additional_data ?? [];
        $data[$code] = $value;
        $this->additional_data = $data;
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Category::class, 'parent_id');
    }

    public function lazadaCategory(): BelongsTo
    {
        return $this->belongsTo(LazadaCategory::class, 'lazada_category_id');
    }

    /**
     * Recursive relationship for loading all nested subcategories.
     */
    public function recursiveChildren(): HasMany
    {
        return $this->children()->with('recursiveChildren');
    }

    /**
     * Helper to load categories hierarchically and generate a flattened list
     * with indentation prefix suitable for HTML parent select dropdown options.
     * Prevents cyclic loops by optionally excluding a category ID and its descendants.
     */
    public static function getTreeOptions(?int $excludeId = null): array
    {
        $roots = self::whereNull('parent_id')->with('recursiveChildren')->get();
        $options = [];

        $traverse = function ($categories, int $depth = 0) use (&$traverse, &$options, $excludeId) {
            foreach ($categories as $category) {
                if ($excludeId && $category->id === $excludeId) {
                    continue; // Skip the excluded category and all its children
                }

                $options[] = [
                    'id' => $category->id,
                    'code' => $category->code,
                    'name' => $category->name,
                    'display_name' => str_repeat('— ', $depth) . $category->name,
                ];

                $traverse($category->recursiveChildren, $depth + 1);
            }
        };

        $traverse($roots);
        return $options;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function fieldValues(): HasMany
    {
        return $this->hasMany(CategoryFieldValue::class);
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_category');
    }
}
