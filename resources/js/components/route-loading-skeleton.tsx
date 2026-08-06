import { router } from '@inertiajs/react';
import { Box, Skeleton, Stack } from '@mui/material';
import { useEffect, useState } from 'react';

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
                p: 3,
                overflow: 'hidden',
            }}
        >
            <Skeleton variant="text" width={220} height={40} sx={{ mb: 2 }} />

            <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
                <Skeleton variant="rounded" width={120} height={36} />
                <Skeleton variant="rounded" width={120} height={36} />
                <Skeleton variant="rounded" width={96} height={36} sx={{ ml: 'auto' }} />
            </Stack>

            <Skeleton variant="rounded" height={52} sx={{ mb: 1 }} />
            <Stack spacing={1}>
                {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={44} />
                ))}
            </Stack>
        </Box>
    );
}
