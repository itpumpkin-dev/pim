// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile } from './use-mobile';

function mockMatchMedia() {
    const listeners = new Set<() => void>();
    window.matchMedia = vi.fn(() => ({
        matches: false,
        media: '',
        addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
        removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    return { fireChange: () => listeners.forEach((cb) => cb()) };
}

function setInnerWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

describe('useIsMobile', () => {
    beforeEach(() => {
        mockMatchMedia();
    });

    it('reports false for a desktop-width viewport', () => {
        setInnerWidth(1024);
        const { result } = renderHook(() => useIsMobile());

        expect(result.current).toBe(false);
    });

    it('reports true for a mobile-width viewport (< 768px)', () => {
        setInnerWidth(500);
        const { result } = renderHook(() => useIsMobile());

        expect(result.current).toBe(true);
    });

    it('updates when the viewport crosses the breakpoint and the media query fires a change event', () => {
        setInnerWidth(1024);
        const { fireChange } = mockMatchMedia();
        const { result } = renderHook(() => useIsMobile());

        expect(result.current).toBe(false);

        setInnerWidth(500);
        act(() => fireChange());

        expect(result.current).toBe(true);
    });

    it('never returns undefined, even before the effect has run synchronously the first time', () => {
        setInnerWidth(1024);
        const { result } = renderHook(() => useIsMobile());

        expect(typeof result.current).toBe('boolean');
    });
});
