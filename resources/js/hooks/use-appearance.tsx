import { useCallback, useEffect, useState } from 'react';

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

export function useAppearance() {
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

    return { appearance, updateAppearance } as const;
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
