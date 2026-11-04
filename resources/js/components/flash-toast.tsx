import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import { MessageStrip } from '@ui5/webcomponents-react';
import { useEffect, useState, type CSSProperties } from 'react';

type FlashSeverity = 'success' | 'error' | 'warning';

const DESIGN: Record<FlashSeverity, 'Positive' | 'Negative' | 'Critical'> = {
    success: 'Positive',
    error: 'Negative',
    warning: 'Critical',
};

/** Top-right floating position shared by the app's toast-like strips. */
export const FLOATING_STRIP_STYLE: CSSProperties = {
    position: 'fixed',
    top: '1rem',
    right: '1rem',
    zIndex: 1400,
    width: 'min(28rem, calc(100vw - 2rem))',
    boxShadow: 'var(--sapContent_Shadow2)',
};

/**
 * Inertia flash message (`success` / `error` / `warning` shared props) as a
 * floating UI5 MessageStrip. A UI5 `Toast` has no semantic colour and the
 * Fiori guideline reserves it for short success notes, so error/warning
 * flashes (which need to stay readable) use a dismissible MessageStrip
 * that auto-hides (6s success, 10s otherwise) — same timings as before.
 */
export function FlashToast() {
    const { success, error, warning } = usePage<SharedData>().props;
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [severity, setSeverity] = useState<FlashSeverity>('success');

    // success/error/warning are mutually exclusive per redirect (a controller
    // flashes exactly one, never more than one) — checked error, then
    // warning, then success, so a stray leftover from an earlier visit can't
    // mask a fresher, more important flash if more than one were somehow
    // present at once.
    useEffect(() => {
        if (error) {
            setMessage(error);
            setSeverity('error');
            setOpen(true);
        } else if (warning) {
            setMessage(warning);
            setSeverity('warning');
            setOpen(true);
        } else if (success) {
            setMessage(success);
            setSeverity('success');
            setOpen(true);
        }
    }, [success, error, warning]);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => setOpen(false), severity === 'success' ? 6000 : 10000);
        return () => clearTimeout(timer);
    }, [open, severity, message]);

    if (!open) return null;

    return (
        <MessageStrip design={DESIGN[severity]} onClose={() => setOpen(false)} style={FLOATING_STRIP_STYLE}>
            {message}
        </MessageStrip>
    );
}
