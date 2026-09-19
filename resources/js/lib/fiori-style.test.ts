import { describe, expect, it } from 'vitest';
import { FIORI, FIORI_RAW, percentToneFiori } from './fiori-style';

describe('FIORI tokens', () => {
    it('every token is a CSS custom-property reference, not a literal color', () => {
        for (const [name, value] of Object.entries(FIORI)) {
            expect(value, name).toMatch(/^var\(--fiori-[a-z-]+\)$/);
        }
    });
});

describe('FIORI_RAW tokens', () => {
    it('every token is a resolved hex color', () => {
        for (const [name, value] of Object.entries(FIORI_RAW)) {
            expect(value, name).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });
});

describe('percentToneFiori', () => {
    it('is success at/above the default high threshold (80)', () => {
        expect(percentToneFiori(80)).toBe('success');
        expect(percentToneFiori(100)).toBe('success');
    });

    it('is warning between the default mid (50) and high thresholds', () => {
        expect(percentToneFiori(50)).toBe('warning');
        expect(percentToneFiori(79)).toBe('warning');
    });

    it('is error below the default mid threshold', () => {
        expect(percentToneFiori(49)).toBe('error');
        expect(percentToneFiori(0)).toBe('error');
    });

    it('honors custom thresholds', () => {
        expect(percentToneFiori(60, { high: 60, mid: 30 })).toBe('success');
        expect(percentToneFiori(30, { high: 60, mid: 30 })).toBe('warning');
        expect(percentToneFiori(29, { high: 60, mid: 30 })).toBe('error');
    });
});
