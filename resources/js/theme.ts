import { createTheme, type PaletteMode, type ThemeOptions } from '@mui/material/styles';

const fontFamily = [
    '"Instrument Sans"',
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

    const options: ThemeOptions = {
        palette: {
            mode,
            primary: {
                main: isDark ? '#818cf8' : '#4f46e5',
            },
            secondary: {
                main: isDark ? '#a78bfa' : '#7c3aed',
            },
            background: {
                default: isDark ? '#0a0a0a' : '#fafafa',
                paper: isDark ? '#141414' : '#ffffff',
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
