<?php

namespace App\Services;

use App\Events\NotificationCreated;
use App\Models\User;
use App\Notifications\JobResultNotification;

/**
 * Single call site every background job uses to tell one user "your thing
 * finished" — writes the persisted row (JobResultNotification's `database`
 * channel, read back by NotificationController for the bell's dropdown/
 * unread count) and fires the real-time push (NotificationCreated, over the
 * same `user.{id}` private channel UserPermissionsChanged already uses) in
 * one go, so every call site (SyncTikTokBrandsJob and siblings,
 * SyncProductToMarketplaceJob) doesn't have to remember to do both.
 *
 * Also used synchronously, not just from queued jobs — e.g.
 * ProductController::update()/updateMasterCategories() call this right
 * inline (not via a job) when a PIM category change leaves a platform
 * category mapping unset, so the admin still has a record of it in the
 * bell's history even after the one-shot flash toast on that same save has
 * long since disappeared.
 *
 * Silently no-ops when $userId is null/unknown — every current call site
 * only has a user to notify when a human triggered the job themselves
 * (JobTracker.user_id / SyncProductToMarketplaceJob.$userId), which can
 * legitimately be null (e.g. an auto-sync path) — that's "nobody asked to
 * be told", not an error.
 */
class AppNotifier
{
    /**
     * @param  'success'|'failed'|'warning'  $status
     */
    public static function notify(?int $userId, string $title, string $body, string $status, ?string $url = null): void
    {
        if (! $userId) {
            return;
        }

        $user = User::find($userId);
        if (! $user) {
            return;
        }

        $user->notify(new JobResultNotification($title, $body, $status, $url));

        // Re-fetch rather than trust the Notification instance itself —
        // ->notify() is what actually assigns the row's uuid/created_at via
        // the database channel's ChannelManager, not something visible on
        // the JobResultNotification object we just built.
        $row = $user->notifications()->latest('id')->first();
        if (! $row) {
            return;
        }

        event(new NotificationCreated($userId, [
            'id' => $row->id,
            'title' => $title,
            'body' => $body,
            'status' => $status,
            'url' => $url,
            'read_at' => null,
            'created_at' => $row->created_at?->toIso8601String(),
        ]));
    }
}
