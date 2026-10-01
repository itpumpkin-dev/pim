import { describe, expect, test } from 'vitest';
import { codeHintKey, normalizeCodeInput } from './code-field';

describe('codeHintKey', () => {
    test('a locked system code wins over the permission', () => {
        expect(codeHintKey({ canEditCode: true, codeLocked: true })).toBe('codeSystemLockedHelperText');
    });

    test('editable vs. missing permission', () => {
        expect(codeHintKey({ canEditCode: true })).toBe('codeEditableHelperText');
        expect(codeHintKey({})).toBe('codeNoPermissionHelperText');
    });
});

describe('normalizeCodeInput', () => {
    test('turns whitespace into underscores and drops characters the server rejects', () => {
        expect(normalizeCodeInput('My Code 01')).toBe('My_Code_01');
        expect(normalizeCodeInput('a-b_c!@#ก')).toBe('a-b_c');
    });
});
