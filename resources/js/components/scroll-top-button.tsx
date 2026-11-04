import '@ui5/webcomponents-icons/dist/navigation-up-arrow.js';
import { Button } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './scroll-top-button.module.css';

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
            <Button
                design="Emphasized"
                icon="navigation-up-arrow"
                tooltip={t('scrollToTop')}
                accessibleName={t('scrollToTop')}
                onClick={scrollToTop}
                aria-hidden={!visible}
                tabIndex={visible ? 0 : -1}
                className={`${styles.button} ${visible ? styles.visible : ''}`}
            />
        </>
    );
}
