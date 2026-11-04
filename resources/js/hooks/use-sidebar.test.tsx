// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider, useSidebar } from './use-sidebar';

function mockMatchMedia(matchesMobile: boolean) {
    window.matchMedia = vi.fn((query: string) => ({
        matches: matchesMobile,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
}

function wrapper({ children }: { children: ReactNode }) {
    return <SidebarProvider>{children}</SidebarProvider>;
}

describe('useSidebar', () => {
    it('throws when used outside a SidebarProvider', () => {
        expect(() => renderHook(() => useSidebar())).toThrow('useSidebar must be used within a SidebarProvider');
    });

    describe('on desktop', () => {
        beforeEach(() => mockMatchMedia(false));

        it('starts expanded by default', () => {
            const { result } = renderHook(() => useSidebar(), { wrapper });

            expect(result.current.isMobile).toBe(false);
            expect(result.current.open).toBe(true);
            expect(result.current.state).toBe('expanded');
        });

        it('toggleSidebar flips `open`/`state`, not `openMobile`', () => {
            const { result } = renderHook(() => useSidebar(), { wrapper });

            act(() => result.current.toggleSidebar());

            expect(result.current.open).toBe(false);
            expect(result.current.state).toBe('collapsed');
            expect(result.current.openMobile).toBe(false);
        });

        it('setOpen sets the value directly', () => {
            const { result } = renderHook(() => useSidebar(), { wrapper });

            act(() => result.current.setOpen(false));
            expect(result.current.open).toBe(false);

            act(() => result.current.setOpen(true));
            expect(result.current.open).toBe(true);
        });
    });

    describe('on mobile', () => {
        beforeEach(() => mockMatchMedia(true));

        it('reports isMobile: true and starts with the mobile drawer closed', () => {
            const { result } = renderHook(() => useSidebar(), { wrapper });

            expect(result.current.isMobile).toBe(true);
            expect(result.current.openMobile).toBe(false);
        });

        it('toggleSidebar flips `openMobile`, not the desktop `open` state', () => {
            const { result } = renderHook(() => useSidebar(), { wrapper });

            act(() => result.current.toggleSidebar());

            expect(result.current.openMobile).toBe(true);
            expect(result.current.open).toBe(true);
        });
    });

    it('a controlled `open` prop overrides internal state, and onOpenChange is called instead of setting it directly', () => {
        mockMatchMedia(false);
        const onOpenChange = vi.fn();

        function controlledWrapper({ children }: { children: ReactNode }) {
            return (
                <SidebarProvider open={false} onOpenChange={onOpenChange}>
                    {children}
                </SidebarProvider>
            );
        }

        const { result } = renderHook(() => useSidebar(), { wrapper: controlledWrapper });

        expect(result.current.open).toBe(false);

        act(() => result.current.setOpen(true));

        expect(onOpenChange).toHaveBeenCalledWith(true);
        // still false: the controlled prop itself never changed, only the callback fired
        expect(result.current.open).toBe(false);
    });

    it('with `persist`, a remounted provider remembers the last desktop open state', () => {
        mockMatchMedia(false);

        function persistWrapper({ children }: { children: ReactNode }) {
            return <SidebarProvider persist>{children}</SidebarProvider>;
        }

        const first = renderHook(() => useSidebar(), { wrapper: persistWrapper });
        act(() => first.result.current.setOpen(false));
        first.unmount();

        // simulates the next Inertia navigation remounting the whole shell
        const second = renderHook(() => useSidebar(), { wrapper: persistWrapper });
        expect(second.result.current.open).toBe(false);

        act(() => second.result.current.setOpen(true));
    });
});
