import i18n from '@/lib/i18n';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { useEffect } from 'react';

export function useLocale() {
    const { locale, locales } = usePage<SharedData>().props;

    const setLocale = (code: string) => {
        router.put(route('locale.update'), { code }, { preserveScroll: true, preserveState: true });
    };

    return { locale, locales, setLocale } as const;
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
