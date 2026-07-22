import { translate, translateCategory, type Locale, type TranslationKey } from '@/lib/translations';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface LocaleContextValue {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
    tCategory: (category: string) => string;
}

// state lives in a single context so every consumer (the language switcher, every page) shares the same value
const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>('th');

    useEffect(() => {
        const saved = localStorage.getItem('locale') as Locale | null;
        if (saved === 'th' || saved === 'en' || saved === 'zh') setLocaleState(saved);
    }, []);

    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        localStorage.setItem('locale', next);
    }, []);

    const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);
    const tCategory = useCallback((category: string) => translateCategory(locale, category), [locale]);

    return <LocaleContext.Provider value={{ locale, setLocale, t, tCategory }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
    const context = useContext(LocaleContext);

    if (!context) {
        throw new Error('useLocale must be used within a LocaleProvider');
    }

    return context;
}
