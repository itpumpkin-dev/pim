/**
 * Bracket-notation query string encoder (`filters[created_at][from]=...`) —
 * PHP parses this natively into nested arrays. Needed for links that must be
 * a plain browser navigation (e.g. a file-download endpoint returning a
 * BinaryFileResponse) rather than an Inertia `router.get()` visit, which
 * would otherwise handle nested params for us.
 */
export function encodeQueryParams(params: Record<string, unknown>, prefix = ''): string[] {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        const paramKey = prefix ? `${prefix}[${key}]` : key;
        if (typeof value === 'object' && !Array.isArray(value)) {
            parts.push(...encodeQueryParams(value as Record<string, unknown>, paramKey));
        } else {
            parts.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`);
        }
    }
    return parts;
}
