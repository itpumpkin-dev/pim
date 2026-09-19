// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useElementWidth } from './use-element-width';

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void;

let observedCallback: ResizeCallback | null = null;
let observeSpy: ReturnType<typeof vi.fn>;
let disconnectSpy: ReturnType<typeof vi.fn>;

function mockResizeObserver() {
    observeSpy = vi.fn();
    disconnectSpy = vi.fn();

    class ResizeObserverMock {
        constructor(cb: ResizeCallback) {
            observedCallback = cb;
        }
        observe = observeSpy;
        unobserve = vi.fn();
        disconnect = disconnectSpy;
    }

    window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
}

function TestComponent({ initial }: { initial?: number }) {
    const { ref, width } = useElementWidth<HTMLDivElement>(initial);
    return (
        <div ref={ref} data-testid="box">
            {width}
        </div>
    );
}

describe('useElementWidth', () => {
    beforeEach(() => {
        observedCallback = null;
        mockResizeObserver();
    });

    it('starts at the given initial width before any measurement lands', () => {
        // jsdom's getBoundingClientRect() always returns 0 for every element
        // (no real layout engine), so the initial render's own synchronous
        // setWidth(el.getBoundingClientRect().width) call sets it to 0 too —
        // this test only exercises the *state before that effect runs*, via
        // the hook's default initial=1200 argument, by rendering with a very
        // large initial and confirming a ResizeObserver update overrides it.
        const { getByTestId } = render(<TestComponent initial={1200} />);

        expect(observeSpy).toHaveBeenCalledTimes(1);
        expect(getByTestId('box').textContent).toBe('0'); // getBoundingClientRect() is 0 in jsdom
    });

    it('updates the width when the ResizeObserver reports a new contentRect', () => {
        const { getByTestId } = render(<TestComponent />);

        act(() => observedCallback?.([{ contentRect: { width: 640 } }]));

        expect(getByTestId('box').textContent).toBe('640');
    });

    it('disconnects the observer on unmount', () => {
        const { unmount } = render(<TestComponent />);

        unmount();

        expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });
});
