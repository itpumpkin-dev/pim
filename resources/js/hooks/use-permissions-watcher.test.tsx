// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePermissionsWatcher } from './use-permissions-watcher';

const { channelMock, echoPrivateMock, echoLeaveMock, reloadMock, usePageMock } = vi.hoisted(() => {
    const channelMock = { listen: vi.fn() };
    return {
        channelMock,
        echoPrivateMock: vi.fn(() => channelMock),
        echoLeaveMock: vi.fn(),
        reloadMock: vi.fn(),
        usePageMock: vi.fn(),
    };
});

vi.mock('@/echo', () => ({
    default: { private: echoPrivateMock, leave: echoLeaveMock },
}));

vi.mock('@inertiajs/react', () => ({
    router: { reload: reloadMock },
    usePage: usePageMock,
}));

function mockUser(id: number | undefined) {
    usePageMock.mockReturnValue({ props: { auth: id ? { user: { id } } : {} } });
}

beforeEach(() => {
    echoPrivateMock.mockClear();
    echoLeaveMock.mockClear();
    channelMock.listen.mockClear();
    reloadMock.mockClear();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('usePermissionsWatcher', () => {
    it('does nothing when there is no signed-in user', () => {
        mockUser(undefined);
        renderHook(() => usePermissionsWatcher());

        expect(echoPrivateMock).not.toHaveBeenCalled();
    });

    it('subscribes to this user\'s private channel and listens for .permissions.changed', () => {
        mockUser(42);
        renderHook(() => usePermissionsWatcher());

        expect(echoPrivateMock).toHaveBeenCalledWith('user.42');
        expect(channelMock.listen).toHaveBeenCalledWith('.permissions.changed', expect.any(Function));
    });

    it('leaves the channel on unmount', () => {
        mockUser(42);
        const { unmount } = renderHook(() => usePermissionsWatcher());

        unmount();

        expect(echoLeaveMock).toHaveBeenCalledWith('user.42');
    });

    it('on receipt: sets noticeVisible, dispatches app:permissions-changed, and reloads after the delay', () => {
        mockUser(42);
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        const { result } = renderHook(() => usePermissionsWatcher());

        expect(result.current).toBe(false);

        const handler = channelMock.listen.mock.calls[0][1];
        act(() => handler());

        expect(result.current).toBe(true);
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'app:permissions-changed' }));
        expect(reloadMock).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(3000));

        expect(reloadMock).toHaveBeenCalledTimes(1);
    });
});
