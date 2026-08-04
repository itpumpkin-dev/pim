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
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:sales_platforms,code'],
            'name' => ['required', 'string', 'max:255'],
        ]);

        SalesPlatform::create([
            ...$validated,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return back()->with('success', 'Platform created successfully.');
    }

    public function updatePlatform(Request $request, SalesPlatform $salesPlatform): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:sales_platforms,code,'.$salesPlatform->id],
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
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:sales_platform_shops,code,NULL,id,sales_platform_id,'.$salesPlatform->id],
            'name' => ['required', 'string', 'max:255'],
            'lazada_seller_account_id' => ['nullable', 'integer'],
            'is_active' => ['boolean'],
        ]);

        $salesPlatform->shops()->create([
            ...$validated,
            'created_by' => $request->user()?->id,
            'updated_by' => $request->user()?->id,
        ]);

        return back()->with('success', 'Shop created successfully.');
    }

    public function updateShop(Request $request, SalesPlatformShop $shop): RedirectResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:sales_platform_shops,code,'.$shop->id.',id,sales_platform_id,'.$shop->sales_platform_id],
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

            $this->ensureChannelFor($shop, $request);

            $synced++;
        }

        return back()->with('success', "Synced {$synced} Lazada shop(s).");
    }

    /**
     * Every shop needs a Channel so Edit Product's existing channel-based
     * value scoping (price, description, ...) can hold a value specific to
     * that shop — see the "sales platforms vs channels" design discussion.
     * Only ever creates once per shop; never touches an already-linked one.
     */
    private function ensureChannelFor(SalesPlatformShop $shop, Request $request): void
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
            'code' => 'lazada_'.$shop->code,
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
