import { createTheme, type PaletteMode, type ThemeOptions } from '@mui/material/styles';

const fontFamily = [
    '"Sarabun"',
    'ui-sans-serif',
    'system-ui',
    'sans-serif',
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Segoe UI Symbol"',
    '"Noto Color Emoji"',
].join(',');

/* ──────────────────────────────────────────────────────────────────────
 *  Color Palette
 *  ─────────────
 *  Primary     : Slate Blue    #334155
 *  Background  : Cool White    #F9FAFB
 *  Accent (CTA): Data Cyan     #06B6D4
 *  Secondary   : Mid Gray      #9CA3AF
 *  Highlight   : Signal Orange #EA580C
 * ────────────────────────────────────────────────────────────────────── */

export const PALETTE = {
    primary: '#334155',       // Slate Blue
    background: '#F9FAFB',    // Cool White
    // accent: '#06B6D4',        // Data Cyan — used for CTA / interactive
    accent: '#EA580C',
    secondary: '#9CA3AF',     // Mid Gray
    highlight: '#06B6D4',     // Signal Orange — sparingly for emphasis

    //redAlert
    redAlert: '#EF4444',
} as const;

/* ──────────────────────────────────────────────────────────────────────
 *  Fiori Horizon "Shell Bar" tokens
 *  ────────────────────────────────
 *  A local approximation of the SAP Fiori (Horizon theme) shell-bar CSS
 *  custom properties — --sapShellColor, --sapShell_TextColor,
 *  --sapShell_Shadow, --sapShell_Hover_Background,
 *  --sapShell_InteractiveTextColor — consumed only by <AppSidebarHeader>.
 *  This is NOT a full design-system swap: the rest of the app keeps the
 *  MUI palette above. See sap.com/design-system/fiori-design-web →
 *  UI elements → Shell Bar.
 * ────────────────────────────────────────────────────────────────────── */
export function getFioriShell(mode: PaletteMode) {
    const isDark = mode === 'dark';

    return {
        height: 57, //                                         จับให้เท่ากับ Toolbar โลโก้ของ sidebar (app-sidebar.tsx: minHeight 57px)
        color: isDark ? '#1c2228' : '#ffffff', //              --sapShellColor
        textColor: isDark ? '#eaecee' : '#1d2d3e', //          --sapShell_TextColor
        secondaryTextColor: isDark ? '#a9b4be' : '#556b82', // muted title / breadcrumb
        interactiveColor: isDark ? '#7fc5ff' : '#0064d9', //   --sapShell_InteractiveTextColor
        hoverBg: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(85,107,130,0.10)', // --sapShell_Hover_Background
        activeBg: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(85,107,130,0.20)', // --sapShell_Active_Background
        searchBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(85,107,130,0.08)',
        searchBorder: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(34,54,73,0.20)',
        shadow: isDark
            ? '0 0.125rem 0.5rem 0 rgba(0,0,0,0.45)'
            : '0 0.125rem 0.125rem 0 rgba(34,54,73,0.10), inset 0 -1px 0 0 rgba(34,54,73,0.08)', // --sapShell_Shadow
        borderRadius: 8, //                                    0.5rem — Horizon button radius
    } as const;
}

export function getTheme(mode: PaletteMode) {
    const isDark = mode === 'dark';

    const options: ThemeOptions = {
        palette: {
            mode,
            primary: {
                main: PALETTE.accent,          // Data Cyan for buttons, links, focus rings
                contrastText: '#ffffff',
            },
            secondary: {
                main: PALETTE.secondary,       // Mid Gray for supporting / muted UI
            },
            background: {
                default: isDark ? '#121212' : '#f4f6f9',   // Page background
                paper: isDark ? '#1e1e1e' : '#ffffff',      // Card surface
            },
            text: {
                primary: isDark ? '#e1e1e1' : '#212529',
                secondary: isDark ? '#8b949e' : '#6c757d',
            },
            error: {
                main: PALETTE.redAlert,       // Signal Orange for destructive / error
            },
            warning: {
                main: PALETTE.redAlert,       // Signal Orange for warnings
            },
            info: {
                main: PALETTE.accent,          // Data Cyan for info
            },
            divider: isDark ? '#30363d' : '#dee2e6',
        },
        shape: {
            borderRadius: 10,
        },
        typography: {
            fontFamily,
        },
        components: {
            MuiButton: {
                defaultProps: {
                    disableElevation: true,
                },
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                    },
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    colorDefault: {
                        backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
                    },
                },
            },
            MuiChip: {
                styleOverrides: {
                    colorPrimary: {
                        backgroundColor: PALETTE.accent,
                        color: '#ffffff',
                    },
                },
            },
            // SAP Fiori (Horizon) "Checkbox": app-wide via the theme so every
            // <Checkbox> matches without per-file changes — a bordered box that
            // fills with the brand blue (the app's single Fiori accent, same as
            // the switch/toggle/tab indicator) when checked or indeterminate.
            // ref: sap.com/design-system/fiori-design-web → UI elements → Checkbox
            MuiCheckbox: {
                styleOverrides: {
                    root: {
                        color: 'var(--fiori-border-strong)',
                        '&:hover': {
                            color: 'var(--fiori-brand)',
                            backgroundColor: 'var(--fiori-hover)',
                        },
                        '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                            color: 'var(--fiori-brand)',
                        },
                        '&.Mui-checked:hover, &.MuiCheckbox-indeterminate:hover': {
                            color: 'var(--fiori-brand)',
                            backgroundColor: 'var(--fiori-hover)',
                        },
                        '&.Mui-disabled': {
                            color: 'var(--fiori-border)',
                        },
                        '&.Mui-focusVisible': {
                            backgroundColor: 'var(--fiori-hover)',
                        },
                    },
                },
            },
        },
    };

    return createTheme(options);
}
