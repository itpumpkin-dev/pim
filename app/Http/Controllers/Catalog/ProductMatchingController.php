<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Jobs\SyncMarketplaceListingsJob;
use App\Models\Attribute;
use App\Models\Locale;
use App\Models\MarketplaceListing;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "จับคู่สินค้า (Product Matching)" — phase 1, read-only: per shop, which
 * marketplace listings (marketplace_listings, filled by
 * MarketplaceListingSyncService) are matched to a PIM product, which are not,
 * and which PIM products aren't listed on that shop at all.
 */
class ProductMatchingController extends Controller
{
    private const TABS = ['matched', 'unmatched', 'not_listed'];

    private const PLATFORM_ORDER = ['lazada', 'shopee', 'tiktok', 'woocommerce'];

    private const PLATFORM_LABEL = ['lazada' => 'Lazada', 'shopee' => 'Shopee', 'tiktok' => 'TikTok', 'woocommerce' => 'WooCommerce'];

    public function index(Request $request): Response
    {
        $shops = $this->accessibleShops($request);

        $stats = MarketplaceListing::query()
            ->whereIn('sales_platform_shop_id', $shops->pluck('id'))
            ->groupBy('sales_platform_shop_id')
            ->selectRaw('sales_platform_shop_id,
                count(*) as listing_count,
                count(product_id) as matched_count,
                sum(case when is_active then 1 else 0 end) as active_count,
                max(last_synced_at) as last_synced_at')
            ->get()
            ->keyBy('sales_platform_shop_id');

        $shopRows = $shops->map(function (SalesPlatformShop $shop) use ($stats) {
            $s = $stats->get($shop->id);

            return [
                'id' => $shop->id,
                'name' => $shop->name,
                'platform' => MarketplaceListingFetcherResolver::platformKey($shop),
                'listing_count' => (int) ($s->listing_count ?? 0),
                'matched_count' => (int) ($s->matched_count ?? 0),
                'active_count' => (int) ($s->active_count ?? 0),
                'last_synced_at' => $s?->last_synced_at,
            ];
        });

        $groups = collect(self::PLATFORM_ORDER)
            ->map(fn (string $platform) => [
                'platform' => $platform,
                'label' => self::PLATFORM_LABEL[$platform],
                'shops' => $shopRows->where('platform', $platform)->values()->all(),
            ])
            ->filter(fn (array $group) => $group['shops'] !== [])
            ->values();

        // Filters
        $shopId = (int) $request->input('shop_id', 0);
        if (! $shopRows->contains('id', $shopId)) {
            $platform = (string) $request->input('platform', '');
            $shopId = (int) ($shopRows->firstWhere('platform', $platform)['id'] ?? $shopRows->first()['id'] ?? 0);
        }
        $tab = in_array($request->input('tab'), self::TABS, true) ? $request->input('tab') : 'unmatched';
        $search = trim((string) $request->input('search', ''));
        $activeOnly = $request->has('active_only') ? $request->boolean('active_only') : true;
        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 25;
        }

        $filters = [
            'shop_id' => $shopId ?: null,
            'tab' => $tab,
            'search' => $search,
            'active_only' => $activeOnly,
            'per_page' => $perPage,
        ];

        $summary = ['matched' => 0, 'unmatched' => 0, 'not_listed' => 0];
        $rows = null;

        if ($shopId) {
            $summary = [
                'matched' => $this->listingQuery($shopId, $activeOnly, '')->whereNotNull('product_id')->count(),
                'unmatched' => $this->listingQuery($shopId, $activeOnly, '')->whereNull('product_id')->count(),
                'not_listed' => $this->notListedQuery($shopId, '')->count(),
            ];

            $rows = $tab === 'not_listed'
                ? $this->notListedRows($shopId, $search, $perPage)
                : $this->listingRows($shopId, $tab, $activeOnly, $search, $perPage);
        }

        return Inertia::render('catalog/marketplace/product-matching', [
            'shopGroups' => $groups,
            'filters' => $filters,
            'summary' => $summary,
            'rows' => $rows,
        ]);
    }

    /**
     * Queues a listing re-sync (read-only marketplace calls + exact-SKU
     * auto-match) for one shop, or for every shop the user can access.
     */
    public function sync(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'shop_id' => ['nullable', 'integer', 'exists:sales_platform_shops,id'],
        ]);

        $shops = $this->accessibleShops($request);
        if (! empty($validated['shop_id'])) {
            $shops = $shops->where('id', (int) $validated['shop_id'])->values();
            if ($shops->isEmpty()) {
                abort(403);
            }
        }

        foreach ($shops as $shop) {
            SyncMarketplaceListingsJob::dispatch($shop->id);
        }

        $message = $shops->count() === 1
            ? "เริ่มซิงค์ร้าน {$shops->first()->name} แล้ว — ข้อมูลจะอัปเดตเมื่อเสร็จ (อาจใช้เวลาหลายนาที) รีเฟรชหน้านี้เพื่อดูผล"
            : "เริ่มซิงค์ {$shops->count()} ร้านแล้ว — ข้อมูลจะอัปเดตเมื่อเสร็จ (อาจใช้เวลาหลายนาที)";

        return back()->with('success', $message);
    }

    /**
     * @return Collection<int, SalesPlatformShop>
     */
    private function accessibleShops(Request $request): Collection
    {
        $user = $request->user();

        return SalesPlatformShop::with('platform:id,name')
            ->orderBy('name')
            ->get(['id', 'name', 'sales_platform_id', 'lazada_seller_account_id', 'shopee_seller_account_id', 'tiktok_seller_account_id'])
            ->filter(fn (SalesPlatformShop $shop) => MarketplaceListingFetcherResolver::platformKey($shop) !== null
                && $user?->canAccessShop($shop))
            ->values();
    }

    private function listingQuery(int $shopId, bool $activeOnly, string $search): Builder
    {
        return MarketplaceListing::query()
            ->where('marketplace_listings.sales_platform_shop_id', $shopId)
            ->when($activeOnly, fn ($q) => $q->where('marketplace_listings.is_active', true))
            ->when($search !== '', function ($q) use ($search) {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $q->where(function ($w) use ($like, $search) {
                    $w->where('marketplace_listings.seller_sku', 'ilike', $like)
                        ->orWhere('marketplace_listings.name', 'ilike', $like)
                        ->orWhere('marketplace_listings.item_id', $search)
                        ->orWhereExists(fn ($e) => $e->select(DB::raw(1))->from('products')
                            ->whereColumn('products.id', 'marketplace_listings.product_id')
                            ->where('products.sku', 'ilike', $like));
                });
            });
    }

    private function listingRows(int $shopId, string $tab, bool $activeOnly, string $search, int $perPage)
    {
        $query = $this->listingQuery($shopId, $activeOnly, $search)
            ->with('product:id,sku')
            ->when($tab === 'matched', fn ($q) => $q->whereNotNull('product_id'), fn ($q) => $q->whereNull('product_id'))
            ->orderBy('seller_sku')
            ->orderBy('id');

        $paginator = $query->paginate($perPage)->withQueryString();
        $names = $this->productNames($paginator->getCollection()->pluck('product_id')->filter()->unique()->values());

        return $paginator->through(fn (MarketplaceListing $l) => [
            'id' => $l->id,
            'item_id' => $l->item_id,
            'variant_id' => $l->variant_id,
            'seller_sku' => $l->seller_sku,
            'name' => $l->name,
            'status' => $l->status,
            'is_active' => $l->is_active,
            'price' => $l->price,
            'quantity' => $l->quantity,
            'image_url' => $l->image_url,
            'url' => $l->url,
            'match_method' => $l->match_method,
            'matched_at' => $l->matched_at,
            'product' => $l->product ? [
                'id' => $l->product->id,
                'sku' => $l->product->sku,
                'name' => $names[$l->product->id] ?? null,
            ] : null,
            'sku_drift' => $l->product !== null && $l->product->sku !== trim((string) $l->seller_sku),
        ]);
    }

    private function notListedQuery(int $shopId, string $search): Builder
    {
        $nameAttrId = $search !== '' ? Attribute::idForCode('pname') : null;

        return Product::query()
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('marketplace_listings')
                ->where('marketplace_listings.sales_platform_shop_id', $shopId)
                ->whereColumn('marketplace_listings.product_id', 'products.id'))
            ->when($search !== '', function ($q) use ($search, $nameAttrId) {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $q->where(function ($w) use ($like, $nameAttrId) {
                    $w->where('products.sku', 'ilike', $like);
                    if ($nameAttrId) {
                        $w->orWhereExists(fn ($e) => $e->select(DB::raw(1))->from('product_values')
                            ->whereColumn('product_values.product_id', 'products.id')
                            ->where('product_values.attribute_id', $nameAttrId)
                            ->where('product_values.value', 'ilike', $like));
                    }
                });
            });
    }

    private function notListedRows(int $shopId, string $search, int $perPage)
    {
        $paginator = $this->notListedQuery($shopId, $search)
            ->orderBy('products.sku')
            ->paginate($perPage, ['products.id', 'products.sku'])
            ->withQueryString();

        $names = $this->productNames($paginator->getCollection()->pluck('id'));

        return $paginator->through(fn (Product $p) => [
            'id' => $p->id,
            'sku' => $p->sku,
            'name' => $names[$p->id] ?? null,
        ]);
    }

    /**
     * pname (product display name) for one page of products — the same
     * locale-aware lookup as LazadaAttributeMappingController::lazadaProducts().
     *
     * @param  Collection<int, int>  $productIds
     * @return array<int, string>
     */
    private function productNames(Collection $productIds): array
    {
        $nameAttrId = Attribute::idForCode('pname');
        if (! $nameAttrId || $productIds->isEmpty()) {
            return [];
        }

        $activeLocaleId = Locale::idForCode(app()->getLocale());
        $names = [];
        $values = ProductValue::whereIn('product_id', $productIds)
            ->where('attribute_id', $nameAttrId)
            ->whereNull('channel_id')
            ->where(function ($q) use ($activeLocaleId) {
                $q->whereNull('locale_id');
                if ($activeLocaleId) {
                    $q->orWhere('locale_id', $activeLocaleId);
                }
            })
            ->get(['product_id', 'locale_id', 'value']);

        foreach ($values as $v) {
            if (! isset($names[$v->product_id]) || $v->locale_id === $activeLocaleId) {
                $names[$v->product_id] = $v->value;
            }
        }

        return $names;
    }
}
