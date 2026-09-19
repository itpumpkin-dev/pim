// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadStorefrontLists, useStorefrontWatcher } from './use-storefront-watcher';

const { channelMock, echoChannelMock, echoLeaveMock, reloadMock } = vi.hoisted(() => {
    const channelMock = { listen: vi.fn() };
    return {
        channelMock,
        echoChannelMock: vi.fn(() => channelMock),
        echoLeaveMock: vi.fn(),
        reloadMock: vi.fn(),
    };
});

vi.mock('@/echo', () => ({
    default: { channel: echoChannelMock, leave: echoLeaveMock },
}));

vi.mock('@inertiajs/react', () => ({
    router: { reload: reloadMock },
}));

beforeEach(() => {
    echoChannelMock.mockClear();
    echoLeaveMock.mockClear();
    channelMock.listen.mockClear();
    reloadMock.mockClear();
});

describe('useStorefrontWatcher', () => {
    it('subscribes to the public "storefront" channel and listens for .product.updated', () => {
        const onChange = vi.fn();
        renderHook(() => useStorefrontWatcher(onChange));

        expect(echoChannelMock).toHaveBeenCalledWith('storefront');
        expect(channelMock.listen).toHaveBeenCalledWith('.product.updated', onChange);
    });

    it('leaves the channel on unmount', () => {
        const { unmount } = renderHook(() => useStorefrontWatcher(vi.fn()));

        unmount();

        expect(echoLeaveMock).toHaveBeenCalledWith('storefront');
    });
});

describe('reloadStorefrontLists', () => {
    it('reloads only the products/categories props', () => {
        reloadStorefrontLists();

        expect(reloadMock).toHaveBeenCalledWith({ only: ['products', 'categories'] });
    });
});
