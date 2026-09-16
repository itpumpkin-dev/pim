<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Backs the shell-bar notification bell (NotificationBell.tsx) — every
 * route here only ever touches the logged-in user's own notifications
 * ($request->user()->notifications()), never another user's, since there's
 * no id in any of these routes to target someone else's row with.
 */
class NotificationController extends Controller
{
    /**
     * Recent notifications + unread count, for both the bell's initial
     * badge and its dropdown list. Capped at 20 — this is a quick "what
     * just happened" list, not a full paginated archive.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'data' => $user->notifications()->latest('id')->limit(20)->get()->map(fn ($n) => [
                'id' => $n->id,
                'title' => $n->data['title'] ?? '',
                'body' => $n->data['body'] ?? '',
                'status' => $n->data['status'] ?? 'success',
                'url' => $n->data['url'] ?? null,
                'read_at' => $n->read_at?->toIso8601String(),
                'created_at' => $n->created_at?->toIso8601String(),
            ]),
            'unread_count' => $user->unreadNotifications()->count(),
        ]);
    }

    public function markRead(Request $request, string $notificationId): JsonResponse
    {
        $notification = $request->user()->notifications()->where('id', $notificationId)->first();
        $notification?->markAsRead();

        return response()->json(['unread_count' => $request->user()->unreadNotifications()->count()]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications->markAsRead();

        return response()->json(['unread_count' => 0]);
    }
}
