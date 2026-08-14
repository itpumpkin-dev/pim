<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\ChannelTranslation;
use App\Models\Currency;
use App\Models\LazadaSellerAccount;
use App\Models\Locale;
use App\Models\SalesPlatform;
use App\Models\SalesPlatformShop;
use App\Models\ShopeeSellerAccount;
use App\Services\CodeGenerator;
use App\Services\Lazada\LazadaProductSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

class SalesPlatformController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('catalog/salesPlatforms/index', [
            'platforms' => SalesPlatform::with(['shops' => fn ($q) => $q->orderBy('name')])
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function storePlatform(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        CodeGenerator::createWithRetry('sales_platforms', 'platform', fn ($code) => SalesPlatform::create([
            ...$validated,
            'code' => $code,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]), maxLength: 50);

        return back()->with('success', 'Platform created successfully.');
    }

    public function updatePlatform(Request $request, SalesPlatform $salesPlatform): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $salesPlatform->update([
            ...$validated,
            'updated_by' => $request->user()?->id,
        ]);

        return back()->with('success', 'Platform updated successfully.');
    }

    public function destroyPlatform(SalesPlatform $salesPlatform): RedirectResponse
    {
        $salesPlatform->delete();

        return back()->with('success', 'Platform deleted successfully.');
    }

    public function storeShop(Request $request, SalesPlatform $salesPlatform): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'lazada_seller_account_id' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ]);

        CodeGenerator::createWithRetry(
            'sales_platform_shops',
            'shop',
            fn ($code) => $salesPlatform->shops()->create([
                ...$validated,
                'code' => $code,
                'created_by' => $request->user()?->id,
                'updated_by' => $request->user()?->id,
            ]),
            scope: ['sales_platform_id' => $salesPlatform->id],
        );

        return back()->with('success', 'Shop created successfully.');
    }

    public function updateShop(Request $request, SalesPlatformShop $shop): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'lazada_seller_account_id' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ]);

        $shop->update([
            ...$validated,
            'updated_by' => $request->user()?->id,
        ]);

        return back()->with('success', 'Shop updated successfully.');
    }

    public function destroyShop(SalesPlatformShop $shop): RedirectResponse
    {
        $shop->delete();

        return back()->with('success', 'Shop deleted successfully.');
    }

    /**
     * One-time/repeatable bootstrap: mirrors n8n's already-connected Lazada
     * shops (lazada_tokens) into sales_platform_shops under the 'lazada'
     * platform, matched by seller_id so re-running just updates names.
     */
    public function syncLazadaShops(Request $request): RedirectResponse
    {
        $platform = SalesPlatform::firstOrCreate(
            ['code' => 'lazada'],
            ['name' => 'Lazada', 'created_by' => $request->user()?->id, 'updated_by' => $request->user()?->id]
        );

        $synced = 0;
        foreach (LazadaSellerAccount::active()->get() as $account) {
            $shop = SalesPlatformShop::firstOrNew([
                'sales_platform_id' => $platform->id,
                'lazada_seller_account_id' => $account->id,
            ]);

            if (!$shop->exists) {
                $shop->code = 'seller_'.($account->seller_id ?: $account->id);
                $shop->created_by = $request->user()?->id;
            }

            $shop->name = trim($account->shop_name);
            $shop->is_active = true;
            $shop->updated_by = $request->user()?->id;
            $shop->save();

            $this->ensureChannelFor($shop, $platform, $request);

            $synced++;
        }

        return back()->with('success', "Synced {$synced} Lazada shop(s).");
    }

    /**
     * Same bootstrap as syncLazadaShops() above, but mirrors n8n's
     * shopee_tokens into sales_platform_shops under the 'shopee' platform,
     * matched by shop_id. See ShopeeSellerAccount for why this reads
     * ::all() rather than an ::active() scope — shopee_tokens has no
     * is_active column to filter on.
     */
    public function syncShopeeShops(Request $request): RedirectResponse
    {
        $platform = SalesPlatform::firstOrCreate(
            ['code' => 'shopee'],
            ['name' => 'Shopee', 'created_by' => $request->user()?->id, 'updated_by' => $request->user()?->id]
        );

        $synced = 0;
        foreach (ShopeeSellerAccount::all() as $account) {
            $shop = SalesPlatformShop::firstOrNew([
                'sales_platform_id' => $platform->id,
                'shopee_seller_account_id' => $account->shop_id,
            ]);

            if (!$shop->exists) {
                $shop->code = 'shop_'.$account->shop_id;
                $shop->created_by = $request->user()?->id;
            }

            $shop->name = trim($account->shop_name ?: $account->shop_id);
            $shop->is_active = true;
            $shop->updated_by = $request->user()?->id;
            $shop->save();

            $this->ensureChannelFor($shop, $platform, $request);

            $synced++;
        }

        return back()->with('success', "Synced {$synced} Shopee shop(s).");
    }

    /**
     * Refreshes real live-listing status (product_platform_shops.status/
     * platform_item_id/last_synced_at) for every active Lazada-linked shop —
     * powers the Products list's "Sales Channels" column. Reads from Lazada
     * (LazadaProductSyncService::syncLiveStatus()), writes only to our own
     * DB — same risk class as syncLazadaShops()/CategoryController::
     * syncLazadaCategories() above, safe to re-run any time.
     *
     * Runs synchronously rather than as a queued job — confirmed live,
     * 2026-08-13: this environment has 225 jobs stuck in the `jobs` table
     * from 5 days earlier (all clustered within one ~20-minute window, none
     * since), meaning a queue worker isn't reliably running here. Queuing
     * this would trade a visible timeout for a silent no-op (dispatched,
     * "success" shown, nothing ever actually runs) — worse. Instead:
     * set_time_limit() covers 8 shops × several paginated Lazada calls each
     * (confirmed to exceed PHP's default 60s ceiling live), and a short
     * pause between shops spreads out requests to reduce (not guarantee
     * against — Lazada's own limit is opaque) hitting Lazada's "901: too
     * frequent" rate limit, which one shop did mid-run before this fix.
     */
    public function syncLiveStatus(): RedirectResponse
    {
        set_time_limit(300);

        $shops = SalesPlatformShop::whereNotNull('lazada_seller_account_id')->get();

        $totalMatched = 0;
        $failed = 0;
        foreach ($shops as $shop) {
            try {
                $result = LazadaProductSyncService::forShop($shop)->syncLiveStatus($shop);
                $totalMatched += $result['matched'];
            } catch (\Throwable $e) {
                $failed++;
                Log::error('Lazada live-status sync failed for shop', [
                    'shop_id' => $shop->id,
                    'shop_name' => $shop->name,
                    'error' => $e->getMessage(),
                ]);
            }

            usleep(300_000);
        }

        $message = "Synced live status for ".($shops->count() - $failed)." of {$shops->count()} shop(s), {$totalMatched} product(s) matched live.";
        if ($failed > 0) {
            $message .= " {$failed} shop(s) failed — check storage/logs/laravel.log.";
        }

        return back()->with('success', $message);
    }

    /**
     * Same sync as syncLiveStatus() above, but for exactly one shop —
     * finishes well within PHP's default time limit (one shop's own
     * pagination loop, not eight shops' worth back to back) and only spends
     * this shop's share of Lazada's rate limit, so a shop that failed in the
     * bulk sync (or just needs a quicker check) can be retried on its own
     * without waiting on — or re-hitting the limit via — every other shop.
     */
    public function syncShopLiveStatus(SalesPlatformShop $shop): RedirectResponse
    {
        if (!$shop->lazada_seller_account_id) {
            return back()->with('error', "'{$shop->name}' has no linked Lazada account to sync from.");
        }

        try {
            $result = LazadaProductSyncService::forShop($shop)->syncLiveStatus($shop);

            return back()->with('success', "Synced '{$shop->name}': {$result['matched']} product(s) matched live (of {$result['total_live']} live on Lazada).");
        } catch (\Throwable $e) {
            Log::error('Lazada live-status sync failed for shop', [
                'shop_id' => $shop->id,
                'shop_name' => $shop->name,
                'error' => $e->getMessage(),
            ]);

            return back()->with('error', "Failed to sync '{$shop->name}': ".$e->getMessage());
        }
    }

    /**
     * Every shop needs a Channel so Edit Product's existing channel-based
     * value scoping (price, description, ...) can hold a value specific to
     * that shop — see the "sales platforms vs channels" design discussion.
     * Only ever creates once per shop; never touches an already-linked one.
     */
    private function ensureChannelFor(SalesPlatformShop $shop, SalesPlatform $platform, Request $request): void
    {
        if ($shop->channel_id) {
            return;
        }

        $defaultLocale = Locale::where('code', 'th')->first();
        $defaultCurrency = Currency::where('code', 'THB')->first();

        if (!$defaultLocale || !$defaultCurrency) {
            return;
        }

        $channel = Channel::create([
            'code' => $platform->code.'_'.$shop->code,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        $channel->locales()->sync([$defaultLocale->id]);
        $channel->currencies()->sync([$defaultCurrency->id]);

        foreach (Locale::where('enabled', true)->get() as $locale) {
            ChannelTranslation::create([
                'channel_id' => $channel->id,
                'locale_id' => $locale->id,
                'name' => $shop->name,
            ]);
        }

        $shop->channel_id = $channel->id;
        $shop->save();
    }
}
