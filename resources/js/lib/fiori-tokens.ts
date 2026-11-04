/**
 * SAP Fiori design tokens (legacy `var(--fiori-*)` references + resolved hex
 * values) and pure helpers. Deliberately free of any React/MUI/UI5 import so
 * it can be unit-tested in vitest's node environment and imported from
 * plain `.ts` helpers (ui-style.ts). Re-exported from `fiori-style.tsx`.
 *
 * The `--fiori-*` custom properties are declared in `resources/css/app.css`
 * and are now aliases of the official UI5 theme variables (`--sap*`), so
 * light/dark comes from the UI5 theme (sap_horizon / sap_horizon_dark).
 * New code should use the `--sap*` variables directly.
 */

/** CSS-variable-backed tokens, approximating SAP's Horizon theme (light + dark). */
export const FIORI = {
    brand: 'var(--fiori-brand)',
    brandDark: 'var(--fiori-brand-dark)',
    textPrimary: 'var(--fiori-text-primary)',
    textSecondary: 'var(--fiori-text-secondary)',
    /** Field placeholder text — deliberately lighter/more muted than textSecondary (used elsewhere for helper text, disabled states, etc.), so an empty field reads as "empty" at a glance instead of looking like it already has a value. */
    placeholder: 'var(--fiori-placeholder)',
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
 * e.g. chart libraries that compute hover/gradient shades via d3-color, which
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

export type FioriTone = 'success' | 'warning' | 'error' | 'neutral' | 'information';

/** Semantic tone for a 0-100 completeness/progress percentage. */
export function percentToneFiori(
    percent: number,
    thresholds: { high: number; mid: number } = { high: 80, mid: 50 },
): 'success' | 'warning' | 'error' {
    if (percent >= thresholds.high) return 'success';
    if (percent >= thresholds.mid) return 'warning';
    return 'error';
}
