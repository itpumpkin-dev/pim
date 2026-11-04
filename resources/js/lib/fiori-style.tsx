/**
 * SAP Fiori building blocks shared by every admin page.
 *
 *  - Tokens (`FIORI`, `FIORI_RAW`, `percentToneFiori`) live in `fiori-tokens.ts`
 *    (pure, no UI library) and are re-exported here.
 *  - `FioriStatus` / `FioriBusyIndicator` / `FioriBusyOverlay` are thin
 *    wrappers over the official UI5 `ObjectStatus` / `BusyIndicator`.
 */

import { BusyIndicator, ObjectStatus } from '@ui5/webcomponents-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { FioriTone } from './fiori-tokens';

export { FIORI, FIORI_RAW, percentToneFiori, type FioriTone } from './fiori-tokens';

/** UI5 `ObjectStatus` state for each Fiori semantic tone. */
const TONE_STATE: Record<FioriTone, 'Positive' | 'Critical' | 'Negative' | 'None' | 'Information'> = {
    success: 'Positive',
    warning: 'Critical',
    error: 'Negative',
    neutral: 'None',
    information: 'Information',
};

/**
 * Fiori "ObjectStatus" — semantic coloured status text, used in place of
 * filled chips for status/completeness/live-state columns.
 */
export function FioriStatus({
    label,
    tone,
    title,
    showIcon = false,
    style,
    className,
}: {
    label: string;
    tone: FioriTone;
    title?: string;
    /** show UI5's default state icon in front of the text */
    showIcon?: boolean;
    style?: CSSProperties;
    className?: string;
}) {
    return (
        <ObjectStatus
            state={TONE_STATE[tone]}
            showDefaultIcon={showIcon}
            title={title}
            className={className}
            style={{ whiteSpace: 'nowrap', fontWeight: 600, ...style }}
        >
            {label}
        </ObjectStatus>
    );
}

/**
 * Delay-gates a boolean so it only flips true once `active` has stayed true
 * for `delayMs` — the mechanism behind Fiori's Busy Indicator rule "don't use
 * it for an operation under 1 second": a request that resolves before the
 * delay elapses never shows anything, so fast responses don't flash a
 * spinner. Used by `FioriBusyOverlay`; exported directly for callers that
 * need the delayed boolean without the overlay markup (e.g. to disable a
 * control instead of dimming it).
 */
export function useFioriBusy(active: boolean, delayMs = 700): boolean {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!active) {
            setShow(false);
            return;
        }

        const timer = setTimeout(() => setShow(true), delayMs);
        return () => clearTimeout(timer);
    }, [active, delayMs]);

    return show;
}

type BusySize = 'S' | 'M' | 'L';

/** legacy numeric px sizes (MUI CircularProgress) → UI5 BusyIndicator size */
function busySize(size: number | BusySize): BusySize {
    if (typeof size === 'string') return size;
    if (size <= 20) return 'S';
    if (size <= 40) return 'M';
    return 'L';
}

/** Fiori "Busy Indicator" — sized for a component/section, not a full page. */
export function FioriBusyIndicator({ size = 'M', style, className }: { size?: number | BusySize; style?: CSSProperties; className?: string }) {
    return <BusyIndicator active delay={0} size={busySize(size)} style={style} className={className} />;
}

/**
 * Fiori "Busy State" — dims one section/component while it's fetching,
 * instead of blocking the whole page. Per the Fiori guidance this wraps:
 * only for unspecified waits over ~1s (gated by `useFioriBusy`'s delay, so a
 * fast fetch never flashes it), only over the affected component (content
 * underneath stays visible, just dimmed + non-interactive), never a stand-in
 * for full-page/navigation loading (that's `RouteLoadingSkeleton`'s job).
 */
export function FioriBusyOverlay({
    busy,
    delayMs = 700,
    children,
    style,
    className,
}: {
    busy: boolean;
    delayMs?: number;
    children: ReactNode;
    style?: CSSProperties;
    className?: string;
}) {
    const show = useFioriBusy(busy, delayMs);

    return (
        <BusyIndicator active={show} delay={0} size="M" aria-busy={busy} className={className} style={{ display: 'block', width: '100%', ...style }}>
            {children}
        </BusyIndicator>
    );
}
