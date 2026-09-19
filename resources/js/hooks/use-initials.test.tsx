import { describe, expect, it } from 'vitest';
import { useInitials } from './use-initials';

describe('useInitials', () => {
    const getInitials = useInitials();

    it('returns the first letter uppercased for a single-word name', () => {
        expect(getInitials('madonna')).toBe('M');
    });

    it('returns first + last initials, uppercased, for a multi-word name', () => {
        expect(getInitials('john smith')).toBe('JS');
    });

    it('uses only the first and last word for a name with a middle name', () => {
        expect(getInitials('John Michael Smith')).toBe('JS');
    });

    it('trims leading/trailing whitespace before splitting', () => {
        expect(getInitials('  John Smith  ')).toBe('JS');
    });

    it('returns an empty string for an empty name', () => {
        expect(getInitials('')).toBe('');
    });
});
