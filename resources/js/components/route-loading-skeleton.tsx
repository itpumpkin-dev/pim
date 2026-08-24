import { router } from '@inertiajs/react';
import { Box, keyframes } from '@mui/material';
import { useEffect, useState } from 'react';

// Originally from Uiverse.io by adamgiebl; recolored from its stock
// orange to the Fiori brand blue tokens so it matches the rest of the
// Fiori-themed UI (and picks up dark mode along with it, since these
// resolve through var(--fiori-*) — see fiori-style.tsx).
const pulse = keyframes`
    0% {
        transform: scale(0.8);
        background-color: rgba(0, 112, 242, 0.35);
        box-shadow: 0 0 0 0 rgba(0, 112, 242, 0.35);
    }
    50% {
        transform: scale(1.2);
        background-color: var(--fiori-brand);
        box-shadow: 0 0 0 10px rgba(0, 112, 242, 0);
    }
    100% {
        transform: scale(0.8);
        background-color: rgba(0, 112, 242, 0.35);
        box-shadow: 0 0 0 0 rgba(0, 112, 242, 0.35);
    }
`;

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
        <Box
            sx={{
                position: 'absolute',
                inset: 0,
                zIndex: (theme) => theme.zIndex.appBar - 1,
                bgcolor: 'background.default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {[-0.3, -0.1, 0.1].map((delay) => (
                    <Box
                        key={delay}
                        sx={{
                            height: 12,
                            width: 12,
                            mr: delay === 0.1 ? 0 : '6px',
                            borderRadius: '6px',
                            bgcolor: 'rgba(0, 112, 242, 0.35)',
                            animation: `${pulse} 1.5s infinite ease-in-out`,
                            animationDelay: `${delay}s`,
                        }}
                    />
                ))}
            </Box>
        </Box>
    );
}
