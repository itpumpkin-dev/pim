<?php

namespace App\Http\Controllers;

use App\Models\Attribute;
use App\Models\AttributeFamily;
use App\Models\AttributeGroup;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Channel;
use App\Models\Currency;
use App\Models\JobTracker;
use App\Models\Locale;
use App\Models\Product;
use App\Models\ProductViewEvent;
use App\Services\Catalog\ProductPresenter;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    private const CACHE_TTL = 300;

    private const EMPTY_STAT = ['value' => 0, 'trend' => null];

    private bool $forceRefresh = false;

    public function index(Request $request): Response
    {
        $this->forceRefresh = $request->boolean('refresh');

        $permissions = $request->user()?->getAllPermissions() ?? [];
        $canProducts = in_array('products.list_products', $permissions, true);
        $canCategories = in_array('categories.list_categories', $permissions, true);
        $canAttributes = in_array('attributes.list_attributes', $permissions, true);
        $canGroups = in_array('attribute_groups.list_attribute_groups', $permissions, true);
        $canFamilies = in_array('attribute_families.list_attribute_families', $permissions, true);
        $canLocales = in_array('locales.list_locales', $permissions, true);
        $canChannels = in_array('channels.list_channels', $permissions, true);
        $canJobTrackers = in_array('job_trackers.list_job_trackers', $permissions, true);
        $canActivityLogs = in_array('activity_logs.list_activity_logs', $permissions, true);

        $dateFrom = $request->query('date_from') ?: null;
        $dateTo = $request->query('date_to') ?: null;
        $categoryId = $canProducts && $request->query('category_id') ? (int) $request->query('category_id') : null;

        $recentLogs = collect();
        $activityTrendChart = [];
        if ($canActivityLogs) {
            $activityQuery = AuditLog::with('user')->orderBy('id', 'desc');
            if ($dateFrom) {
                $activityQuery->whereDate('created_at', '>=', $dateFrom);
            }
            if ($dateTo) {
                $activityQuery->whereDate('created_at', '<=', $dateTo);
            }
            $recentLogs = $activityQuery->limit(10)->get()->map(fn ($log) => $this->mapActivity($log));
            $activityTrendChart = $this->cacheRemember('chart:activityTrend', fn () => $this->activityTrendChart());
        }

        $productIdsInCategory = $categoryId
            ? Category::findOrFail($categoryId)->products()->pluck('products.id')
            : null;

        $topViewed = collect();
        $categoryOptions = collect();
        $lowStockCount = 0;
        $categoryPieChart = [];
        $productStat = self::EMPTY_STAT;
        if ($canProducts) {
            $productQuery = $productIdsInCategory !== null ? Product::whereIn('id', $productIdsInCategory) : Product::query();
            $productStat = $this->cachedStat('product:' . ($categoryId ?? 'all'), $productQuery);
            $topViewed = $this->cacheRemember('topViewed:' . ($categoryId ?? 'all') . ':' . app()->getLocale(), fn () => $this->topViewedProducts($productIdsInCategory));
            $categoryOptions = $this->cacheRemember('categoryOptions', fn () => Category::whereHas('products')->orderBy('name')->get(['id', 'name']));
            $lowStockCount = $this->cacheRemember('lowStock', fn () => $this->lowStockCount());
            $categoryPieChart = $this->cacheRemember('chart:categoryPie', fn () => $this->categoryPieChart());
        }

        $categoryStat = $canCategories ? $this->cachedStat('category', Category::query()) : self::EMPTY_STAT;
        $attributeStat = $canAttributes ? $this->cachedStat('attribute', Attribute::query()) : self::EMPTY_STAT;
        $groupStat = $canGroups ? $this->cachedStat('attribute_group', AttributeGroup::query()) : self::EMPTY_STAT;
        $familyStat = $canFamilies ? $this->cachedStat('attribute_family', AttributeFamily::query()) : self::EMPTY_STAT;
        $localeStat = $canLocales ? $this->cachedStat('locale', Locale::query()) : self::EMPTY_STAT;
        $channelStat = $canChannels ? $this->cachedStat('channel', Channel::query()) : self::EMPTY_STAT;

        // Currencies has no dedicated management page/permission yet, so the
        // count is informational only and visible to anyone who can reach
        // the dashboard (same as the "dashboards.list_dashboards" gate on
        // the route itself).
        $currencyStat = $this->cachedStat('currency', Currency::query());

        $failedJobsCount = $canJobTrackers ? $this->cacheRemember('failedJobs', fn () => JobTracker::where('status', 'failed')->count()) : 0;

        return Inertia::render('dashboard', [
            'totalProduct' => $productStat['value'],
            'totalProductTrend' => $productStat['trend'],
            'totalCategory' => $categoryStat['value'],
            'totalCategoryTrend' => $categoryStat['trend'],
            'totalAttribute' => $attributeStat['value'],
            'totalAttributeTrend' => $attributeStat['trend'],
            'totalGroup' => $groupStat['value'],
            'totalGroupTrend' => $groupStat['trend'],
            'totalFamilies' => $familyStat['value'],
            'totalFamiliesTrend' => $familyStat['trend'],
            'totalLocale' => $localeStat['value'],
            'totalLocaleTrend' => $localeStat['trend'],
            'totalCurrencies' => $currencyStat['value'],
            'totalCurrenciesTrend' => $currencyStat['trend'],
            'totalChannels' => $channelStat['value'],
            'totalChannelsTrend' => $channelStat['trend'],
            'lowStockCount' => $lowStockCount,
            'recentActivities' => $recentLogs,
            'topViewedProducts' => $topViewed,
            'categoryOptions' => $categoryOptions,
            'failedJobsCount' => $failedJobsCount,
            'activityTrendChart' => $activityTrendChart,
            'categoryPieChart' => $categoryPieChart,
            'filters' => [
                'category_id' => $categoryId,
                'date_from' => $dateFrom,
                'date_to' => $dateTo,
            ],
        ]);
    }

    /**
     * Cache wrapper for the dashboard's expensive-ish counts/aggregates.
     * `?refresh=1` (wired to the Refresh button) forgets the key first so
     * the value is recomputed instead of served stale.
     */
    private function cacheRemember(string $key, Closure $callback): mixed
    {
        $fullKey = "dashboard:{$key}";
        if ($this->forceRefresh) {
            Cache::forget($fullKey);
        }

        return Cache::remember($fullKey, self::CACHE_TTL, $callback);
    }

    private function cachedStat(string $key, Builder $builder): array
    {
        return $this->cacheRemember("stat:{$key}", fn () => $this->statWithTrend($builder));
    }

    /**
     * Current count plus % change vs. the same query 7 days ago. Returns a
     * null trend (no badge) when there's nothing to compare against yet.
     */
    private function statWithTrend(Builder $builder): array
    {
        $now = (clone $builder)->count();
        $weekAgo = (clone $builder)->where('created_at', '<=', now()->subDays(7))->count();
        $trend = $weekAgo > 0 ? round((($now - $weekAgo) / $weekAgo) * 100, 1) : null;

        return ['value' => $now, 'trend' => $trend];
    }

    private function mapActivity(AuditLog $log): array
    {
        return [
            'id' => $log->id,
            'event' => $log->event,
            'user' => $log->user ? $log->user->name : 'System',
            'auditable_type' => $log->auditable_type ? basename(str_replace('\\', '/', $log->auditable_type)) : null,
            'auditable_id' => $log->auditable_id,
            'created_at' => $log->created_at->toIso8601String(),
        ];
    }

    /**
     * Products where current_stock is below min_stock. Both are catalog
     * attributes (EAV), not a real inventory system — count only reflects
     * whichever products have both values recorded.
     */
    private function lowStockCount(): int
    {
        $minStockId = Attribute::idForCode('min_stock');
        $currentStockId = Attribute::idForCode('current_stock');

        if (!$minStockId || !$currentStockId) {
            return 0;
        }

        return DB::table('product_values as cur')
            ->join('product_values as min', function ($join) use ($minStockId) {
                $join->on('cur.product_id', '=', 'min.product_id')->where('min.attribute_id', $minStockId);
            })
            ->where('cur.attribute_id', $currentStockId)
            ->whereRaw("CAST(NULLIF(cur.value, '') AS DECIMAL(15,4)) < CAST(NULLIF(min.value, '') AS DECIMAL(15,4))")
            ->distinct()
            ->count('cur.product_id');
    }

    /** Daily audit log activity for the last 30 days, zero-filled. */
    private function activityTrendChart(): array
    {
        $start = now()->subDays(29)->startOfDay();
        $counts = AuditLog::selectRaw('DATE(created_at) as date, COUNT(*) as count')
            ->where('created_at', '>=', $start)
            ->groupBy('date')
            ->pluck('count', 'date');

        $series = [];
        for ($i = 0; $i < 30; $i++) {
            $date = $start->copy()->addDays($i)->toDateString();
            $series[] = ['date' => $date, 'count' => (int) ($counts[$date] ?? 0)];
        }

        return $series;
    }

    /** Product count per category (top 8), for the category distribution pie chart. */
    private function categoryPieChart(): array
    {
        return DB::table('product_category')
            ->join('categories', 'categories.id', '=', 'product_category.category_id')
            ->select('categories.name', DB::raw('COUNT(*) as count'))
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('count')
            ->limit(8)
            ->get()
            ->map(fn ($row) => ['label' => $row->name, 'value' => (int) $row->count])
            ->all();
    }

    /**
     * Top 10 products by click count, optionally restricted to a set of
     * product ids (the active category filter).
     */
    private function topViewedProducts(?Collection $restrictToProductIds): Collection
    {
        $query = ProductViewEvent::selectRaw('product_id, COUNT(*) as views')
            ->where('event_type', 'click')
            ->whereNotNull('product_id');

        if ($restrictToProductIds !== null) {
            $query->whereIn('product_id', $restrictToProductIds);
        }

        $topViewedCounts = $query->groupBy('product_id')->orderByDesc('views')->limit(10)->get();

        $products = Product::whereIn('id', $topViewedCounts->pluck('product_id'))->get();
        $mappedById = collect(ProductPresenter::mapMany($products, app()->getLocale()))->keyBy('id');

        return $topViewedCounts
            ->map(function ($row) use ($mappedById) {
                $product = $mappedById->get($row->product_id);
                if (!$product) {
                    return null;
                }

                return [
                    'id' => $product['id'],
                    'sku' => $product['sku'],
                    'name' => $product['name'],
                    'category' => $product['category'],
                    'image' => $product['image'] ?? null,
                    'views' => (int) $row->views,
                ];
            })
            ->filter()
            ->values();
    }
}
