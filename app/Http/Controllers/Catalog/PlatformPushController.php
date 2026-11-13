<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductMarketplaceSyncJob;
use App\Models\SalesPlatformShop;
use App\Services\Marketplace\MarketplaceSyncGate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Step "Push ไป {platform}" of the Product Mapping object page — the ONLY place
 * that writes to a marketplace now (push / deactivate / delete / status check;
 * bulk push, Publish and auto-sync no longer push). This endpoint only reads:
 * every shop of the platform the user can access with its publish tick, live
 * status, Product Matching state (MarketplaceSyncGate::knownShopIds() — unknown
 * = a push creates a new listing) and last sync job, plus recent history and
 * what the user may do. The writes reuse ProductController's existing
 * per-shop endpoints (queueMarketplaceSync() & co.) and toggleShopPublished().
 */
class PlatformPushController extends Controller
{
    private const PLATFORMS = ['lazada', 'shopee', 'tiktok', 'woocommerce'];

    public function status(Request $request, Product $product, string $platform): JsonResponse
    {
        if (! in_array($platform, self::PLATFORMS, true)) {
            abort(404);
        }
        $user = $request->user();

        $shops = SalesPlatformShop::whereHas('platform', fn ($q) => $q->where('code', $platform))
            ->orderBy('name')
            ->get(['id', 'name', 'sales_platform_id', 'channel_id'])
            ->filter(fn (SalesPlatformShop $shop) => $user?->canAccessShop($shop))
            ->values();
        $shopIds = $shops->pluck('id');

        $pivot = DB::table('product_platform_shops')->where('product_id', $product->id)->whereIn('sales_platform_shop_id', $shopIds)
            ->get(['sales_platform_shop_id', 'status', 'platform_status', 'platform_item_id', 'last_synced_at'])->keyBy('sales_platform_shop_id');
        $known = (new MarketplaceSyncGate)->knownShopIds($product, $shops);
        $jobs = ProductMarketplaceSyncJob::where('product_id', $product->id)->whereIn('sales_platform_shop_id', $shopIds)
            ->orderByDesc('id')->limit(50)->get(['id', 'sales_platform_shop_id', 'action', 'status', 'message', 'created_at', 'updated_at']);
        $lastJob = $jobs->unique('sales_platform_shop_id')->keyBy('sales_platform_shop_id');
        $shopNames = $shops->pluck('name', 'id');

        $job = fn (ProductMarketplaceSyncJob $j) => [
            'id' => $j->id,
            'shop' => $shopNames[$j->sales_platform_shop_id] ?? null,
            'action' => $j->action,
            'status' => $j->status,
            'message' => $j->message,
            'created_at' => $j->created_at?->toIso8601String(),
        ];

        return response()->json([
            'product' => [
                'enabled' => (bool) $product->enabled,
                'status' => $product->status,
                'status_allows_publish' => Product::canPublishWithStatus($product->status),
            ],
            'can_push' => (bool) $user?->hasPermission("marketplace_{$platform}", "push_products_{$platform}"),
            'can_toggle' => (bool) $user?->hasPermission('sales_channels', 'edit_sales_channels'),
            'shops' => $shops->map(fn (SalesPlatformShop $shop) => [
                'id' => $shop->id,
                'name' => $shop->name,
                'published' => $pivot->has($shop->id),
                'is_live' => ($pivot->get($shop->id)?->status ?? null) === 'live',
                'live_synced_at' => $pivot->get($shop->id)?->last_synced_at,
                'platform_status' => $pivot->get($shop->id)?->platform_status,
                'platform_item_id' => $pivot->get($shop->id)?->platform_item_id,
                'known' => in_array($shop->id, $known, true),
                'last_job' => ($j = $lastJob->get($shop->id)) ? $job($j) : null,
            ])->values(),
            'history' => $jobs->take(10)->map($job)->values(),
        ]);
    }
}
