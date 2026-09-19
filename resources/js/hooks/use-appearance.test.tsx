// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// use-appearance.tsx reads `window.matchMedia` once at module-evaluation time
// (`const mediaQuery = window.matchMedia(...)`, a module-scoped singleton
// reused by useResolvedAppearance()'s live-update effect) — a stub must
// exist *before* the module is ever imported, and every call (the module's
// own cached one, and every fresh prefersDark()/resolveAppearance() call)
// must return this exact same object so both the "read current value" and
// "listen for a change" paths stay in sync through one shared mock.
const mediaQueryListeners = new Set<() => void>();
const mediaQueryMock = {
    matches: false,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event: string, cb: () => void) => mediaQueryListeners.add(cb),
    removeEventListener: (_event: string, cb: () => void) => mediaQueryListeners.delete(cb),
    dispatchEvent: () => false,
};
vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQueryMock),
);

function setSystemPrefersDark(value: boolean) {
    mediaQueryMock.matches = value;
    mediaQueryListeners.forEach((cb) => cb());
}

const { AppearanceProvider, initializeTheme, resolveAppearance, useAppearance, useResolvedAppearance } = await import('./use-appearance');

describe('resolveAppearance', () => {
    it('resolves "light"/"dark" to themselves regardless of the system preference', () => {
        setSystemPrefersDark(true);
        expect(resolveAppearance('light')).toBe('light');
        expect(resolveAppearance('dark')).toBe('dark');
    });

    it('resolves "system" to "dark" when the OS prefers dark', () => {
        setSystemPrefersDark(true);
        expect(resolveAppearance('system')).toBe('dark');
    });

    it('resolves "system" to "light" when the OS does not prefer dark', () => {
        setSystemPrefersDark(false);
        expect(resolveAppearance('system')).toBe('light');
    });
});

describe('initializeTheme', () => {
    beforeEach(() => localStorage.clear());

    it('falls back to "system" when nothing is saved yet', () => {
        setSystemPrefersDark(false);
        expect(initializeTheme()).toBe('light');
    });

    it('resolves the previously-saved appearance from localStorage', () => {
        setSystemPrefersDark(true);
        localStorage.setItem('appearance', 'dark');
        expect(initializeTheme()).toBe('dark');
    });
});

describe('useAppearance / AppearanceProvider', () => {
    beforeEach(() => {
        localStorage.clear();
        setSystemPrefersDark(false);
    });

    it('throws when used outside an AppearanceProvider', () => {
        expect(() => renderHook(() => useAppearance())).toThrow('useAppearance must be used within an AppearanceProvider');
    });

    it('defaults to "system" and persists a change to both localStorage and a cookie', () => {
        const { result } = renderHook(() => useAppearance(), { wrapper: AppearanceProvider });

        expect(result.current.appearance).toBe('system');

        act(() => result.current.updateAppearance('dark'));

        expect(result.current.appearance).toBe('dark');
        expect(localStorage.getItem('appearance')).toBe('dark');
        expect(document.cookie).toContain('appearance=dark');
    });

    it('picks up an appearance already saved in localStorage on mount', () => {
        localStorage.setItem('appearance', 'dark');

        const { result } = renderHook(() => useAppearance(), { wrapper: AppearanceProvider });

        expect(result.current.appearance).toBe('dark');
    });
});

describe('useResolvedAppearance', () => {
    beforeEach(() => {
        localStorage.clear();
        mediaQueryListeners.clear();
    });

    it('reacts live to an OS theme change while appearance is "system"', () => {
        setSystemPrefersDark(false);
        const { result } = renderHook(() => useResolvedAppearance(), { wrapper: AppearanceProvider });

        expect(result.current.resolved).toBe('light');

        act(() => setSystemPrefersDark(true));

        expect(result.current.resolved).toBe('dark');
    });

    it('does not react to an OS theme change once appearance is pinned to "light"', () => {
        setSystemPrefersDark(false);
        const { result } = renderHook(() => useResolvedAppearance(), { wrapper: AppearanceProvider });

        act(() => result.current.updateAppearance('light'));
        expect(result.current.resolved).toBe('light');

        act(() => setSystemPrefersDark(true));
        expect(result.current.resolved).toBe('light');
    });
});
