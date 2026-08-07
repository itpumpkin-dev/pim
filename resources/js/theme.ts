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
        },
    };

    return createTheme(options);
}
