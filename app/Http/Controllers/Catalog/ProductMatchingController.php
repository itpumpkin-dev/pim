<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Jobs\SyncMarketplaceListingsJob;
use App\Models\Attribute;
use App\Models\Locale;
use App\Models\MarketplaceListing;
use App\Models\MarketplaceListingDetail;
use App\Models\MarketplaceListingSyncRun;
use App\Models\Product;
use App\Models\ProductValue;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\Listings\ListingMatchSuggester;
use App\Services\Marketplace\Listings\ListingScoreSuggester;
use App\Services\Marketplace\Listings\MarketplaceListingFetcherResolver;
use App\Services\Marketplace\Listings\MarketplaceListingSyncRunner;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "จับคู่สินค้า (Product Matching)": per shop, which marketplace listings
 * (marketplace_listings, filled by MarketplaceListingSyncService) are linked
 * to PIM (single product / pack / bundle), which are not (with
 * ListingMatchSuggester rule suggestions, else the stored score-based
 * ListingScoreSuggester ones), which were hidden, and which PIM
 * products aren't listed on that shop at all. The write actions live in
 * ProductMatchingActionsController.
 */
class ProductMatchingController extends Controller
{
    private const TABS = ['matched', 'unmatched', 'suggested', 'ignored', 'not_listed'];

    /** "เฉพาะคะแนน ≥ N" filter values for score-based suggestions (0 = all) */
    private const MIN_SCORES = [0, 50, 60, 70, 80];

    public function __construct(
        private readonly ListingMatchSuggester $suggester,
        private readonly MarketplaceListingSyncRunner $runner,
    ) {}

    private const PLATFORM_ORDER = ['lazada', 'shopee', 'tiktok', 'woocommerce'];

    private const PLATFORM_LABEL = ['lazada' => 'Lazada', 'shopee' => 'Shopee', 'tiktok' => 'TikTok', 'woocommerce' => 'WooCommerce'];

    /** ?ids= from Marketplace Product Master's selection — every listing query is limited to these (null = no limit) */
    private ?array $onlyIds = null;

    public function index(Request $request): Response
    {
        $shops = $this->accessibleShops($request);

        $stats = MarketplaceListing::query()
            ->whereIn('sales_platform_shop_id', $shops->pluck('id'))
            ->groupBy('sales_platform_shop_id')
            ->selectRaw('sales_platform_shop_id,
                count(*) as listing_count,
                sum(case when product_id is not null or exists (select 1 from marketplace_listing_components c where c.marketplace_listing_id = marketplace_listings.id) then 1 else 0 end) as matched_count,
                sum(case when ignored_at is not null then 1 else 0 end) as ignored_count,
                sum(case when is_active then 1 else 0 end) as active_count,
                max(last_synced_at) as last_synced_at')
            ->get()
            ->keyBy('sales_platform_shop_id');

        $lastRuns = MarketplaceListingSyncRun::query()
            ->whereIn('id', MarketplaceListingSyncRun::query()
                ->whereIn('sales_platform_shop_id', $shops->pluck('id'))
                ->groupBy('sales_platform_shop_id')
                ->selectRaw('max(id)'))
            ->get()
            ->keyBy('sales_platform_shop_id');

        $shopRows = $shops->map(function (SalesPlatformShop $shop) use ($stats, $lastRuns) {
            $s = $stats->get($shop->id);
            $run = $lastRuns->get($shop->id);

            return [
                'id' => $shop->id,
                'name' => $shop->name,
                'platform' => MarketplaceListingFetcherResolver::platformKey($shop),
                'listing_count' => (int) ($s->listing_count ?? 0),
                'matched_count' => (int) ($s->matched_count ?? 0),
                'ignored_count' => (int) ($s->ignored_count ?? 0),
                'active_count' => (int) ($s->active_count ?? 0),
                'last_synced_at' => $s?->last_synced_at,
                'last_run' => $run ? $this->runPayload($run) : null,
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

        // ?ids= — listings picked on the Marketplace Product Master page: show only those
        // (in every tab / count), open their shop and the tab they're in unless asked otherwise
        $selection = collect(explode(',', (string) $request->input('ids', '')))->map(fn ($v) => (int) trim($v))->filter()->unique()->take(500);
        $selected = $selection->isEmpty() ? collect() : MarketplaceListing::query()
            ->whereIn('id', $selection)->whereIn('sales_platform_shop_id', $shops->pluck('id'))
            ->get(['id', 'sales_platform_shop_id']);
        $this->onlyIds = $selected->isEmpty() ? null : $selected->pluck('id')->all();

        // Filters
        $shopId = (int) $request->input('shop_id', 0);
        if ($this->onlyIds && ! $request->filled('shop_id')) {
            $shopId = (int) $selected->countBy('sales_platform_shop_id')->sortDesc()->keys()->first();
        }
        if (! $shopRows->contains('id', $shopId)) {
            $platform = (string) $request->input('platform', '');
            $shopId = (int) ($shopRows->firstWhere('platform', $platform)['id'] ?? $shopRows->first()['id'] ?? 0);
        }
        $tab = in_array($request->input('tab'), self::TABS, true) ? $request->input('tab') : 'matched';
        if ($this->onlyIds && ! $request->filled('tab')) {
            $tab = MarketplaceListing::whereIn('id', $this->onlyIds)->where('sales_platform_shop_id', $shopId)->linked()->exists() ? 'matched' : 'unmatched';
        }
        $search = trim((string) $request->input('search', ''));
        // a picked listing may be inactive — don't hide it behind the default "active only"
        $activeOnly = $request->has('active_only') ? $request->boolean('active_only') : $this->onlyIds === null;
        $minScore = (int) $request->input('min_score', 0);
        if (! in_array($minScore, self::MIN_SCORES, true)) {
            $minScore = 0;
        }
        $perPage = (int) $request->input('per_page', 25);
        if (! in_array($perPage, [25, 50, 100], true)) {
            $perPage = 25;
        }

        $filters = [
            'shop_id' => $shopId ?: null,
            'tab' => $tab,
            'search' => $search,
            'active_only' => $activeOnly,
            'min_score' => $minScore,
            'per_page' => $perPage,
            'ids' => $this->onlyIds ?? [],
        ];

        $summary = ['matched' => 0, 'unmatched' => 0, 'suggested' => 0, 'ignored' => 0, 'not_listed' => 0];
        $rows = null;

        if ($shopId) {
            // Suggestions for this shop's whole unmatched queue in one batched
            // pass (a few queries) — needed for the "มีคำแนะนำ" count/filter
            // anyway; the page rows below reuse it.
            $suggestions = $this->suggester->suggest(
                $this->listingQuery($shopId, $activeOnly, '')->unlinked()->pluck('seller_sku', 'id')->all()
            );
            // rule-based suggestions take precedence; listings without one
            // get their stored score-based suggestions (phase 3A)
            $suggestions += $this->scoreSuggestions($shopId, $activeOnly, $minScore, array_keys($suggestions));

            $summary = [
                'matched' => $this->listingQuery($shopId, $activeOnly, '')->linked()->count(),
                'unmatched' => $this->listingQuery($shopId, $activeOnly, '')->unlinked()->count(),
                'suggested' => count($suggestions),
                'ignored' => $this->listingQuery($shopId, $activeOnly, '')->whereNotNull('ignored_at')->count(),
                'not_listed' => $this->notListedQuery($shopId, '')->count(),
            ];

            $rows = $tab === 'not_listed'
                ? $this->notListedRows($shopId, $search, $perPage)
                : $this->listingRows($shopId, $tab, $activeOnly, $search, $perPage, $suggestions);
        }

        return Inertia::render('catalog/marketplace/product-matching', [
            'shopGroups' => $groups,
            'filters' => $filters,
            // selected listings per shop — the page says how many are in other shops
            'selection' => $selected->countBy('sales_platform_shop_id')->all(),
            'summary' => $summary,
            'rows' => $rows,
            'syncRuns' => $shopId ? MarketplaceListingSyncRun::where('sales_platform_shop_id', $shopId)
                ->orderByDesc('started_at')->orderByDesc('id')->limit(10)->get()
                ->map(fn (MarketplaceListingSyncRun $r) => $this->runPayload($r))->all() : [],
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

        // a shop whose sync is already running (button pressed twice, or the
        // nightly run is on it right now) isn't queued again
        $busy = $shops->filter(fn (SalesPlatformShop $shop) => $this->runner->isRunning($shop->id))->values();
        if ($busy->count() === $shops->count()) {
            return back()->with('warning', $shops->count() === 1
                ? "กำลังซิงค์ร้าน {$shops->first()->name} อยู่ — รอให้เสร็จแล้วรีเฟรชหน้านี้"
                : 'ทุกร้านกำลังซิงค์อยู่ — รอให้เสร็จก่อน');
        }
        $shops = $shops->reject(fn (SalesPlatformShop $shop) => $busy->contains('id', $shop->id))->values();

        foreach ($shops as $shop) {
            SyncMarketplaceListingsJob::dispatch($shop->id);
        }

        $message = $shops->count() === 1
            ? "เริ่มซิงค์ร้าน {$shops->first()->name} แล้ว — ข้อมูลจะอัปเดตเมื่อเสร็จ (อาจใช้เวลาหลายนาที) รีเฟรชหน้านี้เพื่อดูผล"
            : "เริ่มซิงค์ {$shops->count()} ร้านแล้ว — ข้อมูลจะอัปเดตเมื่อเสร็จ (อาจใช้เวลาหลายนาที)";
        if ($busy->isNotEmpty()) {
            $message .= ' — ข้าม '.$busy->pluck('name')->implode(', ').' (กำลังซิงค์อยู่)';
        }

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
            ->when($this->onlyIds !== null, fn ($q) => $q->whereIn('marketplace_listings.id', $this->onlyIds))
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

    /**
     * @param  array<int, list<array<string, mixed>>>  $suggestions  listing id => suggestions (unmatched queue only)
     */
    private function listingRows(int $shopId, string $tab, bool $activeOnly, string $search, int $perPage, array $suggestions)
    {
        $query = $this->listingQuery($shopId, $activeOnly, $search)
            ->with(['product:id,sku,parent_id', 'product.parent:id,sku', 'components.product:id,sku', 'ignoredBy:id,name'])
            ->when($tab === 'matched', fn ($q) => $q->linked())
            ->when($tab === 'unmatched', fn ($q) => $q->unlinked())
            ->when($tab === 'suggested', fn ($q) => $q->unlinked()->whereIn('marketplace_listings.id', array_keys($suggestions) ?: [0]))
            ->when($tab === 'ignored', fn ($q) => $q->whereNotNull('marketplace_listings.ignored_at'))
            ->orderBy('seller_sku')
            ->orderBy('id');

        $paginator = $query->paginate($perPage)->withQueryString();
        $page = $paginator->getCollection();
        $productIds = $page->pluck('product_id')
            ->merge($page->flatMap(fn (MarketplaceListing $l) => $l->components->pluck('product_id')))
            ->merge($page->flatMap(fn (MarketplaceListing $l) => collect($suggestions[$l->id] ?? [])->flatMap(fn ($s) => array_column($s['items'], 'product_id'))))
            ->filter()->unique()->values();
        $names = $this->productNames($productIds);

        // the listing's real category on the platform (cached item detail, may not be fetched
        // yet) — passed by the matched tab's "ไปหน้าแมพ" link so the Product Mapping page can
        // preselect it; platform category tables are keyed by the platform's own id
        $categoryByItem = $tab === 'matched'
            ? MarketplaceListingDetail::query()
                ->where('sales_platform_shop_id', $shopId)
                ->whereIn('item_id', $page->pluck('item_id')->unique()->values())
                ->whereNotNull('category_id')
                ->pluck('category_id', 'item_id')
            : collect();

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
                // the top-level product (a variant's parent) — what the per-platform
                // "สินค้า (Product Mapping)" table lists; target of the matched tab's
                // "ไปหน้าแมพ" link
                'mapping_product' => [
                    'id' => $l->product->parent?->id ?? $l->product->id,
                    'sku' => $l->product->parent?->sku ?? $l->product->sku,
                ],
            ] : null,
            'pack_quantity' => $l->pack_quantity,
            'listing_category_id' => ctype_digit((string) $categoryByItem->get($l->item_id)) ? (int) $categoryByItem->get($l->item_id) : null,
            'components' => $l->components->filter(fn ($c) => $c->product !== null)->map(fn ($c) => [
                'product_id' => $c->product_id,
                'sku' => $c->product->sku,
                'name' => $names[$c->product_id] ?? null,
                'quantity' => $c->quantity,
            ])->values()->all(),
            // only meaningful for links that claim "same SKU" — a pack /
            // accepted suggestion differs from the PIM SKU by design
            'sku_drift' => $l->product !== null && $l->product->sku !== trim((string) $l->seller_sku)
                && $l->match_method !== MarketplaceListing::MATCH_SUGGESTED && ! $l->pack_quantity,
            'suggestions' => array_map(fn (array $s) => [
                ...$s,
                'items' => array_map(fn (array $i) => $i + ['name' => $names[$i['product_id']] ?? null], $s['items']),
            ], array_slice($suggestions[$l->id] ?? [], 0, 3)),
            'ignored_at' => $l->ignored_at,
            'ignored_by' => $l->ignoredBy?->name,
            'ignore_reason' => $l->ignore_reason,
        ]);
    }

    /**
     * Stored score-based suggestions (marketplace_listing_suggestions) of the
     * shop's unlinked queue, in ListingMatchSuggester's shape (type
     * 'similar', confidence always 'low') plus score / reasons.
     *
     * @param  list<int>  $exclude  listings that already have a rule-based suggestion
     * @return array<int, list<array<string, mixed>>>
     */
    private function scoreSuggestions(int $shopId, bool $activeOnly, int $minScore, array $exclude): array
    {
        $rows = DB::table('marketplace_listing_suggestions as s')
            ->join('products', 'products.id', '=', 's.product_id')
            ->whereIn('s.marketplace_listing_id', $this->listingQuery($shopId, $activeOnly, '')->unlinked()->select('marketplace_listings.id'))
            ->when($exclude !== [], fn ($q) => $q->whereNotIn('s.marketplace_listing_id', $exclude))
            ->where('s.score', '>=', $minScore)
            ->orderBy('s.marketplace_listing_id')
            ->orderBy('s.rank')
            ->get(['s.marketplace_listing_id', 's.product_id', 's.score', 's.reasons', 'products.sku']);

        $out = [];
        foreach ($rows as $r) {
            $reasons = json_decode($r->reasons, true) ?: [];
            $out[(int) $r->marketplace_listing_id][] = [
                'type' => ListingScoreSuggester::TYPE,
                'confidence' => 'low',
                'items' => [['product_id' => (int) $r->product_id, 'sku' => $r->sku, 'quantity' => 1]],
                'pack_quantity' => null,
                'reason' => "คะแนน {$r->score}/100 — ".implode(' · ', $reasons),
                'score' => (int) $r->score,
                'reasons' => $reasons,
            ];
        }

        return $out;
    }

    private function runPayload(MarketplaceListingSyncRun $run): array
    {
        return [
            'id' => $run->id,
            'trigger' => $run->trigger,
            'status' => $run->status,
            'started_at' => $run->started_at,
            'finished_at' => $run->finished_at,
            'duration_ms' => $run->duration_ms,
            'stats' => $run->stats,
            'error' => $run->error,
        ];
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
