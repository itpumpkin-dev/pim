import '@ui5/webcomponents-icons/dist/message-error.js';
import '@ui5/webcomponents-icons/dist/message-information.js';
import '@ui5/webcomponents-icons/dist/message-success.js';
import '@ui5/webcomponents-icons/dist/message-warning.js';
import '@ui5/webcomponents-icons/dist/question-mark.js';
import { Bar, Button, Dialog, Icon, Title } from '@ui5/webcomponents-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';

/**
 * SAP Fiori "Message Box" — a modal, blocking dialog for a single message
 * that needs the user's explicit acknowledgement (confirm/cancel an action,
 * or dismiss an information/success/error notice) — unlike
 * <FioriMessageStrip> (fiori-form.tsx), which is inline and non-blocking.
 *
 * Built on the UI5 `Dialog` (with its `state` value-state header highlight,
 * the same look as UI5's own `MessageBox`) rather than the UI5 `MessageBox`
 * component, because MessageBox's action buttons can't carry a loading /
 * disabled state — needed for `confirmLoading` / `confirmDisabled`.
 *
 * Meant as a drop-in replacement for the browser's native `window.confirm()`/
 * `window.alert()` — use `useFioriConfirm()` below instead of calling this
 * component directly for the common "await confirm before doing something
 * risky" case.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Message Box
 */
export type FioriMessageBoxSeverity = 'confirm' | 'information' | 'success' | 'warning' | 'error';

const MESSAGE_BOX_META: Record<
    FioriMessageBoxSeverity,
    { icon: string; state: 'None' | 'Information' | 'Positive' | 'Critical' | 'Negative'; color: string }
> = {
    confirm: { icon: 'question-mark', state: 'None', color: 'var(--sapBrandColor)' },
    information: { icon: 'message-information', state: 'Information', color: 'var(--sapInformativeColor)' },
    success: { icon: 'message-success', state: 'Positive', color: 'var(--sapPositiveColor)' },
    warning: { icon: 'message-warning', state: 'Critical', color: 'var(--sapCriticalColor)' },
    error: { icon: 'message-error', state: 'Negative', color: 'var(--sapNegativeColor)' },
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
    /** true = the confirm action is destructive (Fiori "Negative" button) instead of the default "Emphasized" one */
    destructive?: boolean;
    /** disables both buttons and shows a busy state on Confirm — for a confirm that kicks off a request itself */
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
    const meta = MESSAGE_BOX_META[severity];

    return (
        <Dialog
            open={open}
            state={meta.state}
            accessibleRole="AlertDialog"
            style={{ width: 'min(28rem, calc(100vw - 2rem))' }}
            // Fully controlled: ESC never closes the dialog by itself — it is
            // reported as Cancel (ignored while confirmLoading) and the parent
            // decides by flipping `open`.
            onBeforeClose={(event) => {
                if (!event.detail.escPressed) return;
                event.preventDefault();
                if (!confirmLoading) onCancel();
            }}
            header={
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', width: '100%', padding: '0.5rem 0' }}>
                    <Icon name={meta.icon} style={{ width: '1.5rem', height: '1.5rem', color: meta.color, flexShrink: 0 }} />
                    <Title level="H5" size="H5" wrappingType="Normal">
                        {title}
                    </Title>
                </div>
            }
            footer={
                <Bar
                    design="Footer"
                    endContent={
                        <>
                            <Button
                                design={destructive ? 'Negative' : 'Emphasized'}
                                disabled={confirmLoading || confirmDisabled}
                                loading={confirmLoading}
                                loadingDelay={0}
                                onClick={onConfirm}
                            >
                                {confirmLabel}
                            </Button>
                            {!hideCancel && (
                                <Button design="Transparent" disabled={confirmLoading} onClick={onCancel}>
                                    {cancelLabel}
                                </Button>
                            )}
                        </>
                    }
                />
            }
        >
            {/* div (not <p>/Text) so call sites can nest their own blocks below the main message */}
            <div style={{ whiteSpace: 'pre-line', color: 'var(--sapTextColor)', fontSize: 'var(--sapFontSize)', lineHeight: 1.5 }}>{children}</div>
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
 * Cancel (or dismisses the dialog with ESC, which counts as Cancel).
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
