import { router } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Warns before the user loses unsaved changes on a form page — either by
 * leaving the SPA entirely (closing the tab, hard refresh, typing a new URL:
 * only the browser's native beforeunload prompt can catch that) or by
 * navigating to another Inertia page (sidebar link, breadcrumb, browser
 * Back/Forward — Inertia's router intercepts all of these as "visits" and
 * fires 'before' for each one, letting us cancel it with a confirm dialog).
 *
 * Pass `useForm()`'s `isDirty`. Set the returned ref's `.current = true`
 * right before an intentional post-save redirect (typically inside
 * `post()`/`put()`'s `onSuccess` or before calling it) — otherwise saving
 * while the form is dirty immediately re-triggers "leave without saving?" on
 * the save's own redirect.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
    const { t } = useTranslation('common');
    const skipNavigationGuardRef = useRef(false);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!isDirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    useEffect(() => {
        return router.on('before', (event) => {
            if (!isDirty || skipNavigationGuardRef.current) return;
            // Not every 'before' event is the user actually leaving — a
            // same-URL router.reload() (e.g. useLocale()'s background reload
            // after switching language) is still a "visit" as far as Inertia
            // is concerned, but it re-fetches this exact page's props in
            // place rather than navigating anywhere. Comparing the target URL
            // against the current one is what actually distinguishes "still
            // here" from "leaving", regardless of which router call caused it.
            const targetUrl = event.detail.visit.url;
            if (targetUrl.origin === window.location.origin && targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search) {
                return;
            }
            if (!window.confirm(t('unsavedChangesConfirm'))) {
                event.preventDefault();
            }
        });
    }, [isDirty, t]);

    return skipNavigationGuardRef;
}
