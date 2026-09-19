// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMobileNavigation } from './use-mobile-navigation';

describe('useMobileNavigation', () => {
    it('returns a stable cleanup function that removes pointer-events from body', () => {
        document.body.style.pointerEvents = 'none';

        const { result } = renderHook(() => useMobileNavigation());
        result.current();

        expect(document.body.style.pointerEvents).toBe('');
    });

    it('returns the same function identity across re-renders (useCallback with empty deps)', () => {
        const { result, rerender } = renderHook(() => useMobileNavigation());
        const first = result.current;
        rerender();

        expect(result.current).toBe(first);
    });
});
