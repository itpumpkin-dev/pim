<?php

namespace App\Services\Marketplace\Listings;

use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * "จับคู่แล้วหรือยัง" per top-level product for the per-platform
 * "สินค้า (Product Mapping)" tables (lazadaProducts()/shopeeProducts()/
 * tiktokProducts()/woocommerceProducts()) — same "linked" rule as
 * MarketplaceListing::scopeLinked() / ProductMatchingController: a listing on
 * one of the platform's shops points at the product (product_id, incl. packs)
 * or holds it as a bundle component. A listing linked to one of the product's
 * variants counts for the parent row. Only shops the user can access
 * (User::canAccessShop()) are considered.
 */
class ProductMatchStatus
{
    /**
     * @param  Collection<int, Product>  $products  top-level products with `variants` loaded
     * @param  string|null  $platform  null = every platform (edit page heading)
     * @return array<int, list<string>> top-level product id => names of the shops it is matched on
     */
    public static function matchedShopsByProduct(Collection $products, ?string $platform, ?User $user): array
    {
        return array_map(fn (array $listings) => self::shopNames($listings), self::matchedListingsByProduct($products, $platform, $user));
    }

    /**
     * "Matching" filter of the Product Mapping tables — same rule as
     * matchedListingsByProduct() (a listing on one of the platform's accessible
     * shops links the product or one of its variants, directly or as a bundle
     * component), as SQL so it filters before pagination. $query is on `products`.
     */
    public static function applyMatchingFilter(Builder $query, string $platform, ?User $user, bool $matched): Builder
    {
        $shopIds = SalesPlatformShop::whereHas('platform', fn ($q) => $q->where('code', $platform))
            ->get(['id', 'sales_platform_id'])
            ->filter(fn (SalesPlatformShop $shop) => $user?->canAccessShop($shop))
            ->pluck('id')->all() ?: [0];

        return $matched
            ? $query->whereIn('products.id', self::matchedParentIdsQuery($shopIds))
            : $query->whereNotIn('products.id', self::matchedParentIdsQuery($shopIds));
    }

    /**
     * Top-level product ids linked on these shops, as ONE set-based subquery
     * (listing / bundle component → its product → that product's parent, or
     * itself) — the earlier per-product correlated EXISTS (with an OR and a
     * nested variant lookup) took 4-7 s per query over ~23k products; this is
     * a single hash semi-join. COALESCE never yields NULL, so NOT IN is safe.
     *
     * @param  list<int>  $shopIds
     */
    private static function matchedParentIdsQuery(array $shopIds): \Illuminate\Database\Query\Builder
    {
        $direct = DB::table('marketplace_listings as ml')
            ->join('products as lp', 'lp.id', '=', 'ml.product_id')
            ->whereIn('ml.sales_platform_shop_id', $shopIds)
            ->selectRaw('COALESCE(lp.parent_id, lp.id) as id');

        $components = DB::table('marketplace_listing_components as mc')
            ->join('marketplace_listings as mlc', 'mlc.id', '=', 'mc.marketplace_listing_id')
            ->join('products as cp', 'cp.id', '=', 'mc.product_id')
            ->whereIn('mlc.sales_platform_shop_id', $shopIds)
            ->selectRaw('COALESCE(cp.parent_id, cp.id) as id');

        return $direct->union($components);
    }

    /**
     * @param  list<array{shop: string}>  $listings  one product's entry of matchedListingsByProduct()
     * @return list<string> distinct shop names, sorted
     */
    public static function shopNames(array $listings): array
    {
        $names = array_values(array_unique(array_column($listings, 'shop')));
        sort($names);

        return $names;
    }

    /**
     * The linked listings themselves — one per (shop, item) — for the
     * "รายละเอียดสินค้าบนแพลตฟอร์ม" button of the Product Mapping tables
     * (opens ProductMatchingDetailDialog by listing id).
     *
     * @param  Collection<int, Product>  $products  top-level products with `variants` loaded
     * @return array<int, list<array{id: int, item_id: string, seller_sku: ?string, name: ?string, shop: string, direct: bool}>>
     */
    public static function matchedListingsByProduct(Collection $products, ?string $platform, ?User $user): array
    {
        $parentOf = [];
        foreach ($products as $product) {
            $parentOf[$product->id] = $product->id;
            foreach ($product->variants as $variant) {
                $parentOf[$variant->id] = $product->id;
            }
        }
        if ($parentOf === []) {
            return [];
        }

        $shops = SalesPlatformShop::query()
            ->when($platform !== null, fn ($q) => $q->whereHas('platform', fn ($p) => $p->where('code', $platform)))
            ->get(['id', 'name', 'sales_platform_id'])
            ->filter(fn (SalesPlatformShop $shop) => $user?->canAccessShop($shop))
            ->keyBy('id');
        if ($shops->isEmpty()) {
            return [];
        }

        $productIds = array_keys($parentOf);
        $shopIds = $shops->keys()->all();

        $columns = ['l.id', 'l.item_id', 'l.seller_sku', 'l.name', 'l.sales_platform_shop_id'];

        $direct = DB::table('marketplace_listings as l')
            ->whereIn('l.sales_platform_shop_id', $shopIds)
            ->whereIn('l.product_id', $productIds)
            ->get([...$columns, 'l.product_id', DB::raw('true as direct')]);

        $components = DB::table('marketplace_listing_components as c')
            ->join('marketplace_listings as l', 'l.id', '=', 'c.marketplace_listing_id')
            ->whereIn('l.sales_platform_shop_id', $shopIds)
            ->whereIn('c.product_id', $productIds)
            ->get([...$columns, 'c.product_id', DB::raw('false as direct')]);

        $result = [];
        foreach ($direct->concat($components)->sortBy('id') as $row) {
            $parentId = $parentOf[$row->product_id];
            // variant rows of one item share its detail — one entry per (shop, item)
            $result[$parentId][$row->sales_platform_shop_id.':'.$row->item_id] ??= [
                'id' => (int) $row->id,
                'item_id' => (string) $row->item_id,
                'seller_sku' => $row->seller_sku,
                'name' => $row->name,
                'shop' => $shops->get($row->sales_platform_shop_id)->name,
                // linked to this product itself (not as a bundle component) — importable
                'direct' => (bool) $row->direct,
            ];
        }

        return array_map(function (array $listings) {
            $listings = array_values($listings);
            usort($listings, fn ($a, $b) => [$a['shop'], $a['seller_sku']] <=> [$b['shop'], $b['seller_sku']]);

            return $listings;
        }, $result);
    }
}
