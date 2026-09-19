import { describe, expect, it } from 'vitest';
import i18n from './i18n';

describe('i18n', () => {
    it('initializes the shared i18next singleton, defaulting to English', () => {
        expect(i18n.isInitialized).toBe(true);
        expect(i18n.language).toBe('en');
        expect(i18n.options.fallbackLng).toEqual(['en']);
        expect(i18n.options.defaultNS).toBe('common');
    });

    it('loads every locales/<lng>/<ns>.json file into a matching resource bundle', () => {
        const thCommon = i18n.getResourceBundle('th', 'common');
        expect(thCommon).toBeTruthy();
        expect(thCommon.search).toBe('ค้นหา');

        const enCommon = i18n.getResourceBundle('en', 'common');
        expect(enCommon).toBeTruthy();
    });

    it('keeps isInitialized guard idempotent — importing the module again reuses the same instance', async () => {
        const again = await import('./i18n');
        expect(again.default).toBe(i18n);
        expect(again.default.isInitialized).toBe(true);
    });
});
