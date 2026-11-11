<?php

namespace App\Services\Marketplace\Listings;

use App\Models\Product;
use App\Models\SalesPlatformShop;
use App\Models\User;
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
