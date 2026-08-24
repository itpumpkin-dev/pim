/**
 * SAP Fiori (Horizon)-inspired design tokens for the catalog admin.
 * Scoped to pages that have been migrated to the Fiori look — currently
 * `pages/catalog/**`, `pages/system/**`, `pages/import-export/**`, and
 * several other admin pages. Other pages still use the flat gray tokens in
 * `ui-style.ts` (itself now built on top of these same tokens) — migrate
 * them by swapping their imports over to this file the same way.
 *
 * Every token below is a CSS custom property reference (`var(--fiori-*)`),
 * not a literal hex string — the actual light/dark values are declared once
 * in `resources/css/app.css` under `:root` and `[data-fiori-mode='dark']`.
 * That's what lets every page that imports `FIORI.pageBg` etc. get dark-mode
 * support for free the moment the app sets `data-fiori-mode` on `<html>`
 * (see `app.tsx`'s `ThemedPage`) — no call site needs to change.
 */

import { Box, Stack, Typography, type SxProps, type Theme } from '@mui/material';

/** CSS-variable-backed tokens, approximating SAP's Horizon theme (light + dark). */
export const FIORI = {
    brand: 'var(--fiori-brand)',
    brandDark: 'var(--fiori-brand-dark)',
    textPrimary: 'var(--fiori-text-primary)',
    textSecondary: 'var(--fiori-text-secondary)',
    border: 'var(--fiori-border)',
    borderStrong: 'var(--fiori-border-strong)',
    pageBg: 'var(--fiori-page-bg)',
    headerBg: 'var(--fiori-header-bg)',
    hover: 'var(--fiori-hover)',
    selected: 'var(--fiori-selected)',
    success: 'var(--fiori-success)',
    warning: 'var(--fiori-warning)',
    error: 'var(--fiori-error)',
    neutral: 'var(--fiori-neutral)',
    information: 'var(--fiori-information)',
    /** Card/table/dialog surface — the "white" of the light theme, a raised dark gray in dark mode. */
    surface: 'var(--fiori-surface)',
    /** Tinted backgrounds for status chips/tiles (pastel in light mode, a low-opacity overlay in dark mode). */
    successBg: 'var(--fiori-success-bg)',
    warningBg: 'var(--fiori-warning-bg)',
    errorBg: 'var(--fiori-error-bg)',
    neutralBg: 'var(--fiori-neutral-bg)',
    brandBg: 'var(--fiori-brand-bg)',
} as const;

/**
 * Resolved (non-CSS-variable) hex values, for the rare consumer that parses
 * a color string in JavaScript instead of handing it to the browser as CSS —
 * e.g. `@mui/x-charts` computes hover/gradient shades via d3-color, which
 * chokes on a literal `"var(--fiori-brand)"` string (`d3.color(...)` returns
 * null, then `.brighter()` on that null crashes the whole chart — this isn't
 * hypothetical, it's exactly what happened before this constant existed).
 * Values here don't respond to dark mode; that's an acceptable trade-off for
 * the handful of chart-library props that need this instead of `FIORI.*`.
 */
export const FIORI_RAW = {
    brand: '#0070F2',
    success: '#257A3E',
    warning: '#E76500',
    error: '#BB0000',
    neutral: '#6A6D70',
} as const;

/** Fiori "Emphasized" button — the page's single primary/confirm action. */
export const fioriEmphasizedSx: SxProps<Theme> = {
    bgcolor: FIORI.brand,
    color: '#fff',
    fontWeight: 600,
    textTransform: 'none',
    borderRadius: '8px',
    boxShadow: 'none',
    '&:hover': { bgcolor: FIORI.brandDark, boxShadow: 'none' },
};

/** Fiori "Default" button — bordered, neutral secondary actions. */
export const fioriDefaultSx: SxProps<Theme> = {
    bgcolor: FIORI.surface,
    color: FIORI.textPrimary,
    border: `1px solid ${FIORI.borderStrong}`,
    fontWeight: 600,
    textTransform: 'none',
    borderRadius: '8px',
    '&:hover': { bgcolor: FIORI.headerBg, borderColor: FIORI.borderStrong },
};

/** Fiori "Ghost"/transparent button — lowest-emphasis action (e.g. Export). */
export const fioriGhostSx: SxProps<Theme> = {
    color: FIORI.textPrimary,
    fontWeight: 600,
    textTransform: 'none',
    borderRadius: '8px',
    '&:hover': { bgcolor: FIORI.headerBg },
};

/** Toolbar icon button (filter, columns, row actions, pagination arrows). */
export const fioriIconButtonSx: SxProps<Theme> = {
    color: FIORI.textSecondary,
    borderRadius: '6px',
    '&:hover': { bgcolor: FIORI.headerBg },
};

/** Search field — rectangular corners, thin border, brand-colored focus ring. */
export const fioriSearchFieldSx: SxProps<Theme> = {
    bgcolor: FIORI.surface,
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        '& fieldset': { borderColor: FIORI.border },
        '&:hover fieldset': { borderColor: FIORI.borderStrong },
        '&.Mui-focused fieldset': { borderColor: FIORI.brand, borderWidth: '1px' },
    },
};

/** Card wrapping a Fiori "Table" (toolbar + head + rows share one bordered surface). */
export const fioriCardSx: SxProps<Theme> = {
    border: `1px solid ${FIORI.border}`,
    borderRadius: '8px',
    bgcolor: FIORI.surface,
    overflow: 'hidden',
};

export const fioriTableHeadSx: SxProps<Theme> = { bgcolor: FIORI.headerBg };

export const fioriTableHeadCellSx: SxProps<Theme> = {
    fontWeight: 600,
    color: FIORI.textPrimary,
    fontSize: '0.8125rem',
    py: 1,
    borderBottom: `1px solid ${FIORI.border}`,
};

export function fioriTableRowSx(selected: boolean): SxProps<Theme> {
    return {
        bgcolor: selected ? FIORI.selected : 'transparent',
        '&:hover': { bgcolor: selected ? FIORI.selected : FIORI.hover },
        '& td': { borderBottom: `1px solid ${FIORI.border}` },
    };
}

export const fioriBodyCellSx: SxProps<Theme> = {
    color: FIORI.textPrimary,
    fontSize: '0.8125rem',
    py: 0.75,
};

export type FioriTone = 'success' | 'warning' | 'error' | 'neutral' | 'information';

/**
 * Fiori "ObjectStatus" — a colored dot + colored text, used in place of
 * Material filled chips for status/completeness/live-state columns.
 */
export function FioriStatus({ label, tone, title }: { label: string; tone: FioriTone; title?: string }) {
    const color = FIORI[tone];
    return (
        <Stack direction="row" alignItems="center" spacing={0.75} title={title} sx={{ display: 'inline-flex' }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
            <Typography component="span" sx={{ color, fontWeight: 600, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                {label}
            </Typography>
        </Stack>
    );
}

/** Semantic tone for a 0-100 completeness/progress percentage. */
export function percentToneFiori(percent: number, thresholds: { high: number; mid: number } = { high: 80, mid: 50 }): 'success' | 'warning' | 'error' {
    if (percent >= thresholds.high) return 'success';
    if (percent >= thresholds.mid) return 'warning';
    return 'error';
}
