// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftAutosave } from './use-draft-autosave';

describe('useDraftAutosave', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not write anything before the debounce elapses', () => {
        renderHook(() => useDraftAutosave('draft-key', { name: 'a' }, true, 1000));

        act(() => vi.advanceTimersByTime(999));

        expect(localStorage.getItem('draft-key')).toBeNull();
    });

    it('writes the data to localStorage once the debounce elapses', () => {
        renderHook(() => useDraftAutosave('draft-key', { name: 'a' }, true, 1000));

        act(() => vi.advanceTimersByTime(1000));

        const stored = JSON.parse(localStorage.getItem('draft-key')!);
        expect(stored.data).toEqual({ name: 'a' });
        expect(typeof stored.savedAt).toBe('number');
    });

    it('never writes anything while isDirty is false', () => {
        renderHook(() => useDraftAutosave('draft-key', { name: 'a' }, false, 1000));

        act(() => vi.advanceTimersByTime(5000));

        expect(localStorage.getItem('draft-key')).toBeNull();
    });

    it('resets the debounce timer on every data change, only saving the latest value', () => {
        const { rerender } = renderHook(({ data }) => useDraftAutosave('draft-key', data, true, 1000), {
            initialProps: { data: { name: 'a' } },
        });

        act(() => vi.advanceTimersByTime(600));
        rerender({ data: { name: 'b' } });
        act(() => vi.advanceTimersByTime(600));

        // Only 1200ms of *real* elapsed time, but the timer restarted at the
        // 600ms mark, so it should not have fired yet.
        expect(localStorage.getItem('draft-key')).toBeNull();

        act(() => vi.advanceTimersByTime(400));

        const stored = JSON.parse(localStorage.getItem('draft-key')!);
        expect(stored.data).toEqual({ name: 'b' });
    });

    it('strips File/Blob values to null before persisting, so the rest of the draft still saves', () => {
        const file = new File(['x'], 'photo.jpg');
        renderHook(() => useDraftAutosave('draft-key', { name: 'a', photo: file, tags: [file, 'x'] }, true, 100));

        act(() => vi.advanceTimersByTime(100));

        const stored = JSON.parse(localStorage.getItem('draft-key')!);
        expect(stored.data).toEqual({ name: 'a', photo: null, tags: [null, 'x'] });
    });

    it('flushes immediately (bypassing the debounce) on an "app:permissions-changed" window event', () => {
        renderHook(() => useDraftAutosave('draft-key', { name: 'a' }, true, 5000));

        act(() => window.dispatchEvent(new Event('app:permissions-changed')));

        expect(JSON.parse(localStorage.getItem('draft-key')!).data).toEqual({ name: 'a' });
    });

    it('does not flush on the permissions-changed event while isDirty is false', () => {
        renderHook(() => useDraftAutosave('draft-key', { name: 'a' }, false, 5000));

        act(() => window.dispatchEvent(new Event('app:permissions-changed')));

        expect(localStorage.getItem('draft-key')).toBeNull();
    });

    it('readDraft returns the parsed stored draft, or null when nothing is stored', () => {
        const { result } = renderHook(() => useDraftAutosave('draft-key', { name: 'a' }, true, 100));

        expect(result.current.readDraft()).toBeNull();

        act(() => vi.advanceTimersByTime(100));

        expect(result.current.readDraft()?.data).toEqual({ name: 'a' });
    });

    it('clearDraft removes the stored draft', () => {
        const { result } = renderHook(() => useDraftAutosave('draft-key', { name: 'a' }, true, 100));
        act(() => vi.advanceTimersByTime(100));
        expect(localStorage.getItem('draft-key')).not.toBeNull();

        act(() => result.current.clearDraft());

        expect(localStorage.getItem('draft-key')).toBeNull();
    });
});
