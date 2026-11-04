import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import styles from './shell-loading.module.css';

// Same show-delay reasoning as RouteLoadingSkeleton: most navigations resolve
// well under this, so it avoids a flash of loading state for them.
const SHOW_DELAY_MS = 150;

/**
 * A slim indeterminate bar pinned to the very top of the viewport while an
 * Inertia navigation is in flight — for pages whose layout doesn't suit
 * RouteLoadingSkeleton's page-shaped placeholder (e.g. the storefront's bento
 * grid), so there's still *some* feedback on a slow connection instead of the
 * page looking frozen. This app disables Inertia's own built-in progress bar
 * globally (see app.tsx's `progress: false`) in favor of RouteLoadingSkeleton,
 * so a page opting out of that component needs its own indicator — nothing
 * else will show one.
 */
export function RouteTopProgressBar() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        let showTimer: ReturnType<typeof setTimeout> | undefined;

        const removeStart = router.on('start', (event) => {
            if (event.detail.visit.preserveState) {
                return;
            }

            showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        });

        const removeFinish = router.on('finish', () => {
            clearTimeout(showTimer);
            setVisible(false);
        });

        return () => {
            clearTimeout(showTimer);
            removeStart();
            removeFinish();
        };
    }, []);

    if (!visible) {
        return null;
    }

    return (
        <div className={styles.progressTrack} role="progressbar" aria-busy="true">
            <div className={styles.progressBar} />
        </div>
    );
}
