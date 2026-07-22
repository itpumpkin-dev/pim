import '../css/app.css';
import './lib/i18n';

import { createInertiaApp } from '@inertiajs/react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { AppearanceProvider, useResolvedAppearance } from './hooks/use-appearance';
import { useSyncI18nLanguage } from './hooks/use-locale';
import { LocaleProvider } from './hooks/use-locale';
import { getTheme } from './theme';

declare global {
    const route: typeof routeFn;
}

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

interface PageLayout {
    layout?: (page: ReactNode) => ReactNode;
}

// Renders inside Inertia's <App>, so usePage() (needed by useSyncI18nLanguage) resolves correctly —
// unlike a wrapper rendered around <App>, which sits outside Inertia's page-context provider.
function ThemedPage({ children }: { children: ReactNode }) {
    const { resolved } = useResolvedAppearance();
    const theme = getTheme(resolved);
    useSyncI18nLanguage();

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
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
<<<<<<< HEAD
                <App {...props}>
                    {({ Component, props: pageProps, key }) => {
                        const layout = (Component as ComponentType & PageLayout).layout;
                        const page = createElement(Component, { key, ...pageProps });

                        return <ThemedPage>{typeof layout === 'function' ? layout(page) : page}</ThemedPage>;
                    }}
                </App>
=======
                <LocaleProvider>
                    <ThemedApp App={App} props={props} />
                </LocaleProvider>
>>>>>>> 76c5b0d017e006d5782314ec2b9ed272ebb1cbe0
            </AppearanceProvider>,
        );
    },
    progress: {
        color: '#f37021', // Pumpkin Orange — matches theme.ts primary
    },
});
