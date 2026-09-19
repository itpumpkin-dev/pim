// @vitest-environment jsdom
import '@/lib/i18n';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUnsavedChangesGuard } from './use-unsaved-changes-guard';

const { onMock, offCleanup } = vi.hoisted(() => ({ onMock: vi.fn(), offCleanup: vi.fn() }));

vi.mock('@inertiajs/react', () => ({
    router: { on: onMock },
}));

function currentUrl(pathname = '/current', search = '') {
    return new URL(`${window.location.origin}${pathname}${search}`);
}

beforeEach(() => {
    onMock.mockReset();
    onMock.mockReturnValue(offCleanup);
    window.history.replaceState(null, '', '/current');
});

describe('useUnsavedChangesGuard', () => {
    describe('beforeunload', () => {
        it('prevents the default and sets returnValue when dirty', () => {
            renderHook(() => useUnsavedChangesGuard(true));

            const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
            const preventDefault = vi.spyOn(event, 'preventDefault');
            window.dispatchEvent(event);

            expect(preventDefault).toHaveBeenCalled();
            // jsdom's Event.returnValue is a spec'd `boolean` IDL attribute —
            // assigning the string '' (as the hook does, for maximum browser
            // compatibility with older beforeunload prompts) coerces to false.
            expect(event.returnValue).toBe(false);
        });

        it('does nothing when not dirty', () => {
            renderHook(() => useUnsavedChangesGuard(false));

            const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
            const preventDefault = vi.spyOn(event, 'preventDefault');
            window.dispatchEvent(event);

            expect(preventDefault).not.toHaveBeenCalled();
        });
    });

    describe('Inertia navigation guard', () => {
        it('registers a router.on("before", ...) listener', () => {
            renderHook(() => useUnsavedChangesGuard(true));

            expect(onMock).toHaveBeenCalledWith('before', expect.any(Function));
        });

        it('lets a same-URL reload (e.g. useLocale()\'s background reload) through without confirming', () => {
            renderHook(() => useUnsavedChangesGuard(true));
            const handler = onMock.mock.calls[0][1];
            const confirmSpy = vi.spyOn(window, 'confirm');

            const event = { detail: { visit: { url: currentUrl('/current') } }, preventDefault: vi.fn() };
            handler(event);

            expect(confirmSpy).not.toHaveBeenCalled();
            expect(event.preventDefault).not.toHaveBeenCalled();
        });

        it('confirms before navigating to a different URL while dirty, and cancels the visit when the user declines', () => {
            renderHook(() => useUnsavedChangesGuard(true));
            const handler = onMock.mock.calls[0][1];
            vi.spyOn(window, 'confirm').mockReturnValue(false);

            const event = { detail: { visit: { url: currentUrl('/somewhere-else') } }, preventDefault: vi.fn() };
            handler(event);

            expect(event.preventDefault).toHaveBeenCalled();
        });

        it('lets the visit through when the user confirms', () => {
            renderHook(() => useUnsavedChangesGuard(true));
            const handler = onMock.mock.calls[0][1];
            vi.spyOn(window, 'confirm').mockReturnValue(true);

            const event = { detail: { visit: { url: currentUrl('/somewhere-else') } }, preventDefault: vi.fn() };
            handler(event);

            expect(event.preventDefault).not.toHaveBeenCalled();
        });

        it('never confirms when not dirty', () => {
            renderHook(() => useUnsavedChangesGuard(false));
            const handler = onMock.mock.calls[0][1];
            const confirmSpy = vi.spyOn(window, 'confirm');

            const event = { detail: { visit: { url: currentUrl('/somewhere-else') } }, preventDefault: vi.fn() };
            handler(event);

            expect(confirmSpy).not.toHaveBeenCalled();
        });

        it('skips the confirm once the returned ref is flagged (an intentional post-save redirect)', () => {
            const { result } = renderHook(() => useUnsavedChangesGuard(true));
            const handler = onMock.mock.calls[0][1];
            const confirmSpy = vi.spyOn(window, 'confirm');

            act(() => {
                result.current.current = true;
            });

            const event = { detail: { visit: { url: currentUrl('/somewhere-else') } }, preventDefault: vi.fn() };
            handler(event);

            expect(confirmSpy).not.toHaveBeenCalled();
            expect(event.preventDefault).not.toHaveBeenCalled();
        });
    });
});
