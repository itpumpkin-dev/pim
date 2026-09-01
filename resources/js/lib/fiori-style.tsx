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

import { Box, CircularProgress, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';

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
    /** Translucent cover for a Busy State overlay — see FioriBusyOverlay. */
    scrim: 'var(--fiori-scrim)',
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

/**
 * SAP Fiori (Horizon) "Button" design types for a MUI `<Button>`. One shared
 * shape — non-uppercase label, 8px radius, no elevation, a muted disabled
 * state — with a per-design colour set. Spread onto `<Button sx={fioriEmphasizedSx}>`.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Button
 *   Emphasized → the page's single primary/confirm action (solid brand fill)
 *   Default    → neutral secondary actions (bordered, surface fill)
 *   Transparent/Ghost → lowest-emphasis action, e.g. Export (no fill, no border)
 *   Positive / Negative / Attention → semantic actions (accept / reject-delete /
 *     proceed-with-caution): a bordered button tinted with the semantic colour.
 */
const fioriButtonBaseSx = {
    fontWeight: 600,
    textTransform: 'none',
    borderRadius: '8px',
    boxShadow: 'none',
} as const;

/** Bordered semantic button (Positive / Negative / Attention share this shape). */
const fioriSemanticSx = (color: string, hoverBg: string): SxProps<Theme> => ({
    ...fioriButtonBaseSx,
    bgcolor: FIORI.surface,
    color,
    border: `1px solid ${color}`,
    '&:hover': { bgcolor: hoverBg, borderColor: color, boxShadow: 'none' },
    '&.Mui-disabled': { color: FIORI.textSecondary, borderColor: FIORI.border, opacity: 0.6 },
});

/** Fiori "Emphasized" button — the page's single primary/confirm action. */
export const fioriEmphasizedSx: SxProps<Theme> = {
    ...fioriButtonBaseSx,
    bgcolor: FIORI.brand,
    color: '#fff',
    '&:hover': { bgcolor: FIORI.brandDark, boxShadow: 'none' },
    '&.Mui-disabled': { bgcolor: FIORI.neutralBg, color: FIORI.textSecondary },
};

/** Fiori "Default" button — bordered, neutral secondary actions. */
export const fioriDefaultSx: SxProps<Theme> = {
    ...fioriButtonBaseSx,
    bgcolor: FIORI.surface,
    color: FIORI.textPrimary,
    border: `1px solid ${FIORI.borderStrong}`,
    '&:hover': { bgcolor: FIORI.headerBg, borderColor: FIORI.borderStrong },
    '&.Mui-disabled': { color: FIORI.textSecondary, borderColor: FIORI.border, opacity: 0.6 },
};

/** Fiori "Ghost"/transparent button — lowest-emphasis action (e.g. Export). */
export const fioriGhostSx: SxProps<Theme> = {
    ...fioriButtonBaseSx,
    color: FIORI.textPrimary,
    '&:hover': { bgcolor: FIORI.headerBg },
    '&.Mui-disabled': { color: FIORI.textSecondary, opacity: 0.6 },
};

/** Fiori "Positive" button — a confirming/accepting action (semantic green). */
export const fioriPositiveSx: SxProps<Theme> = fioriSemanticSx(FIORI.success, FIORI.successBg);

/** Fiori "Negative" button — a destructive/rejecting action (semantic red). */
export const fioriNegativeSx: SxProps<Theme> = fioriSemanticSx(FIORI.error, FIORI.errorBg);

/** Fiori "Attention" button — an action to proceed with caution (semantic orange). */
export const fioriAttentionSx: SxProps<Theme> = fioriSemanticSx(FIORI.warning, FIORI.warningBg);

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

/**
 * SAP Fiori (Horizon) "Tab Bar" for a MUI `<Tabs>`: a full-width strip with a
 * bottom hairline, non-uppercase labels, muted inactive text that darkens on
 * hover, and the selected tab in brand colour with a 3px brand indicator.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Tab Bar
 * Spread onto `<Tabs sx={{ ...fioriTabsSx, mb: 3 }}>`.
 */
export const fioriTabsSx: SxProps<Theme> = {
    minHeight: 44,
    borderBottom: `1px solid ${FIORI.border}`,
    '& .MuiTabs-indicator': {
        height: 3,
        borderRadius: '1.5px 1.5px 0 0',
        backgroundColor: FIORI.brand,
    },
    '& .MuiTab-root': {
        textTransform: 'none',
        fontWeight: 500,
        fontSize: '0.875rem',
        minHeight: 44,
        px: 2,
        color: FIORI.textSecondary,
        transition: 'color 0.1s ease, background-color 0.1s ease',
        '&:hover': { color: FIORI.textPrimary, backgroundColor: FIORI.hover },
        '&.Mui-selected': { color: FIORI.brand, fontWeight: 700 },
        '&.Mui-focusVisible': { backgroundColor: FIORI.hover },
    },
};

/**
 * SAP Fiori (Horizon) "Toggle Button" for a MUI `<ToggleButtonGroup>` /
 * `<ToggleButton>`: compact segmented control — non-uppercase labels, muted
 * text on a surface, `hover` tint, and a pressed state that is a pale brand
 * fill with brand text + brand border (same treatment as the RTE toolbar's
 * active button and the Fiori field chips).
 * ref: sap.com/design-system/fiori-design-web → UI elements → Toggle Button
 * Spread onto `<ToggleButtonGroup sx={{ ...fioriToggleButtonGroupSx, mb: 2 }}>`.
 */
/**
 * SAP Fiori (Horizon) "Switch" for a MUI `<Switch>`: a compact pill track
 * with a 1px border, white handle, and a brand-filled track when on (the app
 * uses its brand blue as the single Fiori accent — see the tab indicator and
 * toggle-button pressed state — rather than the spec's green).
 * ref: sap.com/design-system/fiori-design-web → UI elements → Switch
 * Spread onto `<Switch sx={fioriSwitchSx} />`.
 */
export const fioriSwitchSx: SxProps<Theme> = {
    width: 40,
    height: 22,
    padding: 0,
    display: 'flex',
    '& .MuiSwitch-switchBase': {
        padding: 0,
        margin: '3px',
        transitionDuration: '150ms',
        '&.Mui-checked': {
            transform: 'translateX(18px)',
            color: '#fff',
            '& + .MuiSwitch-track': { backgroundColor: FIORI.brand, borderColor: FIORI.brand, opacity: 1 },
            '& .MuiSwitch-thumb': { borderColor: FIORI.brand },
        },
        '&.Mui-disabled + .MuiSwitch-track': { opacity: 0.4 },
        '&.Mui-focusVisible .MuiSwitch-thumb': { boxShadow: `0 0 0 2px ${FIORI.brand}` },
    },
    '& .MuiSwitch-thumb': {
        boxSizing: 'border-box',
        width: 16,
        height: 16,
        boxShadow: 'none',
        color: '#fff',
        border: `1px solid ${FIORI.borderStrong}`,
    },
    '& .MuiSwitch-track': {
        borderRadius: 11,
        border: `1px solid ${FIORI.borderStrong}`,
        backgroundColor: FIORI.headerBg,
        opacity: 1,
        boxSizing: 'border-box',
        transition: 'background-color 150ms, border-color 150ms',
    },
};

export const fioriToggleButtonGroupSx: SxProps<Theme> = {
    '& .MuiToggleButton-root': {
        textTransform: 'none',
        fontWeight: 500,
        fontSize: '0.8125rem',
        lineHeight: 1.4,
        px: 1.5,
        py: 0.5,
        color: FIORI.textSecondary,
        borderColor: FIORI.borderStrong,
        transition: 'background-color 0.1s ease, color 0.1s ease, border-color 0.1s ease',
        '&:hover': { backgroundColor: FIORI.hover, color: FIORI.textPrimary },
        '&.Mui-selected': {
            backgroundColor: FIORI.brandBg,
            color: FIORI.brand,
            borderColor: FIORI.brand,
            fontWeight: 700,
            zIndex: 1,
            '&:hover': { backgroundColor: FIORI.brandBg, color: FIORI.brand },
        },
        '&.Mui-disabled': { color: FIORI.textSecondary, opacity: 0.5 },
    },
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

/**
 * Delay-gates a boolean so it only flips true once `active` has stayed true
 * for `delayMs` — the mechanism behind Fiori's Busy Indicator rule "don't use
 * it for an operation under 1 second": a request that resolves before the
 * delay elapses never shows anything, so fast responses don't flash a
 * spinner. Used by `FioriBusyOverlay`; exported directly for callers that
 * need the delayed boolean without the overlay markup (e.g. to disable a
 * control instead of dimming it).
 */
export function useFioriBusy(active: boolean, delayMs = 700): boolean {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!active) {
            setShow(false);
            return;
        }

        const timer = setTimeout(() => setShow(true), delayMs);
        return () => clearTimeout(timer);
    }, [active, delayMs]);

    return show;
}

/** Fiori "Busy Indicator" — small brand-colored spinner, sized for a component/section, not a full page. */
export function FioriBusyIndicator({ size = 28 }: { size?: number }) {
    return <CircularProgress size={size} thickness={4} sx={{ color: FIORI.brand }} />;
}

/**
 * Fiori "Busy State" — dims one section/component while it's fetching,
 * instead of blocking the whole page. Per the Fiori guidance this wraps:
 * only for unspecified waits over ~1s (gated by `useFioriBusy`'s delay, so a
 * fast fetch never flashes it), only over the affected component (content
 * underneath stays visible, just dimmed + non-interactive), never a stand-in
 * for full-page/navigation loading (that's `RouteLoadingSkeleton`'s job).
 */
export function FioriBusyOverlay({ busy, delayMs = 700, children }: { busy: boolean; delayMs?: number; children: ReactNode }) {
    const show = useFioriBusy(busy, delayMs);

    return (
        <Box sx={{ position: 'relative' }} aria-busy={busy}>
            {children}
            {show && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: FIORI.scrim,
                        pointerEvents: 'all',
                        zIndex: 1,
                    }}
                >
                    <FioriBusyIndicator />
                </Box>
            )}
        </Box>
    );
}
