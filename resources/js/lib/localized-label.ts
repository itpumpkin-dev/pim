/** One locale's label for a translatable entity (attribute/group/family/category). */
export interface Translation {
    locale_id: number;
    label: string;
}

/**
 * Resolves a translatable entity's label for `localeId` from its preloaded
 * `translations`, falling back to whatever single label it also always
 * carries (`name`/`code`) — used so the frontend can switch a displayed
 * label to another locale instantly, without waiting on a server round-trip
 * to re-resolve it.
 */
export function localizedLabel(entity: { name?: string; code?: string; translations?: Translation[] }, localeId: number): string {
    return entity.translations?.find((t) => t.locale_id === localeId)?.label || entity.name || entity.code || '';
}
