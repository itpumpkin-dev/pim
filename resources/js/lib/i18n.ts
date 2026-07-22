import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const modules = import.meta.glob('../locales/*/*.json', { eager: true }) as Record<string, { default: Record<string, string> }>;

const resources: Record<string, Record<string, Record<string, string>>> = {};

for (const path in modules) {
    const match = path.match(/\.\.\/locales\/([^/]+)\/([^/]+)\.json$/);
    if (!match) {
        continue;
    }

    const [, lng, ns] = match;
    resources[lng] ??= {};
    resources[lng][ns] = modules[path].default;
}

// Guard against re-initializing the shared i18next singleton: in dev, this
// module has no HMR boundary of its own (it exports no React component, so
// Fast Refresh can't hot-swap it in place) — an edit anywhere in its import
// chain re-executes this file, and calling init() again mid-flight on an
// already-initializing instance corrupts its internal language-resolution
// state (surfaces as "codes.forEach is not a function" from changeLanguage).
if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
        resources,
        lng: 'th',
        fallbackLng: 'en',
        defaultNS: 'common',
        interpolation: { escapeValue: false },
    });
}

export default i18n;
