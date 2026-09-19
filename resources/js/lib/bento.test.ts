import { describe, expect, it } from 'vitest';
import { computeBentoLayout, findBentoGaps, gridArea, packBento, scaleBentoItems, type BentoItem } from './bento';

describe('packBento', () => {
    it('places a single item at the origin', () => {
        const { placed } = packBento([{ w: 1, h: 1, weight: 1, data: 'a' }], 2);
        expect(placed).toEqual([{ w: 1, h: 1, weight: 1, data: 'a', x: 0, y: 0 }]);
    });

    it('places higher-weight items first, filling the row left to right', () => {
        const items: BentoItem<string>[] = [
            { w: 1, h: 1, weight: 1, data: 'low' },
            { w: 1, h: 1, weight: 5, data: 'high' },
        ];
        const { placed } = packBento(items, 2);

        expect(placed.find((i) => i.data === 'high')).toMatchObject({ x: 0, y: 0 });
        expect(placed.find((i) => i.data === 'low')).toMatchObject({ x: 1, y: 0 });
    });

    it('breaks a weight tie by placing the larger-area item first', () => {
        const items: BentoItem<string>[] = [
            { w: 1, h: 1, weight: 1, data: 'small' },
            { w: 2, h: 1, weight: 1, data: 'big' },
        ];
        const { placed } = packBento(items, 3);

        expect(placed.find((i) => i.data === 'big')).toMatchObject({ x: 0, y: 0 });
        expect(placed.find((i) => i.data === 'small')).toMatchObject({ x: 2, y: 0 });
    });

    it('wraps to the next row when the current row has no room left', () => {
        const items: BentoItem<string>[] = [
            { w: 2, h: 1, weight: 2, data: 'first' },
            { w: 2, h: 1, weight: 1, data: 'second' },
        ];
        const { placed } = packBento(items, 2);

        expect(placed.find((i) => i.data === 'first')).toMatchObject({ x: 0, y: 0 });
        expect(placed.find((i) => i.data === 'second')).toMatchObject({ x: 0, y: 1 });
    });

    it('never places an item wider than the grid', () => {
        const { placed } = packBento([{ w: 3, h: 1, weight: 1, data: 'too-wide' }], 2);
        expect(placed).toEqual([]);
    });
});

describe('findBentoGaps', () => {
    it('reports one gap covering an entirely empty grid', () => {
        expect(findBentoGaps([], 2, 2)).toEqual([{ x: 0, y: 0, w: 2, h: 2 }]);
    });

    it('reports nothing when the whole area up to maxY is already occupied', () => {
        expect(findBentoGaps([[true, true]], 2, 1)).toEqual([]);
    });

    it('reports only the empty rectangle next to an occupied cell', () => {
        expect(findBentoGaps([[true, false, false]], 3, 1)).toEqual([{ x: 1, y: 0, w: 2, h: 1 }]);
    });

    it('splits a gap taller/wider than 3 cells into multiple ≤3×3 blocks', () => {
        const gaps = findBentoGaps([], 4, 4);

        for (const gap of gaps) {
            expect(gap.w).toBeLessThanOrEqual(3);
            expect(gap.h).toBeLessThanOrEqual(3);
        }
        // total area covered must equal the full 4x4 region
        expect(gaps.reduce((sum, g) => sum + g.w * g.h, 0)).toBe(16);
    });
});

describe('computeBentoLayout', () => {
    it.each([
        [1100, 12, 90],
        [1099, 10, 84],
        [850, 10, 84],
        [849, 8, 78],
        [650, 8, 78],
        [649, 6, 74],
        [480, 6, 74],
        [479, 4, 70],
        [360, 4, 70],
        [359, 2, 90],
        [0, 2, 90],
    ])('width %i -> cols %i, rowH %i', (width, cols, rowH) => {
        expect(computeBentoLayout(width)).toEqual({ cols, rowH });
    });
});

describe('scaleBentoItems', () => {
    it('leaves an item unchanged when it already fits within targetCols', () => {
        const [result] = scaleBentoItems([{ w: 2, h: 2, weight: 1, data: null }], 4);
        expect(result).toMatchObject({ w: 2, h: 2 });
    });

    it('clamps an over-wide item to targetCols and grows its height proportionally', () => {
        const [result] = scaleBentoItems([{ w: 6, h: 2, weight: 1, data: null }], 4);
        expect(result.w).toBe(4);
        expect(result.h).toBeGreaterThanOrEqual(2);
    });

    it('at targetCols=2, uses heightAtNarrow() instead of the proportionally-scaled height when provided', () => {
        const [result] = scaleBentoItems([{ w: 4, h: 2, weight: 1, data: null }], 2, () => 9);
        expect(result).toMatchObject({ w: 2, h: 9 });
    });

    it('at targetCols=2, caps width at 2 even without heightAtNarrow', () => {
        const [result] = scaleBentoItems([{ w: 6, h: 2, weight: 1, data: null }], 2);
        expect(result.w).toBe(2);
    });
});

describe('gridArea', () => {
    it('converts 0-based coordinates into 1-based CSS grid-column/grid-row spans', () => {
        expect(gridArea(0, 0, 2, 3)).toEqual({ gridColumn: '1 / span 2', gridRow: '1 / span 3' });
    });

    it('offsets correctly for a non-origin position', () => {
        expect(gridArea(2, 1, 1, 1)).toEqual({ gridColumn: '3 / span 1', gridRow: '2 / span 1' });
    });
});
