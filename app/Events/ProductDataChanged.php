<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * Pushed the moment a product's storefront-visible data changes — its own
 * fields (sku/family/type/enabled), any attribute value, or a delete — so the
 * public home/product-detail pages can refresh immediately instead of
 * showing stale data until next visit. Broadcast on a public channel since
 * these pages have no logged-in user. `enabled` always reflects the
 * product's current state so listeners can tell a "still visible, re-fetch
 * it" update apart from a "no longer visible, navigate away" one.
 */
class ProductDataChanged implements ShouldBroadcastNow
{
    use InteractsWithSockets;

    public function __construct(public int $productId, public bool $enabled)
    {
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new Channel('storefront')];
    }

    public function broadcastAs(): string
    {
        return 'product.updated';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'id' => $this->productId,
            'enabled' => $this->enabled,
        ];
    }
}
