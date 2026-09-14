import echo from '@/echo';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';

// Gives the user a moment to read the notice before the reload kicks them
// out — long enough to notice, short enough that the stale session isn't
// left active for long.
const LOGOUT_DELAY_MS = 3000;

/**
 * Listens on the current user's private channel for a "permissions changed"
 * push (role edited, added/removed from a role or group, etc.). On receipt
 * it flags `noticeVisible` so the caller can warn the user, then forces an
 * Inertia reload after a short delay. The reload is what actually gets the
 * user logged out — EnsureFreshPermissions catches the stale session on that
 * request server-side. This hook only makes it happen immediately (with a
 * heads-up) instead of waiting for the user's next click.
 *
 * Also dispatches a plain `window` CustomEvent ('app:permissions-changed')
 * on the same receipt, ahead of the reload — a page with unsaved work (see
 * useDraftAutosave) listens for this to flush a draft to localStorage
 * immediately, rather than waiting on its own debounce and risking losing
 * whatever was typed since the last save. A DOM event rather than a second
 * usePermissionsWatcher() call in each page: this hook's cleanup calls
 * echo.leave(channelName), which tears down the channel subscription
 * entirely — a second subscriber on the same user.{id} channel from some
 * other still-mounted component (this one is rendered once, globally, by
 * PermissionsChangedToast) would silently kill that component's listener
 * too the moment the second subscriber unmounts.
 */
export function usePermissionsWatcher() {
    const { auth } = usePage<SharedData>().props;
    const userId = auth?.user?.id;
    const [noticeVisible, setNoticeVisible] = useState(false);

    useEffect(() => {
        if (!userId) {
            return;
        }

        const channelName = `user.${userId}`;
        const channel = echo.private(channelName);

        channel.listen('.permissions.changed', () => {
            setNoticeVisible(true);
            window.dispatchEvent(new CustomEvent('app:permissions-changed'));
            window.setTimeout(() => router.reload(), LOGOUT_DELAY_MS);
        });

        return () => {
            echo.leave(channelName);
        };
    }, [userId]);

    return noticeVisible;
}
