// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { usePageMock, reloadMock } = vi.hoisted(() => ({
    usePageMock: vi.fn(),
    reloadMock: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    router: { reload: reloadMock },
    usePage: usePageMock,
}));

// @/lib/i18n's changeLanguage() calls are incidental here (useLocale() itself
// doesn't depend on i18next initialization order the way useSyncI18nLanguage
// does) — importing the real singleton is simpler than mocking it, and its
// resources are already loaded synchronously (see i18n.test.ts).
const { useLocale, useSyncI18nLanguage } = await import('./use-locale');
const i18n = (await import('@/lib/i18n')).default;

function mockPage(locale: string, locales: string[] = ['th', 'en']) {
    usePageMock.mockReturnValue({ props: { locale, locales } });
}

function clearCookies() {
    for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim();
        if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    }
}

beforeEach(() => {
    reloadMock.mockReset();
    clearCookies();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useLocale', () => {
    it('starts from the server-resolved locale/locales props', () => {
        mockPage('th', ['th', 'en', 'zh']);
        const { result } = renderHook(() => useLocale());

        expect(result.current.locale).toBe('th');
        expect(result.current.locales).toEqual(['th', 'en', 'zh']);
        expect(result.current.switchingLocale).toBe(false);
    });

    it('setLocale flips the locale (and switchingLocale) immediately, before the network request resolves', () => {
        mockPage('th');
        const { result } = renderHook(() => useLocale());

        act(() => result.current.setLocale('en'));

        expect(result.current.locale).toBe('en');
        expect(result.current.switchingLocale).toBe(true);
    });

    it('PUTs the new code to /locale with the XSRF token header', async () => {
        mockPage('th');
        document.cookie = 'XSRF-TOKEN=tok123';
        const { result } = renderHook(() => useLocale());

        await act(async () => {
            result.current.setLocale('en');
            await Promise.resolve();
        });

        expect(fetch).toHaveBeenCalledWith(
            '/locale',
            expect.objectContaining({
                method: 'PUT',
                headers: expect.objectContaining({ 'X-XSRF-TOKEN': 'tok123' }),
                body: JSON.stringify({ code: 'en' }),
            }),
        );
    });

    it('reloads the page in the background once the persist succeeds, then clears switchingLocale', async () => {
        mockPage('th');
        const { result } = renderHook(() => useLocale());

        await act(async () => {
            result.current.setLocale('en');
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(reloadMock).toHaveBeenCalledTimes(1);
        act(() => reloadMock.mock.calls[0][0].onFinish());
        expect(result.current.switchingLocale).toBe(false);
    });

    it('does not reload when the persist request comes back non-ok, and clears switchingLocale', async () => {
        mockPage('th');
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 419 }))));
        const { result } = renderHook(() => useLocale());

        await act(async () => {
            result.current.setLocale('en');
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(reloadMock).not.toHaveBeenCalled();
        expect(result.current.switchingLocale).toBe(false);
    });

    it('clears switchingLocale on a network-level fetch rejection', async () => {
        mockPage('th');
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
        const { result } = renderHook(() => useLocale());

        await act(async () => {
            result.current.setLocale('en');
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.switchingLocale).toBe(false);
    });

    it('shares state across every useLocale() call site (a switch in one hook instance is visible in another)', () => {
        mockPage('th');
        const a = renderHook(() => useLocale());
        const b = renderHook(() => useLocale());

        act(() => a.result.current.setLocale('en'));

        expect(b.result.current.locale).toBe('en');
    });
});

describe('useSyncI18nLanguage', () => {
    it('syncs i18next\'s active language to the resolved locale', () => {
        mockPage('en');
        renderHook(() => useSyncI18nLanguage());

        expect(i18n.language).toBe('en');
    });
});
