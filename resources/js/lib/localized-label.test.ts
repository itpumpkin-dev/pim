import { describe, expect, test } from 'vitest';
import { localizedLabel } from './localized-label';

describe('localizedLabel', () => {
    test('returns the translation label matching the requested locale', () => {
        const entity = {
            name: 'Fallback Name',
            translations: [
                { locale_id: 1, label: 'English Label' },
                { locale_id: 2, label: 'Thai Label' },
            ],
        };

        expect(localizedLabel(entity, 2)).toBe('Thai Label');
        expect(localizedLabel(entity, 1)).toBe('English Label');
    });

    test('falls back to name when no translation matches the requested locale', () => {
        const entity = { name: 'Fallback Name', translations: [{ locale_id: 1, label: 'English Label' }] };

        expect(localizedLabel(entity, 99)).toBe('Fallback Name');
    });

    test('falls back to code when there is no name and no matching translation', () => {
        const entity = { code: 'SKU-1', translations: [] };

        expect(localizedLabel(entity, 1)).toBe('SKU-1');
    });

    test('falls back to name over code when both are present and no translation matches', () => {
        const entity = { name: 'Display Name', code: 'raw_code' };

        expect(localizedLabel(entity, 1)).toBe('Display Name');
    });

    test('returns an empty string when nothing at all is available', () => {
        expect(localizedLabel({}, 1)).toBe('');
    });

    test('treats an empty-string translation label as falsy and falls through to name', () => {
        const entity = { name: 'Fallback Name', translations: [{ locale_id: 1, label: '' }] };

        // `.label || entity.name` — an empty (but present) matched translation
        // must not win over the name fallback, since '' is falsy.
        expect(localizedLabel(entity, 1)).toBe('Fallback Name');
    });

    test('when translations is undefined, falls straight through to name', () => {
        expect(localizedLabel({ name: 'Fallback Name' }, 1)).toBe('Fallback Name');
    });

    test('when translations is an empty array, falls straight through to name', () => {
        expect(localizedLabel({ name: 'Fallback Name', translations: [] }, 1)).toBe('Fallback Name');
    });
});
