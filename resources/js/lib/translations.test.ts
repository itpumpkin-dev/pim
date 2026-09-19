import { describe, expect, it } from 'vitest';
import { categoryLabels, locales, translate, translateCategory } from './translations';

describe('locales', () => {
    it('lists th/en/zh in that order', () => {
        expect(locales.map((l) => l.value)).toEqual(['th', 'en', 'zh']);
    });
});

describe('translate', () => {
    it('returns the Thai string for a known key', () => {
        expect(translate('th', 'nav.home')).toBe('หน้าแรก');
    });

    it('returns the English string for the same key', () => {
        expect(translate('en', 'nav.home')).toBe('Home');
    });

    it('substitutes every {var} placeholder from the vars map', () => {
        expect(translate('en', 'home.products.count', { count: 42 })).toBe('42 items total');
    });

    it('substitutes multiple distinct placeholders in the same string', () => {
        expect(translate('th', 'common.packLabel', { qty: 12, unit: 'ชิ้น' })).toBe('บรรจุ 12 ชิ้น/ลัง');
    });

    it('replaces every occurrence when the same placeholder repeats', () => {
        expect(translate('en', 'show.sku', { sku: 'ABC-1' })).toBe('SKU ABC-1');
    });

    it('leaves a placeholder untouched when vars has no matching entry', () => {
        expect(translate('en', 'home.products.count')).toBe('{count} items total');
    });
});

describe('translateCategory', () => {
    it('returns the category name as-is for the th locale (no translation table lookup)', () => {
        expect(translateCategory('th', 'ซิลิโคน')).toBe('ซิลิโคน');
    });

    it('translates a known category to English', () => {
        expect(translateCategory('en', 'ซิลิโคน')).toBe('Silicone');
    });

    it('translates a known category to Chinese', () => {
        expect(translateCategory('zh', 'ซิลิโคน')).toBe('硅酮胶');
    });

    it('falls back to the original Thai string for a category with no translation entry', () => {
        expect(translateCategory('en', 'ไม่มีในตาราง')).toBe('ไม่มีในตาราง');
    });

    it('every categoryLabels entry has both en and zh translations', () => {
        for (const [category, entry] of Object.entries(categoryLabels)) {
            expect(entry.en, `${category} missing en`).toBeTruthy();
            expect(entry.zh, `${category} missing zh`).toBeTruthy();
        }
    });
});
