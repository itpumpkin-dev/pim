/**
 * Shared style tokens/helpers for the catalog admin's list, sync and
 * mapping pages (products, brands, categories). Every page under
 * `pages/catalog/**` that needs a "mapped/pending/unmapped" chip, a save
 * button, a platform picker card, or a completeness/match-score color
 * should pull it from here instead of re-declaring its own hex constants —
 * this file is the single place that decides what those states look like.
 * It now maps onto the SAP Fiori tokens in `fiori-style.tsx`: call sites
 * don't change, only the implementations here do.
 */

import type { SxProps, Theme } from '@mui/material';
import { FIORI, percentToneFiori } from './fiori-style';

/** Raw hex, for template-literal borders (e.g. `` `1.5px dashed ${UI_BORDER_STRONG}` ``). */
export const UI_BORDER = FIORI.border;
export const UI_BORDER_STRONG = FIORI.borderStrong;

/** Primary/confirm action button (Save, Map, Push, Duplicate, Download, …). */
export const solidActionSx: SxProps<Theme> = {
    bgcolor: FIORI.brand,
    color: '#fff',
    borderRadius: '8px',
    boxShadow: 'none',
    '&:hover': { bgcolor: FIORI.brandDark, boxShadow: 'none' },
};

/** Chip for an already-mapped/enabled/live row. */
export const mappedChipSx: SxProps<Theme> = {
    bgcolor: FIORI.success,
    color: '#fff',
    fontWeight: 600,
    borderRadius: '6px',
};

/** Chip for a staged-but-unsaved mapping change ("will map to" / "will clear"). */
export const pendingChipSx: SxProps<Theme> = {
    fontWeight: 600,
    border: `1.5px dashed ${FIORI.warning}`,
    color: FIORI.warning,
    bgcolor: FIORI.warningBg,
    borderRadius: '6px',
};

/** Chip for "not applicable" / "unmapped" / "not live" — an outlined neutral state. */
export const naChipSx: SxProps<Theme> = {
    border: `1px solid ${FIORI.border}`,
    color: FIORI.textSecondary,
    bgcolor: 'transparent',
    fontWeight: 600,
    borderRadius: '6px',
};

/** Extra sx for a mapping-list row Paper, depending on whether it has a staged change. */
export function pendingRowSx(hasPendingChange: boolean): SxProps<Theme> {
    return hasPendingChange
        ? { border: `1.5px dashed ${FIORI.warning}`, bgcolor: FIORI.warningBg }
        : { borderColor: FIORI.border };
}

const TONE_BG: Record<'success' | 'warning' | 'error', string> = {
    success: FIORI.successBg,
    warning: FIORI.warningBg,
    error: FIORI.errorBg,
};

/**
 * Semantic tone for a 0-100 completeness/progress percentage. `thresholds`
 * lets each caller tune what counts as "high"/"mid" for its own metric
 * (e.g. products/index.tsx's per-row completeness vs
 * missing-translations.tsx's overall-catalog progress).
 */
export function percentTone(percent: number, thresholds: { high: number; mid: number } = { high: 80, mid: 50 }): { bg: string; fg: string } {
    const tone = percentToneFiori(percent, thresholds);
    return { bg: TONE_BG[tone], fg: FIORI[tone] };
}

/** Semantic tone for a category-mapping auto-suggestion's match score (0-100). */
export function matchScoreTone(score: number): { bg: string; fg: string; border: string } {
    if (score >= 70) return { bg: FIORI.successBg, fg: FIORI.success, border: FIORI.success };
    if (score >= 40) return { bg: FIORI.warningBg, fg: FIORI.warning, border: FIORI.warning };
    return { bg: FIORI.neutralBg, fg: FIORI.textSecondary, border: FIORI.border };
}

/** Marketplace-sync hub: the clickable platform-picker tile. */
export function syncPlatformCardSx(isSelected: boolean, disabled: boolean): SxProps<Theme> {
    return {
        display: 'flex',
        width: '100%',
        borderRadius: '8px',
        bgcolor: isSelected ? FIORI.brandBg : FIORI.surface,
        overflow: 'hidden',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !isSelected ? 0.6 : 1,
        border: isSelected ? `2px solid ${FIORI.brand}` : `1px solid ${FIORI.border}`,
        transition: 'border-color 0.15s ease, opacity 0.15s ease',
        '&:hover': disabled ? {} : { borderColor: FIORI.brand },
    };
}

/** Marketplace-sync hub: the selected-platform detail card. `weight` lets a page keep its own emphasis. */
export function syncDetailCardSx(weight: 'regular' | 'strong' = 'regular'): SxProps<Theme> {
    return {
        borderRadius: '8px',
        border: `1px solid ${weight === 'strong' ? FIORI.borderStrong : FIORI.border}`,
        bgcolor: FIORI.surface,
        maxWidth: 640,
    };
}
