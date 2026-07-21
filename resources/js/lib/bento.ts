/**
 * Generic bento-grid packing: places weighted w×h cells into the fewest rows possible
 * for a given column count, then reports the exact rectangles still empty so callers
 * can fill them. Column/row units are grid cells, not pixels.
 */

export type BentoSize = { w: number; h: number };
export type BentoItem<T> = BentoSize & { weight: number; data: T };
export type PlacedBentoItem<T> = BentoItem<T> & { x: number; y: number };
export type BentoGap = BentoSize & { x: number; y: number };

type Grid = boolean[][];

function occupy(grid: Grid, cols: number, x: number, y: number, w: number, h: number) {
    for (let r = y; r < y + h; r++) {
        if (!grid[r]) grid[r] = new Array(cols).fill(false);
        for (let c = x; c < x + w; c++) grid[r][c] = true;
    }
}

export function packBento<T>(items: BentoItem<T>[], cols: number): { placed: PlacedBentoItem<T>[]; grid: Grid } {
    const grid: Grid = [];
    const placed: PlacedBentoItem<T>[] = [];

    const isFree = (x: number, y: number, w: number, h: number) => {
        if (x + w > cols) return false;
        for (let r = y; r < y + h; r++) {
            for (let c = x; c < x + w; c++) {
                if (grid[r]?.[c]) return false;
            }
        }
        return true;
    };

    const sorted = [...items].sort((a, b) => (b.weight !== a.weight ? b.weight - a.weight : b.w * b.h - a.w * a.h));

    for (const item of sorted) {
        let placedItem = false;
        for (let y = 0; y < 400 && !placedItem; y++) {
            for (let x = 0; x <= cols - item.w && !placedItem; x++) {
                if (isFree(x, y, item.w, item.h)) {
                    occupy(grid, cols, x, y, item.w, item.h);
                    placed.push({ ...item, x, y });
                    placedItem = true;
                }
            }
        }
    }
    return { placed, grid };
}

/** breaks a w×h rectangle into ≤3×3 blocks, largest-first, so gap fillers stay a sane size */
function splitRect(w: number, h: number): BentoSize[][] {
    const rows: BentoSize[][] = [];
    let remH = h;
    while (remH > 0) {
        const rowH = remH >= 3 ? (remH === 4 ? 2 : Math.min(3, remH)) : remH;
        const row: BentoSize[] = [];
        let remW = w;
        while (remW > 0) {
            const colW = remW >= 3 ? (remW === 4 ? 2 : Math.min(3, remW)) : remW;
            row.push({ w: colW, h: rowH });
            remW -= colW;
        }
        rows.push(row);
        remH -= rowH;
    }
    return rows;
}

/** finds every empty rectangle up to row maxY and reports it as one or more filler blocks */
export function findBentoGaps(grid: Grid, cols: number, maxY: number): BentoGap[] {
    const gaps: BentoGap[] = [];

    const findRect = (x: number, y: number) => {
        let maxW = 0;
        while (x + maxW < cols && !grid[y]?.[x + maxW]) maxW++;
        let h = 0;
        while (y + h < maxY) {
            let rowOk = true;
            for (let dx = 0; dx < maxW; dx++) {
                if (grid[y + h]?.[x + dx]) {
                    rowOk = false;
                    break;
                }
            }
            if (!rowOk) break;
            h++;
        }
        return { w: maxW, h };
    };

    for (let y = 0; y < maxY; y++) {
        for (let x = 0; x < cols; x++) {
            if (grid[y]?.[x]) continue;
            const { w, h } = findRect(x, y);
            if (w === 0 || h === 0) continue;

            let cy = 0;
            for (const row of splitRect(w, h)) {
                let cx = 0;
                for (const block of row) {
                    gaps.push({ x: x + cx, y: y + cy, w: block.w, h: block.h });
                    occupy(grid, cols, x + cx, y + cy, block.w, block.h);
                    cx += block.w;
                }
                cy += row[0].h;
            }
        }
    }
    return gaps;
}

export function computeBentoLayout(width: number): { cols: number; rowH: number } {
    if (width >= 1100) return { cols: 12, rowH: 90 };
    if (width >= 850) return { cols: 10, rowH: 84 };
    if (width >= 650) return { cols: 8, rowH: 78 };
    if (width >= 480) return { cols: 6, rowH: 74 };
    if (width >= 360) return { cols: 4, rowH: 70 };
    return { cols: 2, rowH: 90 };
}

/** clamps each item's width to the current column count, adjusting height so it doesn't shrink to nothing */
export function scaleBentoItems<T>(
    items: BentoItem<T>[],
    targetCols: number,
    heightAtNarrow?: (item: BentoItem<T>) => number | undefined,
): BentoItem<T>[] {
    return items.map((item) => {
        let { w, h } = item;
        if (w > targetCols) {
            const scale = targetCols / w;
            w = targetCols;
            h = Math.max(h, Math.ceil((item.h / scale) * 0.7));
        }
        if (targetCols <= 4 && w >= 3) {
            w = Math.min(w, targetCols);
        }
        if (targetCols === 2) {
            w = item.w >= 3 ? 2 : Math.min(item.w, 2);
            h = heightAtNarrow?.(item) ?? h;
        }
        return { ...item, w, h };
    });
}

export function gridArea(x: number, y: number, w: number, h: number) {
    return { gridColumn: `${x + 1} / span ${w}`, gridRow: `${y + 1} / span ${h}` };
}
