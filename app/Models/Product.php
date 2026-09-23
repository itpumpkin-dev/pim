<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Services\Catalog\EffectiveFamilyAttributeResolver;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Cache;

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
        'shopee_category_id',
        'lazada_category_id',
        'tiktok_category_id',
        'woocommerce_category_id',
        'shopee_brand_id',
        'lazada_brand_id',
        'tiktok_brand_id',
        'woocommerce_brand_id',
        'is_raw_material',
    ];

    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'parent_id' => 'integer',
            'configurable_attributes' => 'array',
            'is_raw_material' => 'boolean',
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
     * Per-product overrides of which marketplace category this product
     * pushes under — nullable; when unset, each sync service falls back to
     * the mapping on this product's PIM `categories()` instead (see
     * ShopeeProductSyncService::resolveCategoryId() and its Lazada/TikTok
     * counterparts).
     */
    public function shopeeCategory(): BelongsTo
    {
        return $this->belongsTo(ShopeeCategory::class, 'shopee_category_id');
    }

    public function lazadaCategory(): BelongsTo
    {
        return $this->belongsTo(LazadaCategory::class, 'lazada_category_id');
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
     * Per-product overrides of which marketplace brand this product pushes
     * under — nullable; when unset, each sync service falls back to the
     * marketplace mapping on whichever AttributeOption this product's
     * `pbrand` attribute value points to instead (see
     * ShopeeProductSyncService::resolveShopeeBrandId() and its Lazada/
     * TikTok/WooCommerce counterparts).
     */
    public function shopeeBrand(): BelongsTo
    {
        return $this->belongsTo(ShopeeBrand::class, 'shopee_brand_id');
    }

    public function lazadaBrand(): BelongsTo
    {
        return $this->belongsTo(LazadaBrand::class, 'lazada_brand_id');
    }

    public function tiktokBrand(): BelongsTo
    {
        return $this->belongsTo(TikTokBrand::class, 'tiktok_brand_id');
    }

    public function woocommerceBrand(): BelongsTo
    {
        return $this->belongsTo(WooCommerceBrand::class, 'woocommerce_brand_id');
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

    /** BOM ที่สินค้านี้เป็น "หัว" (finished good) — มีได้แค่ชุดเดียว ดู ProductBom */
    public function bom(): HasOne
    {
        return $this->hasOne(ProductBom::class);
    }

    /** BOM ทุกชุดที่สินค้านี้ถูกใช้เป็นวัตถุดิบ (component) อยู่ข้างใน */
    public function bomComponentOf(): HasMany
    {
        return $this->hasMany(ProductBomComponent::class, 'component_product_id');
    }

    /**
     * Apply smart defaults to this product. Sets pid and pname to the SKU if they are empty/null.
     */
    public function applySmartDefaults(): void
    {
        // pid/pname มักถูกผูกไว้กับ group จริงใน family_attributes เสมอ (เช่น
        // group "ข้อมูลทั่วไป") ตั้งแต่ product_values มี attribute_group_id
        // แล้ว (migration 2026_09_23_000001_add_attribute_group_id_to_product_values_table)
        // ต้องเขียนแถวเริ่มต้นเหล่านี้ให้ตรง group จริงตั้งแต่แรก ไม่งั้นแถวจะ
        // ถูกสร้างเป็น "ungrouped" (NULL) ทั้งที่ตอนโหลดหน้าแก้ไขสินค้า ฟิลด์นี้
        // ถูกวางไว้ใน group จริงอยู่แล้ว — ทำให้ค่าที่เพิ่ง set ไปหาไม่เจอ (ช่องว่าง
        // ในหน้าแก้ไข) แล้วพอ save โดยไม่ได้แตะฟิลด์นี้เลย จะส่ง groupKey
        // 'ungrouped' เดิมกลับไป ซึ่งไม่ตรงกับ placement จริงที่ ProductController::
        // update() ตรวจสอบอยู่ กลายเป็น validation error "invalid group placement"
        // ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิดเลย
        $familyAttributeResolver = app(EffectiveFamilyAttributeResolver::class);
        $effectiveFamilyIds = $familyAttributeResolver->effectiveFamilyIds($this);

        // 1. Set `pid` = SKU if empty/not set
        $pidAttr = Attribute::where('code', 'pid')->first();
        if ($pidAttr) {
            $pidGroupId = $familyAttributeResolver->primaryGroupIdFor($pidAttr->id, $effectiveFamilyIds);
            $exists = $this->values()
                ->where('attribute_id', $pidAttr->id)
                ->where('attribute_group_id', $pidGroupId)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->first();
            if (!$exists || $exists->value === null || $exists->value === '') {
                $this->values()->updateOrCreate(
                    [
                        'attribute_id' => $pidAttr->id,
                        'attribute_group_id' => $pidGroupId,
                        'channel_id' => null,
                        'locale_id' => null,
                    ],
                    ['value' => $this->sku]
                );
            }
        }

        // 2. Set `pname` = SKU for each locale if empty/not set — unless a
        // locale-agnostic value already exists in the global (locale_id
        // null) scope, which is where bulk import (see ProductRowImporter)
        // always writes locale-based attributes since it has no per-locale
        // columns. Without this, a freshly bulk-imported product's real
        // name would get shadowed by the raw SKU in every locale, since
        // read paths prefer the locale-specific row over the global one.
        $pnameAttr = Attribute::where('code', 'pname')->first();
        if ($pnameAttr) {
            $pnameGroupId = $familyAttributeResolver->primaryGroupIdFor($pnameAttr->id, $effectiveFamilyIds);
            $globalName = $this->values()
                ->where('attribute_id', $pnameAttr->id)
                ->where('attribute_group_id', $pnameGroupId)
                ->whereNull('channel_id')
                ->whereNull('locale_id')
                ->value('value');
            $defaultName = ($globalName !== null && $globalName !== '') ? $globalName : $this->sku;

            $locales = Locale::all();
            foreach ($locales as $locale) {
                $exists = $this->values()
                    ->where('attribute_id', $pnameAttr->id)
                    ->where('attribute_group_id', $pnameGroupId)
                    ->whereNull('channel_id')
                    ->where('locale_id', $locale->id)
                    ->first();
                if (!$exists || $exists->value === null || $exists->value === '') {
                    $this->values()->updateOrCreate(
                        [
                            'attribute_id' => $pnameAttr->id,
                            'attribute_group_id' => $pnameGroupId,
                            'channel_id' => null,
                            'locale_id' => $locale->id,
                        ],
                        ['value' => $defaultName]
                    );
                }
            }
        }
    }

    private const STOREFRONT_VERSION_KEY = 'storefront:version';

    /**
     * Cache-key version for StorefrontController::home()'s cached payload.
     * Bumped wherever ProductController already dispatches ProductDataChanged
     * (the same event that drives the storefront's live-reload websocket
     * channel) plus product creation, so the cache goes stale exactly when
     * the live-reloading browser tab would otherwise be shown fresh data —
     * see bumpStorefrontVersion() callers. Anything that changes storefront
     * data through another path (imports, marketplace syncs) isn't covered
     * by this version bump, but is still bounded by the cache's own TTL.
     */
    public static function storefrontVersion(): int
    {
        return (int) Cache::get(self::STOREFRONT_VERSION_KEY, 1);
    }

    public static function bumpStorefrontVersion(): void
    {
        Cache::forever(self::STOREFRONT_VERSION_KEY, self::storefrontVersion() + 1);
    }
}

