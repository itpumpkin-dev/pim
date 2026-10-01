/**
 * Shared bits for the "Code" field on admin edit pages. Renaming a code is
 * gated server-side by `{resource}.edit_code` (see app/Services/CodeRenameGuard.php);
 * pages receive `canEditCode` / `codeLocked` props from their controller and
 * use these helpers so every page explains the field the same way.
 */
export interface CodeEditState {
    canEditCode?: boolean;
    codeLocked?: boolean;
}

export type CodeHintKey = 'codeEditableHelperText' | 'codeNoPermissionHelperText' | 'codeSystemLockedHelperText';

/** catalog-namespace i18n key for the field's hint text. */
export function codeHintKey({ canEditCode = false, codeLocked = false }: CodeEditState): CodeHintKey {
    if (codeLocked) return 'codeSystemLockedHelperText';
    return canEditCode ? 'codeEditableHelperText' : 'codeNoPermissionHelperText';
}

/**
 * Keep typed input within CodeRenameGuard::PATTERN (letters, digits, _ and -):
 * whitespace becomes "_", anything else outside the set is dropped.
 */
export function normalizeCodeInput(value: string): string {
    return value.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
}
