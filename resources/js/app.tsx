import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { AppearanceProvider, useResolvedAppearance } from './hooks/use-appearance';
import { getTheme } from './theme';

declare global {
    const route: typeof routeFn;
}

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

function ThemedApp({ App, props }: { App: React.ElementType; props: Record<string, unknown> }) {
    const { resolved } = useResolvedAppearance();
    const theme = getTheme(resolved);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <App {...props} />
        </ThemeProvider>
    );
}

createInertiaApp({
    title: (title) => `${title} - ${appName}`,
    resolve: (name) => resolvePageComponent(`./pages/${name}.tsx`, import.meta.glob('./pages/**/*.tsx')),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(
            <AppearanceProvider>
                <ThemedApp App={App} props={props} />
            </AppearanceProvider>,
        );
    },
    progress: {
        color: '#f37021', // Pumpkin Orange — matches theme.ts primary
    },
});
