import '../css/app.css';
import './lib/i18n';

import { createInertiaApp } from '@inertiajs/react';
import { setLanguage as setUi5Language } from '@ui5/webcomponents-base/dist/config/Language.js';
import { setTheme as setUi5Theme } from '@ui5/webcomponents-base/dist/config/Theme.js';
import { ThemeProvider as Ui5ThemeProvider } from '@ui5/webcomponents-react';
import '@ui5/webcomponents-react/dist/Assets.js';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { createElement, useEffect, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { route as routeFn } from 'ziggy-js';
import { PermissionsChangedToast } from './components/permissions-changed-toast';
import { AppearanceProvider, useResolvedAppearance } from './hooks/use-appearance';
import { useLocale, useSyncI18nLanguage } from './hooks/use-locale';
// import { LocaleProvider } from './hooks/use-locale';

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
    useSyncI18nLanguage();
    const { locale } = useLocale();

    // The app's light/dark appearance toggle drives the UI5 theme; the legacy
    // --fiori-* tokens in app.css are mapped onto the theme's --sap* variables.
    useEffect(() => {
        setUi5Theme(resolved === 'dark' ? 'sap_horizon_dark' : 'sap_horizon');
    }, [resolved]);

    // UI5's built-in texts (MessageBox buttons, "No data", date pickers) follow
    // their own language config, separate from i18next.
    useEffect(() => {
        if (typeof locale === 'string' && locale) {
            setUi5Language(locale);
        }
    }, [locale]);

    return (
        <Ui5ThemeProvider>
            <PermissionsChangedToast />
            {children}
        </Ui5ThemeProvider>
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
