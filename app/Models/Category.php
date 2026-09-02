<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Cache;

class Category extends Model
{
    use Auditable;

    protected $with = ['translations'];

    protected $fillable = [
        'code',
        'name',
        'slug',
        'display_type',
        'thumbnail',
        'is_active',
        'description',
        'additional_data',
        'is_ai_translate',
        'parent_id',
        'business_type_id',
        'lazada_category_id',
        'shopee_category_id',
        'tiktok_category_id',
        'woocommerce_category_id',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'additional_data' => 'array',
            'is_ai_translate' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    /**
     * Resolves to the current locale's translated name when one exists,
     * falling back to the raw `name` column otherwise — same pattern as
     * Attribute::name. Writes still go straight to the raw column (no `set`
     * closure), so every existing caller (Lazada sync, imports, tree
     * builders that write $category->name directly) is unaffected.
     */
    protected function name(): Attribute
    {
        return Attribute::make(
            get: function ($value) {
                if ($this->relationLoaded('translations')) {
                    $localeId = Locale::idForCode(app()->getLocale());
                    if ($localeId) {
                        $translation = $this->translations->firstWhere('locale_id', $localeId);
                        if ($translation && ! empty(trim((string) $translation->label))) {
                            return $translation->label;
                        }
                    }
                }

                return $value;
            }
        );
    }

    public function translations(): HasMany
    {
        return $this->hasMany(CategoryTranslation::class);
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

    public function shopeeCategory(): BelongsTo
    {
        return $this->belongsTo(ShopeeCategory::class, 'shopee_category_id');
    }

    public function tiktokCategory(): BelongsTo
    {
        return $this->belongsTo(TikTokCategory::class, 'tiktok_category_id');
    }

    public function woocommerceCategory(): BelongsTo
    {
        return $this->belongsTo(WooCommerceCategory::class, 'woocommerce_category_id');
    }

    /**
     * ผูกกับ "ประเภทธุรกิจ" — ใช้จริงเฉพาะที่ระดับกลุ่มสินค้า (depth 3) เท่านั้น
     * (ดู ProductGroupController) แต่ไม่ได้จำกัดไว้ที่ระดับนั้นด้วยโค้ด เผื่ออนาคต
     * อยากผูกที่ระดับอื่นด้วย
     */
    public function businessType(): BelongsTo
    {
        return $this->belongsTo(BusinessType::class);
    }

    /**
     * ตระกูลแอตทริบิวต์ที่ผูกกับกลุ่มสินค้านี้ (ใช้จริงเฉพาะระดับกลุ่มสินค้า/depth 3
     * เหมือน businessType() ด้านบน) เรียงตาม sort_order — ตัวแรก (sort_order
     * ต่ำสุด) คือตระกูล "เริ่มต้น" ใช้ตอนสร้างสินค้าใหม่แล้วเลือกกลุ่มสินค้านี้เพื่อ
     * เดา family_id เริ่มต้นให้ (ProductController::attributeFamiliesForCategory())
     * ส่วนตอนแก้ไขสินค้าที่มีอยู่แล้ว attribute ที่แก้ได้จะมาจาก "ทุก" ตระกูลที่ผูก
     * ไว้ตรงนี้ (union) ไม่ใช่แค่ตัวแรก — ดู ProductController::effectiveFamilyIds()
     */
    public function attributeFamilies(): BelongsToMany
    {
        return $this->belongsToMany(AttributeFamily::class, 'category_attribute_family', 'category_id', 'family_id')
            ->withPivot('sort_order')
            ->orderByPivot('sort_order');
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
                    'display_name' => str_repeat('— ', $depth).$category->name,
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

    private const TREE_CACHE_VERSION_KEY = 'category-tree:version';

    /**
     * Cache key suffix for CategoryController::tree()'s cached payload —
     * bumping this (see bumpTreeCacheVersion()) makes every previously
     * cached tree unreachable without having to know every locale's exact
     * key or touch a driver-specific cache-tagging feature (the app's
     * default `file` cache store doesn't support tags).
     */
    public static function treeCacheVersion(): int
    {
        return (int) Cache::get(self::TREE_CACHE_VERSION_KEY, 1);
    }

    /**
     * Call after any change that affects the tree's shape or labels
     * (create/update/delete, parent_id change, name/translation change,
     * bulk import) — see CategoryController::store()/update()/destroy() and
     * ProcessImportJob.
     */
    public static function bumpTreeCacheVersion(): void
    {
        Cache::forever(self::TREE_CACHE_VERSION_KEY, self::treeCacheVersion() + 1);
    }
}
