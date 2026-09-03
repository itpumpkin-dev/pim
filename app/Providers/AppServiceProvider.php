<?php

namespace App\Providers;

use App\Listeners\AuditAuthEventSubscriber;
use App\Models\BaseUnit;
use App\Models\BaseUnitTranslation;
use App\Models\Brand;
use App\Models\BrandTranslation;
use App\Models\BusinessType;
use App\Models\BusinessTypeTranslation;
use App\Models\Category;
use App\Models\CategoryTranslation;
use App\Models\CommissionGroup;
use App\Models\Currency;
use App\Models\CurrencyTranslation;
use App\Models\Point;
use App\Models\ProductGrade;
use App\Models\ProductGradeTranslation;
use App\Models\ProductType;
use App\Models\ProductTypeTranslation;
use App\Models\Vendor;
use App\Models\VendorTranslation;
use App\Services\Catalog\MasterAttributeOptionSync;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /** Master models whose rows mirror into a bound `select` attribute's options. */
    private const MASTER_MODELS = [Category::class, Point::class, CommissionGroup::class, BusinessType::class, Vendor::class, Currency::class, ProductType::class, BaseUnit::class, Brand::class, ProductGrade::class];

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Singleton so its attribute-id / locale lookups are resolved once
        // per request, not once per row during a bulk import.
        $this->app->singleton(MasterAttributeOptionSync::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Event::subscribe(AuditAuthEventSubscriber::class);

        // A `select` attribute with a `master_source` mirrors that master's
        // rows as its options (see MasterAttributeOptionSync). Any write to a
        // master model — controller CRUD, import, tinker — keeps the bound
        // attribute(s)' options in sync.
        $sync = fn (): MasterAttributeOptionSync => $this->app->make(MasterAttributeOptionSync::class);
        foreach (self::MASTER_MODELS as $modelClass) {
            $modelClass::saved(fn (Model $model) => $sync()->syncModel($model));
            $modelClass::deleted(fn (Model $model) => $sync()->forgetModel($model));
        }
        // Category names live on a sibling model — re-sync the parent category.
        $syncTranslationParent = function (CategoryTranslation $translation) use ($sync): void {
            if ($category = $translation->category) {
                $sync()->syncModel($category);
            }
        };
        CategoryTranslation::saved($syncTranslationParent);
        CategoryTranslation::deleted($syncTranslationParent);

        // เหตุผลเดียวกับ CategoryTranslation ด้านบน — ชื่อของ BaseUnit ก็มีหลาย
        // locale อยู่บนโมเดลลูกแยกต่างหาก (base_unit_translations) ไม่ใช่คอลัมน์
        // เดียวบน base_units เอง
        $syncBaseUnitTranslationParent = function (BaseUnitTranslation $translation) use ($sync): void {
            if ($baseUnit = $translation->baseUnit) {
                $sync()->syncModel($baseUnit);
            }
        };
        BaseUnitTranslation::saved($syncBaseUnitTranslationParent);
        BaseUnitTranslation::deleted($syncBaseUnitTranslationParent);

        // เหตุผลเดียวกัน — ชื่อของ Brand ก็มีหลาย locale อยู่บนโมเดลลูกแยก
        // ต่างหาก (brand_translations) เช่นกัน
        $syncBrandTranslationParent = function (BrandTranslation $translation) use ($sync): void {
            if ($brand = $translation->brand) {
                $sync()->syncModel($brand);
            }
        };
        BrandTranslation::saved($syncBrandTranslationParent);
        BrandTranslation::deleted($syncBrandTranslationParent);

        // เหตุผลเดียวกัน — BusinessType/Currency/ProductType เพิ่งได้คำแปลหลาย
        // ภาษาจริงแบบเดียวกัน (ดู migration create_business_type_translations_table/
        // create_currency_translations_table/create_product_type_translations_table)
        $syncBusinessTypeTranslationParent = function (BusinessTypeTranslation $translation) use ($sync): void {
            if ($businessType = $translation->businessType) {
                $sync()->syncModel($businessType);
            }
        };
        BusinessTypeTranslation::saved($syncBusinessTypeTranslationParent);
        BusinessTypeTranslation::deleted($syncBusinessTypeTranslationParent);

        $syncCurrencyTranslationParent = function (CurrencyTranslation $translation) use ($sync): void {
            if ($currency = $translation->currency) {
                $sync()->syncModel($currency);
            }
        };
        CurrencyTranslation::saved($syncCurrencyTranslationParent);
        CurrencyTranslation::deleted($syncCurrencyTranslationParent);

        $syncProductTypeTranslationParent = function (ProductTypeTranslation $translation) use ($sync): void {
            if ($productType = $translation->productType) {
                $sync()->syncModel($productType);
            }
        };
        ProductTypeTranslation::saved($syncProductTypeTranslationParent);
        ProductTypeTranslation::deleted($syncProductTypeTranslationParent);

        // เหตุผลเดียวกัน — ชื่อของ Vendor ก็มีหลาย locale อยู่บนโมเดลลูกแยกต่างหาก
        // (vendor_translations) ยุบมาจากคอลัมน์ name_en เดิม (ดู migration
        // create_vendor_translations_table)
        $syncVendorTranslationParent = function (VendorTranslation $translation) use ($sync): void {
            if ($vendor = $translation->vendor) {
                $sync()->syncModel($vendor);
            }
        };
        VendorTranslation::saved($syncVendorTranslationParent);
        VendorTranslation::deleted($syncVendorTranslationParent);

        // เหตุผลเดียวกัน — ชื่อของ ProductGrade ก็มีหลาย locale อยู่บนโมเดลลูกแยก
        // ต่างหาก (product_grade_translations) เช่นกัน
        $syncProductGradeTranslationParent = function (ProductGradeTranslation $translation) use ($sync): void {
            if ($productGrade = $translation->productGrade) {
                $sync()->syncModel($productGrade);
            }
        };
        ProductGradeTranslation::saved($syncProductGradeTranslationParent);
        ProductGradeTranslation::deleted($syncProductGradeTranslationParent);

        // routes/api.php had no throttling at all — enabled via
        // ->throttleApi() in bootstrap/app.php, which applies this 'api'
        // limiter to the whole group. Keyed by API key when present (so one
        // integration's usage doesn't starve another's) falling back to IP
        // for the unauthenticated show() lookup.
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(60)->by($request->header('X-API-Key') ?: $request->ip());
        });
    }
}
