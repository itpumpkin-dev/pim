<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * One notification-bell entry — the outcome of a background job the user
 * triggered themselves (brand/category sync, marketplace push/deactivate).
 * Database-only (`via()`); the real-time push to the shell bar is a
 * separate, plain App\Events\NotificationCreated fired by
 * AppNotifier::notify() right after this is created — see that class's
 * docblock for why a second event exists instead of relying on
 * Notification's own broadcast channel (this app already has an
 * established private-channel convention from UserPermissionsChanged, and
 * mixing that with Notification's own default `App.Models.User.{id}`
 * broadcast channel naming would need routes/channels.php to authorize a
 * second, differently-named channel for the exact same purpose).
 *
 * Deliberately generic (title/body/status/url) rather than one subclass per
 * job type — every job this feeds (SyncTikTokBrandsJob and siblings,
 * SyncProductToMarketplaceJob) only ever needs "what happened, did it
 * work, where can I see more" — see AppNotifier's per-job call sites for
 * the actual copy each one sends.
 */
class JobResultNotification extends Notification
{
    use Queueable;

    /**
     * @param  'success'|'failed'  $status
     */
    public function __construct(
        public string $title,
        public string $body,
        public string $status,
        public ?string $url = null,
    ) {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->title,
            'body' => $this->body,
            'status' => $this->status,
            'url' => $this->url,
        ];
    }
}
