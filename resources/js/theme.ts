import { createTheme, type PaletteMode, type ThemeOptions } from '@mui/material/styles';

const fontFamily = [
    '"Instrument Sans"',
    '"Noto Sans Thai"',
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
                main: isDark ? '#ff6a3d' : '#ff3300',
                contrastText: '#ffffff',
            },
            secondary: {
                main: isDark ? '#a78bfa' : '#7c3aed',
            },
            background: {
                default: isDark ? '#0a0a0a' : '#fff8f6',
                paper: isDark ? '#141414' : '#ffffff',
            },
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
        },
    };

    return createTheme(options);
}
