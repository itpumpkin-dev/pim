/**
 * Shared style tokens/helpers for the catalog admin's list, sync and
 * mapping pages (products, brands, categories). Every page under
 * `pages/catalog/**` that needs a "mapped/pending/unmapped" chip, a save
 * button, a platform picker card, or a completeness/match-score color
 * should pull it from here instead of re-declaring its own hex constants —
 * this file is the single place that decides what those states look like
 * (currently a flat, monochrome "lo-fi" look). Swapping the whole app to a
 * "hi-fi" look later (real brand colors, shadows, etc.) means editing the
 * implementations in this file only; call sites don't change.
 */

import type { SxProps, Theme } from '@mui/material';

/** Raw hex, for template-literal borders (e.g. `` `1.5px dashed ${UI_BORDER_STRONG}` ``). */
export const UI_BORDER = '#9e9e9e';
export const UI_BORDER_STRONG = '#424242';

/** Primary/confirm action button (Save, Map, Push, Duplicate, Download, …). */
export const solidActionSx: SxProps<Theme> = {
    bgcolor: 'grey.800',
    color: 'white',
    '&:hover': { bgcolor: 'grey.900' },
};

/** Chip for an already-mapped/enabled/live row. */
export const mappedChipSx: SxProps<Theme> = {
    bgcolor: 'grey.800',
    color: '#fff',
    fontWeight: 600,
};

/** Chip for a staged-but-unsaved mapping change ("will map to" / "will clear"). */
export const pendingChipSx: SxProps<Theme> = {
    fontWeight: 600,
    border: `1.5px dashed ${UI_BORDER_STRONG}`,
    color: 'grey.900',
    bgcolor: 'grey.50',
};

/** Chip for "not applicable" / "unmapped" / "not live" — an outlined neutral state. */
export const naChipSx: SxProps<Theme> = {
    border: `1px solid ${UI_BORDER}`,
    color: 'text.secondary',
    bgcolor: 'transparent',
    fontWeight: 600,
};

/** Extra sx for a mapping-list row Paper, depending on whether it has a staged change. */
export function pendingRowSx(hasPendingChange: boolean): SxProps<Theme> {
    return hasPendingChange
        ? { border: `1.5px dashed ${UI_BORDER_STRONG}`, bgcolor: 'grey.100' }
        : { borderColor: UI_BORDER };
}

/**
 * Gray tone for a 0-100 completeness/progress percentage. `thresholds`
 * lets each caller tune what counts as "high"/"mid" for its own metric
 * (e.g. products/index.tsx's per-row completeness vs
 * missing-translations.tsx's overall-catalog progress).
 */
export function percentTone(percent: number, thresholds: { high: number; mid: number } = { high: 80, mid: 50 }): { bg: string; fg: string } {
    if (percent >= thresholds.high) return { bg: 'grey.800', fg: '#fff' };
    if (percent >= thresholds.mid) return { bg: 'grey.500', fg: '#fff' };
    return { bg: 'grey.200', fg: 'grey.800' };
}

/** Gray tone for a category-mapping auto-suggestion's match score (0-100). */
export function matchScoreTone(score: number): { bg: string; fg: string; border: string } {
    if (score >= 70) return { bg: 'grey.800', fg: '#fff', border: 'grey.800' };
    if (score >= 40) return { bg: 'grey.500', fg: '#fff', border: 'grey.500' };
    return { bg: 'grey.200', fg: 'grey.800', border: 'grey.400' };
}

/** Marketplace-sync hub: the clickable platform-picker tile. */
export function syncPlatformCardSx(isSelected: boolean, disabled: boolean): SxProps<Theme> {
    return {
        display: 'flex',
        width: '100%',
        borderRadius: '0.25rem',
        bgcolor: isSelected ? 'grey.100' : 'background.paper',
        overflow: 'hidden',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !isSelected ? 0.6 : 1,
        border: isSelected ? `2px solid ${UI_BORDER_STRONG}` : `1px solid ${UI_BORDER}`,
        transition: 'border-color 0.15s ease, opacity 0.15s ease',
        '&:hover': disabled ? {} : { borderColor: UI_BORDER_STRONG },
    };
}

/** Marketplace-sync hub: the selected-platform detail card. `weight` lets a page keep its own emphasis. */
export function syncDetailCardSx(weight: 'regular' | 'strong' = 'regular'): SxProps<Theme> {
    return {
        borderRadius: '0.25rem',
        border: `1px solid ${weight === 'strong' ? UI_BORDER_STRONG : UI_BORDER}`,
        bgcolor: 'background.paper',
        maxWidth: 640,
    };
}
