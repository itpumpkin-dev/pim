import { describe, expect, test } from 'vitest';
import { formatDate, formatDateRange } from './format';

// formatDate() delegates to toLocaleDateString(undefined, ...), whose output
// depends on the ICU locale the JS runtime happens to default to — asserting
// on a hardcoded string (e.g. "Jan 1, 2026") would be flaky across
// environments. `expected()` mirrors the exact same call so these tests
// still verify the real formatting/combination logic, just without pinning
// down a specific locale's rendering of it.
function expected(value: string): string {
    return new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

describe('formatDate', () => {
    test('formats a plain YYYY-MM-DD date as a local calendar date, not shifted by timezone', () => {
        // Parsed as local midnight (via the appended T00:00:00), not UTC
        // midnight — appending nothing (or 'Z') would shift the displayed
        // day backwards in any timezone behind UTC.
        expect(formatDate('2026-01-01')).toBe(expected('2026-01-01'));
    });

    test('formats a date at the end of a month/year correctly', () => {
        expect(formatDate('2026-12-31')).toBe(expected('2026-12-31'));
    });
});

describe('formatDateRange', () => {
    test('returns null when neither start nor end is set', () => {
        expect(formatDateRange(null, null)).toBeNull();
    });

    test('returns a closed "start – end" range when both are set', () => {
        expect(formatDateRange('2026-01-01', '2026-01-31')).toBe(`${expected('2026-01-01')} – ${expected('2026-01-31')}`);
    });

    test('returns an open-ended "start –" range when only start is set', () => {
        expect(formatDateRange('2026-01-01', null)).toBe(`${expected('2026-01-01')} –`);
    });

    test('returns an open-started "– end" range when only end is set', () => {
        expect(formatDateRange(null, '2026-01-31')).toBe(`– ${expected('2026-01-31')}`);
    });

    test('treats an empty string the same as null for both start and end', () => {
        expect(formatDateRange('', '')).toBeNull();
    });
});
