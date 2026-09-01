/** Shared display-formatting helpers for admin list/table columns. */

/** "1 ม.ค. 2569" style — locale-aware, from a plain "YYYY-MM-DD" string. */
export function formatDate(value: string): string {
    return new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * "start – end" for a validity period where either end may be open —
 * returns null when neither is set, so callers can fall back to an em dash.
 */
export function formatDateRange(start: string | null, end: string | null): string | null {
    if (!start && !end) return null;
    if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
    if (start) return `${formatDate(start)} –`;
    return `– ${formatDate(end as string)}`;
}
