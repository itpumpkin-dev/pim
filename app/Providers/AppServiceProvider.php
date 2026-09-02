<?php

namespace App\Providers;

use App\Listeners\AuditAuthEventSubscriber;
use App\Models\BusinessType;
use App\Models\Category;
use App\Models\CategoryTranslation;
use App\Models\CommissionGroup;
use App\Models\Currency;
use App\Models\Point;
use App\Models\ProductType;
use App\Models\Vendor;
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
    private const MASTER_MODELS = [Category::class, Point::class, CommissionGroup::class, BusinessType::class, Vendor::class, Currency::class, ProductType::class];

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
