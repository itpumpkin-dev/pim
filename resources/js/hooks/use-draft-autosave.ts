import { useCallback, useEffect, useRef } from 'react';

export interface StoredDraft<T> {
    data: T;
    savedAt: number;
}

/**
 * File/Blob fields (image/gallery/video attribute values, avatar uploads)
 * can't survive JSON.stringify — they'd silently become `{}`. Strip them to
 * `null` before persisting so the rest of the draft still saves cleanly;
 * the user just re-attaches those specific fields after restoring.
 */
function stripFiles(value: unknown): unknown {
    if (value instanceof File || value instanceof Blob) return null;
    if (Array.isArray(value)) return value.map(stripFiles);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, stripFiles(v)]));
    }
    return value;
}

/**
 * Auto-saves `data` to localStorage (debounced) so an in-progress form
 * survives a forced logout or an accidental tab close — in particular the
 * one usePermissionsWatcher warns about: EnsureFreshPermissions logs a user
 * out the instant their permissions change server-side, which happens on
 * their *next request* (including the very Save click that would otherwise
 * have persisted their work) — see that middleware's docblock.
 *
 * Also listens for the 'app:permissions-changed' window event
 * (usePermissionsWatcher dispatches it the moment it gets the real-time
 * notice, ahead of the auto-reload/logout it schedules a few seconds later)
 * and flushes immediately then, instead of waiting for the debounce — so
 * whatever the user last typed is captured before the reload kicks them out.
 *
 * Gated on `isDirty` throughout (both the debounced write and the
 * emergency flush) so a draft already sitting in storage from a previous
 * session is never silently overwritten by the pristine initial values
 * before the caller has had a chance to offer restoring it — see
 * readDraft()'s call site.
 */
export function useDraftAutosave<T>(key: string, data: T, isDirty: boolean, debounceMs = 1500) {
    const dataRef = useRef(data);
    dataRef.current = data;
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const timerRef = useRef<number | null>(null);

    const write = useCallback(() => {
        if (!isDirtyRef.current) return;
        try {
            const payload: StoredDraft<unknown> = { data: stripFiles(dataRef.current), savedAt: Date.now() };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch {
            // Quota exceeded / private-mode storage block — draft recovery is
            // best-effort, not something worth surfacing an error over.
        }
    }, [key]);

    useEffect(() => {
        if (!isDirty) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(write, debounceMs);
        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, isDirty, debounceMs, write]);

    useEffect(() => {
        window.addEventListener('app:permissions-changed', write);
        return () => window.removeEventListener('app:permissions-changed', write);
    }, [write]);

    const readDraft = useCallback((): StoredDraft<T> | null => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? (JSON.parse(raw) as StoredDraft<T>) : null;
        } catch {
            return null;
        }
    }, [key]);

    const clearDraft = useCallback(() => {
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
    }, [key]);

    return { readDraft, clearDraft };
}
