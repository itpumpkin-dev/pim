<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * Pushed the moment a database notification is created for a user, so the
 * shell-bar bell (NotificationBell.tsx) can show it immediately instead of
 * waiting for the next page load/poll — same shape and channel as
 * UserPermissionsChanged (private `user.{id}`, already authorized in
 * routes/channels.php), just a different event name so the two don't
 * collide on the same channel.
 *
 * Fired by AppNotifier::notify() right after the underlying
 * ->notify(new JobResultNotification(...)) call, carrying the just-created
 * row's own fields (not re-fetched) so the client can prepend it to its
 * list without a round-trip.
 */
class NotificationCreated implements ShouldBroadcastNow
{
    use InteractsWithSockets;

    /**
     * @param  array<string, mixed>  $notification
     */
    public function __construct(public int $userId, public array $notification)
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
        return 'notification.created';
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return $this->notification;
    }
}
