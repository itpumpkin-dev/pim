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
use App\Models\TikTokSellerAccount;
use App\Services\Catalog\MarketplaceApiCatalog;
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

    /**
     * แท็บ "API Usage" — หน้าดูอ้างอิงว่าแอปนี้เรียก API อะไรของ marketplace บ้าง
     * (MarketplaceApiCatalog) พร้อมบอกด้วยว่าแต่ละแพลตฟอร์มมี credentials
     * ที่ใช้งานได้อยู่หรือเปล่า ตัวมันเองไม่เคยเรียก API ที่อยู่ในรายการนี้เลย
     * (ดู docblock ของคลาสนั้น) — "configured" เช็คแค่ว่า *มี* credentials อยู่
     * เท่านั้น ไม่ได้เช็คว่ามันยังใช้งานได้จริงหรือเปล่า
     */
    public function apiUsage(): Response
    {
        $platforms = MarketplaceApiCatalog::platforms();

        foreach (['lazada' => LazadaSellerAccount::class, 'shopee' => ShopeeSellerAccount::class, 'tiktok' => TikTokSellerAccount::class] as $key => $model) {
            $platforms[$key]['configured'] = $this->tokenTableHasRows($model);
        }

        $wooConfig = config('services.woocommerce');
        $platforms['woocommerce']['configured'] = ! empty($wooConfig['url']) && ! empty($wooConfig['consumer_key']) && ! empty($wooConfig['consumer_secret']);

        return Inertia::render('catalog/salesPlatforms/api-usage', [
            'platforms' => $platforms,
        ]);
    }

    /**
     * เช็คว่าตาราง token ของ n8n สำหรับแพลตฟอร์มนี้มีข้อมูลอยู่อย่างน้อย 1 แถวไหม —
     * คืนค่า `null` (ไม่ใช่ `false`) ถ้าเชื่อมต่อฐานข้อมูล n8n เองไม่ได้เลย เพื่อให้
     * หน้าจอแสดง "เช็คไม่ได้" แทนที่จะขึ้น "ยังไม่ได้ตั้งค่า" ซึ่งจะทำให้เข้าใจผิด
     * ทั้งที่จริงๆ แล้วเป็นปัญหาที่ infra
     *
     * @param  class-string<LazadaSellerAccount|ShopeeSellerAccount|TikTokSellerAccount>  $model
     */
    private function tokenTableHasRows(string $model): ?bool
    {
        try {
            return $model::query()->exists();
        } catch (\Throwable $e) {
            Log::warning('Could not reach n8n token table while building API usage view.', ['model' => $model, 'error' => $e->getMessage()]);

            return null;
        }
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

        $shop = CodeGenerator::createWithRetry(
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

        // เมธอด sync*Shops() ทั้งสามตัวด้านล่างทำแบบนี้ให้กับ shop ของ
        // Lazada/Shopee/TikTok อยู่แล้ว ส่วน shop ที่สร้างเองด้วยมือ (ซึ่งเป็นวิธีเดียว
        // ที่จะเพิ่ม shop ให้แพลตฟอร์มที่ไม่มีแหล่งบัญชีจากภายนอก เช่น WooCommerce)
        // ก็ต้องมี channel แบบเดียวกันนี้เหมือนกัน เพื่อให้ค่าของ product แยกตาม
        // ร้านได้ด้วย
        $this->ensureChannelFor($shop, $salesPlatform, $request);

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

        // เติม channel ย้อนหลังให้ shop ที่ถูกสร้างไว้ก่อนที่จะแก้ storeShop() ด้านบน
        // — ensureChannelFor() จะไม่ทำอะไรเลยถ้า $shop->channel_id ถูกตั้งค่าไว้แล้ว
        $this->ensureChannelFor($shop, $shop->platform, $request);

        return back()->with('success', 'Shop updated successfully.');
    }

    public function destroyShop(SalesPlatformShop $shop): RedirectResponse
    {
        $shop->delete();

        return back()->with('success', 'Shop deleted successfully.');
    }

    /**
     * ตัว bootstrap ที่รันครั้งเดียวหรือรันซ้ำก็ได้: ดึง Lazada shop ที่เชื่อมต่อ
     * ไว้แล้วใน n8n (lazada_tokens) เข้ามาใส่ใน sales_platform_shops ภายใต้
     * แพลตฟอร์ม 'lazada' โดย match กันด้วย seller_id ทำให้รันซ้ำแค่อัปเดตชื่อ
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

            if (! $shop->exists) {
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
     * bootstrap แบบเดียวกับ syncLazadaShops() ด้านบน แต่ดึงจาก shopee_tokens
     * ของ n8n เข้ามาใส่ใน sales_platform_shops ภายใต้แพลตฟอร์ม 'shopee' แทน
     * โดย match กันด้วย shop_id ดูที่ ShopeeSellerAccount ว่าทำไมตรงนี้ถึงใช้
     * ::all() แทน scope ::active() — เพราะ shopee_tokens ไม่มีคอลัมน์
     * is_active ให้กรอง
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

            if (! $shop->exists) {
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
     * bootstrap แบบเดียวกับ syncLazadaShops()/syncShopeeShops() ด้านบน แต่ดึงจาก
     * tiktok_tokens ของ n8n เข้ามาใส่ใน sales_platform_shops ภายใต้แพลตฟอร์ม
     * 'tiktok' แทน โดย match กันด้วย id (tiktok_tokens.id ซึ่งเป็น int auto-increment
     * เหมือน lazada_tokens.id — ต่างจาก shopee_tokens ที่ shop_id เป็น string)
     * ดูที่ TikTokSellerAccount ว่าทำไมตรงนี้ถึงใช้ ::all() แทน scope ::active()
     * — เพราะ tiktok_tokens ไม่มีคอลัมน์ is_active ให้กรอง เหมือนกับ shopee_tokens
     * เลย ใช้ shops_code (โค้ดร้านสั้นๆ ของ TikTok เอง เช่น "THLCVRLWA7") เป็น
     * shop code ในระบบเรา แทนที่จะใช้ seller_id ซึ่งเป็น string ยาวๆ คล้าย token
     * ที่ไม่เหมาะจะใช้เป็น identifier ที่คนอ่านเข้าใจได้หรือใช้ใน URL
     */
    public function syncTikTokShops(Request $request): RedirectResponse
    {
        $platform = SalesPlatform::firstOrCreate(
            ['code' => 'tiktok'],
            ['name' => 'TikTok', 'created_by' => $request->user()?->id, 'updated_by' => $request->user()?->id]
        );

        $synced = 0;
        foreach (TikTokSellerAccount::all() as $account) {
            $shop = SalesPlatformShop::firstOrNew([
                'sales_platform_id' => $platform->id,
                'tiktok_seller_account_id' => $account->id,
            ]);

            if (! $shop->exists) {
                $shop->code = 'shop_'.($account->shops_code ?: $account->id);
                $shop->created_by = $request->user()?->id;
            }

            $shop->name = trim($account->seller_name ?: $account->shops_code ?: (string) $account->id);
            $shop->is_active = true;
            $shop->updated_by = $request->user()?->id;
            $shop->save();

            $this->ensureChannelFor($shop, $platform, $request);

            $synced++;
        }

        return back()->with('success', "Synced {$synced} TikTok shop(s).");
    }

    /**
     * รีเฟรชสถานะ live-listing ตัวจริง (product_platform_shops.status/
     * platform_item_id/last_synced_at) ให้ทุก shop ของ Lazada ที่ active อยู่ —
     * เป็นตัวขับข้อมูลคอลัมน์ "Sales Channels" ในหน้ารายการ Products อ่านข้อมูล
     * จาก Lazada (LazadaProductSyncService::syncLiveStatus()) แล้วเขียนกลับ
     * เข้า DB ของเราเองเท่านั้น — เสี่ยงพอๆ กับ syncLazadaShops()/
     * CategoryController::syncLazadaCategories() ด้านบน รันซ้ำเมื่อไหร่ก็ได้
     * ปลอดภัย
     *
     * รันแบบ synchronous แทนที่จะเป็น queued job — เช็คจากของจริงแล้วเมื่อ
     * 2026-08-13: environment นี้มี job ค้างอยู่ในตาราง `jobs` ถึง 225 job
     * จากเมื่อ 5 วันก่อน (กระจุกอยู่ในช่วง ~20 นาทีเดียวกัน หลังจากนั้นไม่มีอีกเลย)
     * แปลว่า queue worker ไม่ได้รันอยู่แบบเสถียรในนี้ ถ้าเอาไปทำเป็น queue จะกลาย
     * เป็นแลก timeout ที่เห็นได้ชัด มาเป็น no-op แบบเงียบๆ แทน (dispatch ไปแล้ว
     * ขึ้น "success" แต่ไม่มีอะไรรันจริงเลย) ซึ่งแย่กว่าเดิม เลยใช้วิธีนี้แทน:
     * set_time_limit() ครอบคลุมทั้ง 8 shop × การเรียก Lazada แบบแบ่งหน้าหลาย
     * ครั้งต่อ shop (เช็คแล้วว่าเกินเพดาน 60 วินาทีเริ่มต้นของ PHP จริงๆ) และการ
     * พักสั้นๆ ระหว่าง shop ก็ช่วยกระจายการยิง request ลดโอกาส (ไม่ได้การันตี —
     * limit ของ Lazada เองก็ไม่เปิดเผยชัดเจน) โดนลิมิต "901: too frequent" ของ
     * Lazada ซึ่งเคยเกิดขึ้นกับ shop หนึ่งระหว่างรันก่อนจะแก้ตรงนี้
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

        $message = 'Synced live status for '.($shops->count() - $failed)." of {$shops->count()} shop(s), {$totalMatched} product(s) matched live.";
        if ($failed > 0) {
            $message .= " {$failed} shop(s) failed — check storage/logs/laravel.log.";
        }

        return back()->with('success', $message);
    }

    /**
     * sync แบบเดียวกับ syncLiveStatus() ด้านบน แต่ทำแค่ shop เดียว — เสร็จได้
     * สบายๆ ภายใน time limit เริ่มต้นของ PHP (วน pagination แค่ของ shop เดียว
     * ไม่ใช่ต่อกัน 8 shop) และใช้ rate limit ของ Lazada แค่ส่วนของ shop นี้เท่านั้น
     * ทำให้ shop ที่ sync แบบ bulk แล้วพัง (หรือแค่อยากเช็คไวๆ) รีทรายเฉพาะตัว
     * เองได้ โดยไม่ต้องรอ — หรือไปโดนลิมิตซ้ำผ่าน — shop ตัวอื่นๆ
     */
    public function syncShopLiveStatus(SalesPlatformShop $shop): RedirectResponse
    {
        if (! $shop->lazada_seller_account_id) {
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
     * ทุก shop ต้องมี Channel เพื่อให้กลไก scoping ค่าตาม channel ที่มีอยู่แล้วใน
     * หน้า Edit Product (price, description, ...) เก็บค่าเฉพาะของ shop นั้นได้
     * ด้วย — ดูที่บทสนทนาเรื่องดีไซน์ "sales platforms vs channels"
     * จะสร้างให้แค่ครั้งเดียวต่อ shop เท่านั้น ถ้ามี channel ผูกอยู่แล้วจะไม่แตะต้องเลย
     */
    private function ensureChannelFor(SalesPlatformShop $shop, SalesPlatform $platform, Request $request): void
    {
        if ($shop->channel_id) {
            return;
        }

        $defaultLocale = Locale::where('code', 'th')->first();
        $defaultCurrency = Currency::where('code', 'THB')->first();

        if (! $defaultLocale || ! $defaultCurrency) {
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

        // Channel::cachedAll() (ใช้โดยแผง Sales Channels ใน ProductController::edit()
        // และที่อื่นๆ) จะ key ด้วยเลขเวอร์ชันตัวนี้ ถ้าไม่ทำแบบนี้มันจะไม่มีทางรู้เลยว่ามี
        // channel ที่ถูกสร้างนอก ChannelController::store() — เช็คจากของจริงแล้วเมื่อ
        // 2026-08-20: channel ใหม่ของ shop มีอยู่ในฐานข้อมูลจริง แต่ไม่เคยโผล่ในลิสต์
        // Sales Channels ของหน้า edit product เลยจนกว่าจะเพิ่มบรรทัดนี้เข้าไป เพราะ
        // cache ของลิสต์ channel ไม่เคยถูก invalidate
        Channel::bumpListVersion();
    }
}
