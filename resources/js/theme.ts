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

export function getTheme(mode: PaletteMode) {
    const isDark = mode === 'dark';

    // 60-30-10: neutral surfaces/text dominate (60%), slate carries structural
    // chrome and supporting text (30%), pumpkin orange is reserved for CTAs and
    // active/selected states only (10%).
    const slate = isDark ? '#94a3b8' : '#475569';

    const options: ThemeOptions = {
        palette: {
            mode,
            primary: {
                main: '#f37021', // Pumpkin Orange — 10% accent
            },
            secondary: {
                main: slate, // 30% structural/supporting
            },
            background: {
                default: isDark ? '#0f172a' : '#f8fafc', // 60% neutral
                paper: isDark ? '#1e293b' : '#ffffff',
            },
            text: {
                secondary: slate,
            },
        },
        shape: {
            borderRadius: 8,
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
        },
    };

    return createTheme(options);
}
