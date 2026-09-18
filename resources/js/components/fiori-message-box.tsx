import { FIORI, fioriEmphasizedSx, fioriGhostSx, fioriNegativeSx } from '@/lib/fiori-style';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { useCallback, useRef, useState, type ReactNode } from 'react';

/**
 * SAP Fiori "Message Box" — a modal, blocking dialog for a single message
 * that needs the user's explicit acknowledgement (confirm/cancel an action,
 * or dismiss an information/success/error notice) — unlike
 * <FioriMessageStrip> (fiori-form.tsx), which is inline and non-blocking.
 * Reuses the same semantic colour set as every other Fiori primitive in this
 * app (FIORI.warning/error/success/information).
 *
 * Meant as a drop-in replacement for the browser's native `window.confirm()`/
 * `window.alert()`, which render as an unstyled, untrusted-looking
 * "<host> says" box the user can't theme, translate, or brand — use
 * `useFioriConfirm()` below instead of calling this component directly for
 * the common "await confirm before doing something risky" case.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Message Box
 */
export type FioriMessageBoxSeverity = 'confirm' | 'information' | 'success' | 'warning' | 'error';

const MESSAGE_BOX_ICON: Record<FioriMessageBoxSeverity, typeof ErrorOutlineIcon> = {
    confirm: HelpOutlineIcon,
    information: InfoOutlinedIcon,
    success: CheckCircleOutlineIcon,
    warning: WarningAmberOutlinedIcon,
    error: ErrorOutlineIcon,
};

const MESSAGE_BOX_COLOR: Record<FioriMessageBoxSeverity, string> = {
    confirm: FIORI.brand,
    information: FIORI.information,
    success: FIORI.success,
    warning: FIORI.warning,
    error: FIORI.error,
};

export interface FioriMessageBoxProps {
    open: boolean;
    title: string;
    /** the message body — plain text or a few short lines (`\n` renders as a line break) */
    children: ReactNode;
    severity?: FioriMessageBoxSeverity;
    confirmLabel?: string;
    cancelLabel?: string;
    /** hide the Cancel button entirely — for a plain acknowledgement (information/success/error) instead of a yes/no confirm */
    hideCancel?: boolean;
    /** true = the confirm action is destructive (Fiori "Negative" red button) instead of the default "Emphasized" brand-blue one */
    destructive?: boolean;
    /** disables both buttons and shows a spinner on Confirm — for a confirm that kicks off a request itself */
    confirmLoading?: boolean;
    /** disables the Confirm button independent of `confirmLoading` — e.g. a required field in the message body hasn't been filled in yet */
    confirmDisabled?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function FioriMessageBox({
    open,
    title,
    children,
    severity = 'confirm',
    confirmLabel = 'OK',
    cancelLabel = 'Cancel',
    hideCancel = false,
    destructive = false,
    confirmLoading = false,
    confirmDisabled = false,
    onConfirm,
    onCancel,
}: FioriMessageBoxProps) {
    const Icon = MESSAGE_BOX_ICON[severity];
    const color = MESSAGE_BOX_COLOR[severity];

    return (
        <Dialog open={open} onClose={confirmLoading ? undefined : onCancel} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25, fontWeight: 700, fontSize: '1rem', color: FIORI.textPrimary }}>
                <Icon sx={{ fontSize: 24, color, flexShrink: 0 }} />
                {title}
            </DialogTitle>
            {/* `typography: 'body2'` applies the text style without wrapping children in
                an actual <p> (unlike <Typography>) — several call sites nest an extra
                <Typography> below the main message (e.g. a conditional "N products use
                this" warning line), which would be invalid HTML (<p> inside <p>) if this
                wrapped them in a real Typography element too. */}
            <DialogContent sx={{ pt: 0, typography: 'body2', color: FIORI.textPrimary, whiteSpace: 'pre-line' }}>{children}</DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
                {!hideCancel && (
                    <Button onClick={onCancel} disabled={confirmLoading} sx={fioriGhostSx}>
                        {cancelLabel}
                    </Button>
                )}
                <Button
                    onClick={onConfirm}
                    variant={destructive ? 'outlined' : 'contained'}
                    disabled={confirmLoading || confirmDisabled}
                    startIcon={confirmLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
                    sx={destructive ? fioriNegativeSx : fioriEmphasizedSx}
                >
                    {confirmLabel}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

interface FioriConfirmOptions {
    title: string;
    message: ReactNode;
    severity?: FioriMessageBoxSeverity;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

/**
 * Imperative, promise-based confirm — the `useFioriConfirm()` counterpart to
 * `window.confirm()`: `if (!(await confirm({...}))) return;` instead of
 * `if (!window.confirm('...')) return;`. Render `{confirmElement}` once
 * anywhere in the component's JSX tree (it renders nothing until `confirm()`
 * is called) and call `confirm(options)` from an event handler — the
 * returned promise resolves `true`/`false` when the user picks Confirm/
 * Cancel (or dismisses the dialog, which counts as Cancel).
 */
export function useFioriConfirm() {
    const [options, setOptions] = useState<FioriConfirmOptions | null>(null);
    const resolverRef = useRef<((result: boolean) => void) | null>(null);

    const confirm = useCallback((opts: FioriConfirmOptions) => {
        return new Promise<boolean>((resolve) => {
            resolverRef.current = resolve;
            setOptions(opts);
        });
    }, []);

    const settle = (result: boolean) => {
        resolverRef.current?.(result);
        resolverRef.current = null;
        setOptions(null);
    };

    const confirmElement = options ? (
        <FioriMessageBox
            open
            title={options.title}
            severity={options.severity ?? 'warning'}
            confirmLabel={options.confirmLabel}
            cancelLabel={options.cancelLabel}
            destructive={options.destructive}
            onConfirm={() => settle(true)}
            onCancel={() => settle(false)}
        >
            {options.message}
        </FioriMessageBox>
    ) : null;

    return { confirm, confirmElement };
}
