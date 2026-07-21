import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Appearance = 'light' | 'dark' | 'system';
export type ResolvedAppearance = 'light' | 'dark';

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export const resolveAppearance = (appearance: Appearance): ResolvedAppearance => {
    if (appearance === 'system') {
        return prefersDark() ? 'dark' : 'light';
    }

    return appearance;
};

const setCookie = (name: string, value: string, days = 365) => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const mediaQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function initializeTheme(): ResolvedAppearance {
    const savedAppearance = (localStorage.getItem('appearance') as Appearance) || 'system';

    return resolveAppearance(savedAppearance);
}

interface AppearanceContextValue {
    appearance: Appearance;
    updateAppearance: (mode: Appearance) => void;
}

// state lives in a single context so every consumer (the toggle button, the ThemeProvider) shares the same value
const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
    const [appearance, setAppearance] = useState<Appearance>('system');

    const updateAppearance = useCallback((mode: Appearance) => {
        setAppearance(mode);

        localStorage.setItem('appearance', mode);
        setCookie('appearance', mode);
    }, []);

    useEffect(() => {
        const savedAppearance = localStorage.getItem('appearance') as Appearance | null;
        setAppearance(savedAppearance || 'system');
    }, []);

    return <AppearanceContext.Provider value={{ appearance, updateAppearance }}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
    const context = useContext(AppearanceContext);

    if (!context) {
        throw new Error('useAppearance must be used within an AppearanceProvider');
    }

    return context;
}

export function useResolvedAppearance() {
    const { appearance, updateAppearance } = useAppearance();
    const [resolved, setResolved] = useState<ResolvedAppearance>(() => resolveAppearance(appearance));

    useEffect(() => {
        setResolved(resolveAppearance(appearance));

        if (appearance !== 'system' || !mediaQuery) {
            return;
        }

        const onChange = () => setResolved(resolveAppearance('system'));
        mediaQuery.addEventListener('change', onChange);

        return () => mediaQuery.removeEventListener('change', onChange);
    }, [appearance]);

    return { appearance, resolved, updateAppearance } as const;
}
