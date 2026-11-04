import { PulseDots } from '@/components/route-loading-skeleton';
import { useLocale } from '@/hooks/use-locale';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Same show-delay reasoning as RouteLoadingSkeleton: a fast reload shouldn't
// flash a loading state at all.
const SHOW_DELAY_MS = 150;

interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

/**
 * Shown over the page content area while a language switch is settling.
 * UI strings flip instantly (they're bundled client-side), but anything the
 * server resolved in the old locale — product/category/attribute names in
 * the page's props — stays stale until useLocale()'s background
 * router.reload() lands. This fades that area and says so, instead of
 * leaving old-language data sitting there looking final.
 *
 * Rendered inside AppContent's <main> (and the storefront pages' content
 * box — home.tsx, products/show.tsx), but drawn `position: fixed` over the
 * part of <main> currently in the viewport — an absolute overlay would only
 * cover <main>'s first screenful and scroll away with it.
 */
export function LocaleSwitchOverlay() {
    const { t } = useTranslation('common');
    const { switchingLocale } = useLocale();
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    const [rect, setRect] = useState<Rect | null>(null);

    useEffect(() => {
        if (!switchingLocale) {
            setVisible(false);
            return;
        }
        const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
        return () => clearTimeout(timer);
    }, [switchingLocale]);

    useLayoutEffect(() => {
        if (!visible) return;

        const measure = () => {
            const container = anchorRef.current?.parentElement;
            if (!container) return;
            const r = container.getBoundingClientRect();
            // Start below any sticky/fixed <header> still pinned on screen
            // (the storefront's shell bar sits on top of its own content
            // while scrolled) so the status pill isn't hidden under it.
            const headerBottom = Array.from(document.querySelectorAll('header')).reduce((max, el) => {
                const position = getComputedStyle(el).position;
                if (position !== 'sticky' && position !== 'fixed') return max;
                return Math.max(max, el.getBoundingClientRect().bottom);
            }, 0);
            const top = Math.max(r.top, headerBottom, 0);
            const bottom = Math.min(r.bottom, window.innerHeight);
            setRect({ top, left: r.left, width: r.width, height: Math.max(bottom - top, 0) });
        };

        measure();
        window.addEventListener('resize', measure);
        window.addEventListener('scroll', measure, true);
        return () => {
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [visible]);

    return (
        <>
            <span ref={anchorRef} style={{ display: 'none' }} />
            {visible && rect && (
                <div
                    role="status"
                    aria-live="polite"
                    style={{
                        position: 'fixed',
                        ...rect,
                        zIndex: 10,
                        background: 'color-mix(in srgb, var(--sapBackgroundColor) 60%, transparent)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'flex-start',
                        paddingTop: '3rem',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.5rem 1rem',
                            background: 'var(--sapGroup_ContentBackground)',
                            border: '1px solid var(--sapGroup_ContentBorderColor)',
                            borderRadius: 999,
                            boxShadow: 'var(--sapContent_Shadow1)',
                            color: 'var(--sapTextColor)',
                            fontFamily: 'var(--sapFontFamily)',
                            fontSize: 'var(--sapFontSize)',
                        }}
                    >
                        <PulseDots size={8} />
                        <span>{t('switchingLanguage')}</span>
                    </div>
                </div>
            )}
        </>
    );
}
