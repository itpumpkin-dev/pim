import { router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import styles from './shell-loading.module.css';

// How long a navigation must stay in flight before the skeleton appears.
// Most navigations (cached grids, warm permission checks) now resolve
// well under this, so this avoids a flash of loading state for them —
// the skeleton only shows up for genuinely slow requests.
const SHOW_DELAY_MS = 150;

/**
 * A generic, page-shape-agnostic loading placeholder shown over the content
 * area while an Inertia navigation is in flight. Intentionally the same on
 * every page (not tailored per-layout) so it doesn't need to be kept in
 * sync with each page's real content.
 *
 * Only reacts to real page navigations — in-page interactions (grid
 * filter/sort/pagination, the background locale-switch reload) all pass
 * `preserveState: true`, which is exactly the signal Inertia itself uses to
 * mean "this isn't a new page," so it doubles as the filter here too.
 */
export function RouteLoadingSkeleton() {
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
        <div
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 10,
                background: 'var(--sapBackgroundColor)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <PulseDots />
        </div>
    );
}

/** The three pulsing brand-blue dots — shared with LocaleSwitchOverlay. */
export function PulseDots({ size = 12 }: { size?: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {[-0.3, -0.1, 0.1].map((delay) => (
                <div
                    key={delay}
                    className={styles.pulseDot}
                    style={{
                        height: size,
                        width: size,
                        marginRight: delay === 0.1 ? 0 : size / 2,
                        borderRadius: size / 2,
                        animationDelay: `${delay}s`,
                    }}
                />
            ))}
        </div>
    );
}
