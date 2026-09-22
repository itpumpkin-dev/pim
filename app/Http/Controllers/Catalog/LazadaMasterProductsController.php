<?php

namespace App\Http\Controllers\Catalog;

use App\Http\Controllers\Controller;
use App\Models\LazadaProduct;
use App\Models\SalesPlatformShop;
use App\Services\Lazada\LazadaProductSyncService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "Master Product List" — การ์ดที่ 4 ของ platform-hub.tsx (Lazada เท่านั้น
 * ตอนนี้) — โชว์ทุก listing ที่จริงๆ อยู่บน Lazada (cache ไว้ในตาราง
 * lazada_products โดย LazadaProductSyncService::syncMasterProductList())
 * ไม่ผูกกับ PIM Product เลย ต่างจากหน้า lazada-products.tsx (Product Mapping)
 * ที่เริ่มจากฝั่ง PIM Product แล้วไปหาว่า mapping ไป Lazada ไว้ยังไง — หน้านี้
 * เริ่มจากฝั่ง Lazada แล้วโชว์ว่าจริงๆ มีอะไรอยู่บนนั้นบ้าง
 *
 * mirror ของ SalesPlatformController::syncLiveStatus()/syncShopLiveStatus()
 * สำหรับ action ที่เขียนข้อมูล — ต่างกันที่ sync() ด้านล่าง sync ครบทุกร้าน
 * ในคำขอเดียว (ไม่มี route ต่อร้านแยกใน v1 นี้ — จำนวน listing ต่อร้านที่ยืนยัน
 * แล้ว ~265 ตัวยังอยู่ในระดับที่ time limit เดียวรับได้สบายๆ เหมือนที่
 * syncLiveStatus() ทำอยู่แล้วทุกวันนี้)
 */
class LazadaMasterProductsController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->input('search', ''));
        $shopId = $request->input('shop_id');
        $perPage = (int) $request->input('per_page', 25);
        if (!in_array($perPage, [10, 25, 50, 100], true)) {
            $perPage = 25;
        }

        $query = LazadaProduct::query()->with('shop:id,name');

        if ($shopId) {
            $query->where('sales_platform_shop_id', $shopId);
        }

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('seller_sku', 'ilike', "%{$search}%")
                    ->orWhere('name', 'ilike', "%{$search}%");
            });
        }

        $products = $query->orderByDesc('last_synced_at')
            ->paginate($perPage)
            ->withQueryString()
            ->through(fn (LazadaProduct $product) => [
                'id' => $product->id,
                'item_id' => (string) $product->item_id,
                'seller_sku' => $product->seller_sku,
                'shop_sku' => $product->shop_sku,
                'name' => $product->name,
                'status' => $product->status,
                'quantity' => $product->quantity,
                'price' => $product->price,
                'image_url' => $product->image_url,
                'lazada_url' => $product->lazada_url,
                'last_synced_at' => $product->last_synced_at,
                'shop' => $product->shop ? ['id' => $product->shop->id, 'name' => $product->shop->name] : null,
            ]);

        // ทุกร้าน Lazada ที่มีในระบบ (ไม่ใช่แค่ร้านที่มี lazada_products อยู่แล้ว)
        // — ให้ dropdown filter/ปุ่ม sync เห็นครบ แม้ร้านนั้นยังไม่เคย sync เลย
        $shops = SalesPlatformShop::whereNotNull('lazada_seller_account_id')
            ->orderBy('name')
            ->get(['id', 'name']);

        return Inertia::render('catalog/marketplace/lazada-master-products', [
            'products' => $products,
            'shops' => $shops,
            'filters' => [
                'search' => $search,
                'shop_id' => $shopId ? (int) $shopId : null,
                'per_page' => $perPage,
            ],
            'totalCached' => LazadaProduct::count(),
        ]);
    }

    /**
     * Sync ทุกร้าน Lazada ในคำขอเดียว — mirror ของ
     * SalesPlatformController::syncLiveStatus() เป๊ะ (per-shop try/catch,
     * ร้านหนึ่งพังไม่ทำให้ร้านอื่นหยุด, usleep ระหว่างร้านกัน rate limit)
     */
    public function sync(): RedirectResponse
    {
        set_time_limit(300);

        $shops = SalesPlatformShop::whereNotNull('lazada_seller_account_id')->get();

        $totalSynced = 0;
        $failed = 0;
        foreach ($shops as $shop) {
            try {
                $result = LazadaProductSyncService::forShop($shop)->syncMasterProductList($shop);
                $totalSynced += $result['synced'];
            } catch (\Throwable $e) {
                $failed++;
                Log::error('Lazada master-product-list sync failed for shop', [
                    'shop_id' => $shop->id,
                    'shop_name' => $shop->name,
                    'error' => $e->getMessage(),
                ]);
            }

            usleep(300_000);
        }

        $message = 'Synced '.($shops->count() - $failed)." of {$shops->count()} shop(s), {$totalSynced} product listing(s) cached.";
        if ($failed > 0) {
            $message .= " {$failed} shop(s) failed — check storage/logs/laravel.log.";
        }

        return back()->with('success', $message);
    }
}
