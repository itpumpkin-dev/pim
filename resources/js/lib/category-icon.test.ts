import { describe, expect, it } from 'vitest';
import { CATEGORY_ICON_NAMES, DEFAULT_CATEGORY_ICON_NAME, getCategoryIconName } from './category-icon';

describe('getCategoryIconName', () => {
    it('returns the mapped UI5 icon name for a known category', () => {
        expect(getCategoryIconName('เคมีภัณฑ์และกาว')).toBe('lab');
    });

    it('falls back to the generic inventory icon for an unmapped category', () => {
        expect(DEFAULT_CATEGORY_ICON_NAME).toBe('inventory');
        expect(getCategoryIconName('หมวดหมู่ที่ไม่รู้จัก')).toBe('inventory');
    });

    it('falls back for an empty string', () => {
        expect(getCategoryIconName('')).toBe('inventory');
    });

    it('every entry in CATEGORY_ICON_NAMES resolves to itself through getCategoryIconName', () => {
        for (const category of Object.keys(CATEGORY_ICON_NAMES)) {
            expect(getCategoryIconName(category)).toBe(CATEGORY_ICON_NAMES[category]);
        }
    });

    it('maps every one of the 19 seeded top-level categories to a non-empty icon name', () => {
        const names = Object.values(CATEGORY_ICON_NAMES);
        expect(names).toHaveLength(19);
        for (const name of names) {
            expect(typeof name).toBe('string');
            expect(name.length).toBeGreaterThan(0);
        }
    });
});
