import { Fab, Tooltip, Zoom } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIORI } from '@/lib/fiori-style';

/** Nearest ancestor that actually scrolls — the layout's <main> (AppContent), not window. */
function findScrollParent(node: HTMLElement | null): HTMLElement | null {
    let current = node?.parentElement ?? null;
    while (current) {
        const { overflowY } = getComputedStyle(current);
        if (overflowY === 'auto' || overflowY === 'scroll') return current;
        current = current.parentElement;
    }
    return null;
}

/**
 * Floating "back to top" button for long pages. Appears once the page has
 * been scrolled past `threshold` px and smooth-scrolls the page's scroll
 * container (or the window, if none) back to the top.
 */
export function ScrollTopButton({ threshold = 400 }: { threshold?: number }) {
    const { t } = useTranslation('common');
    const anchorRef = useRef<HTMLSpanElement>(null);
    const scrollParentRef = useRef<HTMLElement | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const parent = findScrollParent(anchorRef.current);
        scrollParentRef.current = parent;
        const target: HTMLElement | Window = parent ?? window;
        const read = () => (parent ? parent.scrollTop : window.scrollY);

        const onScroll = () => setVisible(read() > threshold);
        onScroll();
        target.addEventListener('scroll', onScroll, { passive: true });
        return () => target.removeEventListener('scroll', onScroll);
    }, [threshold]);

    const scrollToTop = () => {
        (scrollParentRef.current ?? window).scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <>
            <span ref={anchorRef} hidden />
            <Zoom in={visible}>
                <Tooltip title={t('scrollToTop')} placement="left">
                    <Fab
                        size="medium"
                        aria-label={t('scrollToTop')}
                        onClick={scrollToTop}
                        sx={{
                            position: 'fixed',
                            right: { xs: 16, md: 32 },
                            bottom: { xs: 16, md: 32 },
                            zIndex: (theme) => theme.zIndex.speedDial,
                            bgcolor: FIORI.brand,
                            color: '#fff',
                            '&:hover': { bgcolor: FIORI.brandDark },
                        }}
                    >
                        <KeyboardArrowUpIcon />
                    </Fab>
                </Tooltip>
            </Zoom>
        </>
    );
}
