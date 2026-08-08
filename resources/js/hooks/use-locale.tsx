import i18n from '@/lib/i18n';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';

function readCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

// Module-level (not per-component-instance) so it coordinates across every
// useLocale() call site — the dropdown's own instance and the separate one
// inside useSyncI18nLanguage() are otherwise unaware of each other. Tracks
// which locale switch is the most recent, so an older switch's in-flight
// request can't clobber a newer one that already resolved (see setLocale()).
let latestRequestedLocale: string | null = null;

export function useLocale() {
    const { locale: serverLocale, locales } = usePage<SharedData>().props;
    const [locale, setLocaleState] = useState(serverLocale);
    // True from the moment setLocale() is called until the background
    // router.reload() below (or an earlier bail-out) settles. Server-resolved
    // labels baked into the current page's props (e.g. an attribute/category
    // name via app()->getLocale()) don't update until that reload lands, so
    // callers needing to show a loading state during that gap (e.g. Edit
    // Product's field area) can key off this instead of building their own
    // tracking for a switch this hook already owns.
    const [switchingLocale, setSwitchingLocale] = useState(false);

    // Stay in sync with the server-resolved locale after a real page visit
    // (e.g. a normal link click, or the very first load), in case it was
    // set some other way than setLocale() below (a fresh session's cookie,
    // for instance).
    useEffect(() => {
        if (serverLocale && serverLocale !== locale) {
            setLocaleState(serverLocale);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverLocale]);

    const setLocale = (code: string) => {
        // Every UI string is already bundled client-side (see lib/i18n.ts),
        // so switching language doesn't need a server round-trip at all —
        // flip it immediately. Going through Inertia's router here used to
        // force a full reload of the current page just to re-render it in
        // the new language, which made every switch feel like a full
        // navigation for no real reason.
        setLocaleState(code);
        i18n.changeLanguage(code);
        latestRequestedLocale = code;
        setSwitchingLocale(true);

        fetch('/locale', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': readCookie('XSRF-TOKEN') ?? '',
            },
            body: JSON.stringify({ code }),
        })
            .then((response) => {
                // fetch() only rejects on network-level failures — a 419
                // (stale CSRF token), 422, or 500 still resolves here. Don't
                // reload on a failed persist: the server's locale didn't
                // actually change, so refetching props now would pull stale-
                // language data and the sync effect below would silently
                // flip the whole app's displayed language back.
                if (!response.ok) {
                    setSwitchingLocale(false);
                    return;
                }

                // A newer switch may have already been requested (and even
                // resolved) while this one was in flight — e.g. two clicks
                // in quick succession completing out of order. Only the
                // latest one should ever trigger a reload; an older one
                // finishing last would otherwise drag the UI back to a
                // language the user already switched away from.
                if (latestRequestedLocale !== code) {
                    return;
                }

                // Some of the current page's props were computed server-side
                // in the *old* locale (e.g. a product name resolved via
                // app()->getLocale()) — those won't catch up on their own
                // since nothing re-ran that PHP code. A partial reload
                // re-fetches just this page's props in the background (no
                // full navigation, no scroll jump, no unmounting anything)
                // now that the fetch above has persisted the new locale
                // server-side, so this reload resolves it correctly. Chained
                // after the fetch (not fired in parallel) so the cookie/user
                // preference is guaranteed to be in place before it runs.
                // reload() always preserves scroll/state (that's what makes
                // it a "reload" rather than a "visit") — no options needed.
                router.reload({ onFinish: () => setSwitchingLocale(false) });
            })
            .catch(() => {
                // Best-effort: worst case the preference doesn't stick server-side
                // this session, and the next full page load falls back to
                // whatever cookie/user default was already there — harmless.
                setSwitchingLocale(false);
            });
    };

    return { locale, locales, setLocale, switchingLocale } as const;
}

// Keeps i18next's active language in lockstep with the server-resolved
// locale after every Inertia navigation or language switch.
export function useSyncI18nLanguage() {
    const { locale } = useLocale();

    useEffect(() => {
        if (!locale) {
            return;
        }

        const sync = () => {
            if (typeof locale === 'string' && i18n.language !== locale) {
                i18n.changeLanguage(locale);
            }
        };

        // i18n.init() (lib/i18n.ts) resolves asynchronously even with sync
        // resources — calling changeLanguage() before it settles leaves
        // i18next's internal language-utils state half-built and throws.
        if (i18n.isInitialized) {
            sync();
        } else {
            i18n.on('initialized', sync);
            return () => i18n.off('initialized', sync);
        }
    }, [locale]);
}
