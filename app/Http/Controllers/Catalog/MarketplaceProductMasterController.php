<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Attribute;
use App\Models\Locale;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\ProductValue;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Marketplace Product Master" (the card of มาสเตอร์ > มาร์เก็ตเพลส): every listing
 * the shops of every platform actually sell (filterable by platform / shop) — marketplace_listings (written by the
 * listing sync / Product Matching "ซิงค์") plus, when it was fetched, the
 * item's cached detail (marketplace_listing_details: brand / category /
 * images / package) — with the PIM product it is matched to. Read-only: the
 * row detail reuses the Product Matching detail dialog. Only shops the user
 * can access (User::canAccessShop()).
 */
class MarketplaceProductMasterController extends Controller
{
    public const PLATFORMS = ['lazada' => 'Lazada', 'shopee' => 'Shopee', 'tiktok' => 'TikTok', 'woocommerce' => 'WooCommerce'];

    private const MATCHING = ['all', 'matched', 'unmatched'];

    private const STATUS = ['all', 'active', 'inactive'];

    private const PER_PAGE = [10, 25, 50, 100];

    public function index(Request $request): Response
    {
        $platform = array_key_exists((string) $request->input('platform'), self::PLATFORMS) ? (string) $request->input('platform') : null;
        $allShops = $this->shops($request);
        $shops = $platform ? $allShops->filter(fn (SalesPlatformShop $s) => MarketplaceListingFetcherResolver::platformKey($s) === $platform)->values() : $allShops;
        $shopIds = $shops->pluck('id')->all();

        $shopId = (int) $request->input('shop_id', 0);
        if ($shopId !== 0 && ! in_array($shopId, $shopIds, true)) {
            $shopId = 0;
        }
        $search = trim((string) $request->input('search', ''));
        $matching = in_array($request->input('matching'), self::MATCHING, true) ? $request->input('matching') : 'all';
        $status = in_array($request->input('status'), self::STATUS, true) ? $request->input('status') : 'all';
        $perPage = in_array((int) $request->input('per_page'), self::PER_PAGE, true) ? (int) $request->input('per_page') : 25;

        $scope = fn () => MarketplaceListing::query()
            ->whereIn('marketplace_listings.sales_platform_shop_id', $shopId !== 0 ? [$shopId] : ($shopIds ?: [0]))
            ->whereNull('marketplace_listings.ignored_at');

        $query = $scope()
            ->with(['shop:id,name', 'product:id,sku,parent_id', 'components.product:id,sku,parent_id'])
            ->when($search !== '', function (Builder $q) use ($search) {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $q->where(fn (Builder $w) => $w->where('marketplace_listings.seller_sku', 'ilike', $like)
                    ->orWhere('marketplace_listings.name', 'ilike', $like)
                    ->orWhere('marketplace_listings.item_id', $search)
                    ->orWhereHas('product', fn ($p) => $p->where('sku', 'ilike', $like)));
            })
            ->when($status !== 'all', fn (Builder $q) => $q->where('marketplace_listings.is_active', $status === 'active'))
            ->when($matching === 'matched', fn (Builder $q) => $q->linked())
            ->when($matching === 'unmatched', fn (Builder $q) => $q->unlinked())
            ->orderBy('marketplace_listings.platform')
            ->orderBy('marketplace_listings.name')
            ->orderBy('marketplace_listings.id');

        $paginator = $query->paginate($perPage)->withQueryString();
        $page = $paginator->getCollection();

        $details = MarketplaceListingDetail::query()
            ->whereIn('sales_platform_shop_id', $page->pluck('sales_platform_shop_id')->unique()->values())
            ->whereIn('item_id', $page->pluck('item_id')->unique()->values())
            ->get(['sales_platform_shop_id', 'item_id', 'brand_name', 'category_name', 'images', 'package', 'fetched_at'])
            ->keyBy(fn ($d) => $d->sales_platform_shop_id.':'.$d->item_id);

        $productIds = $page->pluck('product_id')
            ->merge($page->flatMap(fn (MarketplaceListing $l) => $l->components->pluck('product_id')))
            ->filter()->unique()->values();
        $names = $this->productNames($productIds);

        $paginator->through(function (MarketplaceListing $l) use ($details, $names) {
            $detail = $details->get($l->sales_platform_shop_id.':'.$l->item_id);

            return [
                'id' => $l->id,
                'item_id' => (string) $l->item_id,
                'variant_id' => (string) $l->variant_id,
                'seller_sku' => $l->seller_sku,
                'name' => $l->name,
                'status' => $l->status,
                'is_active' => (bool) $l->is_active,
                'price' => $l->price,
                'quantity' => $l->quantity,
                'image_url' => $l->image_url,
                'url' => $l->url,
                'last_synced_at' => $l->last_synced_at?->toIso8601String(),
                'data_changed_at' => $l->data_changed_at?->toIso8601String(),
                'shop' => $l->shop?->name,
                'platform' => $l->platform,
                // PIM products (parents — what the Product Mapping table lists) for its ?ids= deep link
                'mapping_ids' => collect([$l->product])->merge($l->components->pluck('product'))->filter()
                    ->map(fn ($p) => $p->parent_id ?? $p->id)->unique()->values()->all(),
                'detail' => $detail ? [
                    'brand' => $detail->brand_name,
                    'category' => $detail->category_name,
                    'image_count' => count($detail->images ?? []),
                    'weight_kg' => $detail->package['weight_kg'] ?? null,
                    'fetched_at' => $detail->fetched_at?->toIso8601String(),
                ] : null,
                'pim' => $l->product
                    ? ['type' => 'single', 'pack_quantity' => $l->pack_quantity, 'products' => [['id' => $l->product->id, 'sku' => $l->product->sku, 'name' => $names[$l->product->id] ?? null]]]
                    : ($l->components->isNotEmpty()
                        ? ['type' => 'bundle', 'pack_quantity' => null, 'products' => $l->components->filter(fn ($c) => $c->product)->map(fn ($c) => ['id' => $c->product->id, 'sku' => $c->product->sku, 'name' => $names[$c->product_id] ?? null])->values()->all()]
                        : null),
            ];
        });

        return Inertia::render('catalog/marketplace/product-master', [
            'platforms' => collect(self::PLATFORMS)
                ->filter(fn ($label, $key) => $allShops->contains(fn (SalesPlatformShop $s) => MarketplaceListingFetcherResolver::platformKey($s) === $key))
                ->map(fn ($label, $key) => ['value' => $key, 'label' => $label])->values(),
            'shops' => $shops->map(fn (SalesPlatformShop $s) => ['id' => $s->id, 'name' => $s->name, 'platform' => MarketplaceListingFetcherResolver::platformKey($s)])->values(),
            'rows' => $paginator,
            'stats' => [
                'total' => $scope()->count(),
                'active' => $scope()->where('marketplace_listings.is_active', true)->count(),
                'matched' => $scope()->linked()->count(),
                'last_synced_at' => $scope()->max('marketplace_listings.last_synced_at'),
            ],
            'filters' => [
                'platform' => $platform,
                'shop_id' => $shopId ?: null,
                'search' => $search,
                'matching' => $matching,
                'status' => $status,
                'per_page' => $perPage,
            ],
        ]);
    }

    /** @return Collection<int, SalesPlatformShop> */
    private function shops(Request $request): Collection
    {
        return SalesPlatformShop::with('platform:id,code,name')
            ->orderBy('name')
            ->get(['id', 'name', 'sales_platform_id', 'lazada_seller_account_id', 'shopee_seller_account_id', 'tiktok_seller_account_id'])
            ->filter(fn (SalesPlatformShop $shop) => MarketplaceListingFetcherResolver::platformKey($shop) !== null
                && $request->user()?->canAccessShop($shop))
            ->values();
    }

    /** @return array<int, string> product id => pname (active locale first, else locale-less) */
    private function productNames(Collection $productIds): array
    {
        $nameAttrId = Attribute::idForCode('pname');
        if (! $nameAttrId || $productIds->isEmpty()) {
            return [];
        }
        $localeId = Locale::idForCode(app()->getLocale());
        $names = [];
        foreach (ProductValue::whereIn('product_id', $productIds)->where('attribute_id', $nameAttrId)->whereNull('channel_id')
            ->where(fn ($q) => $q->whereNull('locale_id')->when($localeId, fn ($w) => $w->orWhere('locale_id', $localeId)))
            ->get(['product_id', 'locale_id', 'value']) as $v) {
            if (! isset($names[$v->product_id]) || $v->locale_id === $localeId) {
                $names[$v->product_id] = $v->value;
            }
        }

        return $names;
    }
}
