<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * Pushed the moment a logged-in user's effective permissions change, so the
 * client can react immediately instead of waiting for their next request.
 * The actual logout is still enforced server-side by EnsureFreshPermissions
 * on whatever request follows — this event only nudges the client to make
 * that request right away instead of sitting idle on a stale session.
 */
class UserPermissionsChanged implements ShouldBroadcastNow
{
    use InteractsWithSockets;

    public function __construct(public int $userId)
    {
    }

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('user.'.$this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'permissions.changed';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [];
    }
}
