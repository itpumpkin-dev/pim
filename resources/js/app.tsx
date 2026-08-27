import '../css/app.css';
import './lib/i18n';

import { createInertiaApp } from '@inertiajs/react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createElement, useEffect, useMemo, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { PermissionsChangedToast } from './components/permissions-changed-toast';
import { AppearanceProvider, useResolvedAppearance } from './hooks/use-appearance';
import { useSyncI18nLanguage } from './hooks/use-locale';
// import { LocaleProvider } from './hooks/use-locale';
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
    // getTheme() runs createTheme() — a non-trivial build — and this component
    // wraps every Inertia page, so recomputing it on each render (e.g. every
    // page navigation) is pure waste. It only depends on the light/dark mode.
    const theme = useMemo(() => getTheme(resolved), [resolved]);
    useSyncI18nLanguage();

    // Drives the SAP Fiori CSS custom properties in app.css — every FIORI.*
    // token in fiori-style.tsx/ui-style.ts is a var(--fiori-*) reference, so
    // flipping this attribute is what makes the whole Fiori-themed UI
    // respond to the app's existing light/dark appearance toggle.
    useEffect(() => {
        document.documentElement.setAttribute('data-fiori-mode', resolved);
    }, [resolved]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <PermissionsChangedToast />
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
                <App {...props}>
                    {({ Component, props: pageProps, key }) => {
                        const layout = (Component as ComponentType & PageLayout).layout;
                        const page = createElement(Component, { key, ...pageProps });

                        return <ThemedPage>{typeof layout === 'function' ? layout(page) : page}</ThemedPage>;
                    }}
                </App>
            </AppearanceProvider>,
        );
    },
    // The skeleton in RouteLoadingSkeleton (rendered via AppContent) is now
    // the app's single navigation-loading indicator, replacing Inertia's
    // default top progress bar.
    progress: false,
});
