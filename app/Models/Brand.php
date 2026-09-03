<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * "แบรนด์" (Brands) master row — ดูแลผ่าน /catalog/brands (BrandController)
 * ผูก master_source = 'brands' เข้ากับ attribute `pbrand` (ดู
 * MasterAttributeOptionSync) เพื่อ mirror ตัวเลือกของ attribute นั้น มีชื่อที่
 * แปลได้หลายภาษาจริง (เหมือน Category/BaseUnit) เลยมี translations() แยก
 * ออกมา นอกจากนั้นยังพ่วง marketplace brand id ของ Shopee/Lazada/TikTok/
 * WooCommerce (informational — ไม่มี FK constraint จริง ใช้จับคู่เฉยๆ) กับ
 * ลำดับชั้นแบรนด์แม่-ลูก (parent_id) มาด้วย — ResolvesProductAttributeValues::
 * mappedBrandOptionId() อ่าน 4 คอลัมน์ marketplace ID นี้ตรงๆ ตอน push สินค้า
 * ไป marketplace
 */
class Brand extends Model
{
    use Auditable;

    protected $with = ['translations'];

    protected $fillable = [
        'code',
        'name',
        'slug',
        'description',
        'thumbnail',
        'parent_id',
        'shopee_brand_id',
        'lazada_brand_id',
        'tiktok_brand_id',
        'woocommerce_brand_id',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function translations(): HasMany
    {
        return $this->hasMany(BrandTranslation::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

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
}
