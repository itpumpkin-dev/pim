<?php

namespace App\Jobs;

use App\Models\AuditLog;
use App\Models\ProductMarketplaceSyncJob;
use App\Services\Lazada\LazadaProductSyncService;
use App\Services\Shopee\ShopeeProductSyncService;
use App\Services\TikTok\TikTokProductSyncService;
use App\Services\WooCommerce\WooCommerceProductSyncService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Runs one push/deactivate to Lazada or Shopee off the request thread — these
 * calls used to happen synchronously inside ProductController, which held a
 * web worker open for however long the marketplace API took (no timeout was
 * even set until this same pass added one to ShopeeClient/LazadaClient).
 *
 * No retry: push()/deactivate() already make their own HTTP calls with
 * connection-level retry (see LazadaClient/ShopeeClient::request()), and a
 * whole-job retry would redo a create-vs-update decision and image uploads
 * that already happened — not worth the risk for a real live write.
 */
class SyncProductToMarketplaceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public int $syncJobId, public ?int $userId = null) {}

    public function handle(): void
    {
        $record = ProductMarketplaceSyncJob::with(['product', 'shop'])->find($this->syncJobId);
        if (! $record || ! $record->product || ! $record->shop) {
            return;
        }

        $record->update(['status' => 'processing']);

        try {
            $service = match ($record->platform) {
                'lazada' => LazadaProductSyncService::forShop($record->shop),
                'shopee' => ShopeeProductSyncService::forShop($record->shop),
                'tiktok' => TikTokProductSyncService::forShop($record->shop),
                'woocommerce' => WooCommerceProductSyncService::forShop($record->shop),
                default => throw new \RuntimeException("Unknown marketplace platform: {$record->platform}"),
            };

            $result = $record->action === 'deactivate'
                ? $service->deactivate($record->product, $record->shop)
                : $service->push($record->product, $record->shop);

            $verb = $record->action === 'deactivate' ? 'Deactivated on' : 'Pushed to';
            $record->update([
                'status' => 'completed',
                'message' => "{$verb} '{$record->shop->name}' successfully.",
                'result' => $result,
            ]);

            $event = $record->action === 'deactivate'
                ? "deactivated_on_{$record->platform}"
                : "pushed_to_{$record->platform}";

            AuditLog::record($event, $record->product, null, [
                'shop_id' => $record->shop->id,
                'shop_name' => $record->shop->name,
            ], $this->userId);
        } catch (\Throwable $e) {
            $record->update(['status' => 'failed', 'message' => $e->getMessage()]);
        }
    }

    public function failed(\Throwable $exception): void
    {
        $record = ProductMarketplaceSyncJob::find($this->syncJobId);
        $record?->update(['status' => 'failed', 'message' => "Job failed: {$exception->getMessage()}"]);
    }
}
