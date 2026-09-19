import { describe, expect, it } from 'vitest';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ScienceIcon from '@mui/icons-material/Science';
import { CATEGORY_ICONS, getCategoryIcon } from './category-icon';

describe('getCategoryIcon', () => {
    it('returns the mapped icon for a known category', () => {
        expect(getCategoryIcon('เคมีภัณฑ์และกาว')).toBe(ScienceIcon);
    });

    it('falls back to the generic Inventory2Outlined icon for an unmapped category', () => {
        expect(getCategoryIcon('หมวดหมู่ที่ไม่รู้จัก')).toBe(Inventory2OutlinedIcon);
    });

    it('falls back for an empty string', () => {
        expect(getCategoryIcon('')).toBe(Inventory2OutlinedIcon);
    });

    it('every entry in CATEGORY_ICONS resolves to itself through getCategoryIcon', () => {
        for (const category of Object.keys(CATEGORY_ICONS)) {
            expect(getCategoryIcon(category)).toBe(CATEGORY_ICONS[category]);
        }
    });
});
