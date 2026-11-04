import { Label, MessageStrip, Title, type MessageStripDomRef } from '@ui5/webcomponents-react';
import { forwardRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import styles from './fiori-form.module.css';

/**
 * SAP Fiori "Form" + "Form Field Validation" primitives, built on UI5 Web
 * Components (`Label`, `Title`, `MessageStrip`).
 * ref: sap.com/design-system/fiori-design-web → UI elements → Form / Form Field Validation
 *
 *  - <FioriFormGroup>   = Form container (titled section, header rule, compact row rhythm)
 *  - <FioriField>       = label / control / value-state message row
 *                         (label left on ≥900px, stacked above on narrow; required "*" AFTER the label per SAPUI5)
 *  - valueStateOf       = map an Inertia error string → FioriValueState
 *  - ui5ValueState      = FioriValueState → UI5 `valueState` literal for Input/Select/ComboBox/…
 *  - <FioriMessageStrip>    = UI5 Message Strip — inline, dismissible banner for
 *                         information/success/warning/error, reused anywhere a
 *                         page needs to talk to the user in-context
 *  - <FioriFormErrorSummary> = the error-severity Message Strip shown on submit when
 *                         fields need fixing
 */

export type FioriValueState = 'none' | 'error' | 'warning' | 'success' | 'information';

export type Ui5ValueState = 'None' | 'Negative' | 'Critical' | 'Positive' | 'Information';

const UI5_VALUE_STATE: Record<FioriValueState, Ui5ValueState> = {
    none: 'None',
    error: 'Negative',
    warning: 'Critical',
    success: 'Positive',
    information: 'Information',
};

export function valueStateOf(error?: string | null): FioriValueState {
    return error ? 'error' : 'none';
}

/** FioriValueState → the `valueState` literal UI5 inputs expect. */
export function ui5ValueState(state: FioriValueState): Ui5ValueState {
    return UI5_VALUE_STATE[state];
}

const MESSAGE_CLASS: Record<FioriValueState, string | undefined> = {
    none: undefined,
    error: styles.messageError,
    warning: styles.messageWarning,
    success: styles.messageSuccess,
    information: styles.messageInformation,
};

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

interface FioriFormGroupProps {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    style?: CSSProperties;
    className?: string;
}

export function FioriFormGroup({ title, description, actions, children, style, className }: FioriFormGroupProps) {
    return (
        <section className={cx(styles.group, className)} style={style}>
            {(title || description || actions) && (
                <div className={styles.groupHeader}>
                    <div className={styles.groupHeaderText}>
                        {title && (
                            <Title level="H5" size="H5" wrappingType="Normal">
                                {title}
                            </Title>
                        )}
                        {description && <span className={styles.groupDescription}>{description}</span>}
                    </div>
                    {actions && <div className={styles.groupActions}>{actions}</div>}
                </div>
            )}
            <div className={styles.groupBody}>{children}</div>
        </section>
    );
}

interface FioriFieldProps {
    label: ReactNode;
    /** id of the control this label points at (set the same id on the input) */
    htmlFor?: string;
    required?: boolean;
    valueState?: FioriValueState;
    /** value-state message shown below the control in the state colour */
    message?: ReactNode;
    /** neutral hint shown below the control when there is no message */
    hint?: ReactNode;
    /** width of the label column on wide screens (px) */
    labelWidth?: number;
    /** max width of the control column (px) — ignored when `fullWidth` is set */
    fieldMaxWidth?: number;
    /** let the control fill the whole field column (for tree pickers, long textareas, galleries) */
    fullWidth?: boolean;
    children: ReactNode;
    style?: CSSProperties;
    className?: string;
}

export function FioriField({
    label,
    htmlFor,
    required = false,
    valueState = 'none',
    message,
    hint,
    labelWidth = 200,
    fieldMaxWidth = 400,
    fullWidth = false,
    children,
    style,
    className,
}: FioriFieldProps) {
    const vars = {
        '--fiori-label-width': `${labelWidth}px`,
        '--fiori-field-max-width': `${fieldMaxWidth}px`,
    } as CSSProperties;

    return (
        <div className={cx(styles.field, className)} style={{ ...vars, ...style }}>
            <Label for={htmlFor} required={required} showColon={false} wrappingType="Normal" className={styles.label}>
                {label}
            </Label>

            <div className={cx(styles.control, fullWidth && styles.controlFull)}>
                {children}
                {(message || hint) && <span className={cx(styles.message, message ? MESSAGE_CLASS[valueState] : undefined)}>{message ?? hint}</span>}
            </div>
        </div>
    );
}

export type FioriMessageStripSeverity = 'information' | 'success' | 'warning' | 'error';

const MESSAGE_STRIP_DESIGN: Record<FioriMessageStripSeverity, 'Information' | 'Positive' | 'Critical' | 'Negative'> = {
    information: 'Information',
    success: 'Positive',
    warning: 'Critical',
    error: 'Negative',
};

interface FioriMessageStripProps {
    severity?: FioriMessageStripSeverity;
    /** shown as a trailing "×" button; omit for a non-dismissible strip */
    onClose?: () => void;
    /** override the default per-severity icon (pass a UI5 `<Icon name="..." />`), or `false` to hide it */
    icon?: ReactElement | false;
    children: ReactNode;
    style?: CSSProperties;
    className?: string;
}

/**
 * SAP Fiori "Message Strip" (UI5 `MessageStrip`) — a compact, inline banner
 * for talking to the user in-context (validation feedback, a background
 * job's result, a status check inside a dialog) rather than a full-page
 * toast. `severity` keeps the old MUI-Alert-like spelling ("information"
 * matches FioriValueState) and maps onto the UI5 `design`.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Message Strip
 */
// forwardRef kept so the strip can still be the direct child of something that
// needs the DOM node (it used to sit inside a MUI <Snackbar> transition).
export const FioriMessageStrip = forwardRef<MessageStripDomRef, FioriMessageStripProps>(function FioriMessageStrip(
    { severity = 'information', onClose, icon, children, style, className },
    ref,
) {
    return (
        <MessageStrip
            ref={ref}
            design={MESSAGE_STRIP_DESIGN[severity]}
            hideCloseButton={!onClose}
            hideIcon={icon === false}
            icon={icon || undefined}
            onClose={onClose ? () => onClose() : undefined}
            className={className}
            style={style}
        >
            {children}
        </MessageStrip>
    );
});

interface FioriFormErrorSummaryProps {
    /** the Inertia `errors` object; the strip only renders when it has keys */
    errors: Record<string, string | undefined>;
    message: ReactNode;
    style?: CSSProperties;
    className?: string;
}

/** The error-severity Message Strip shown at the top/bottom of a form after a failed submit. */
export function FioriFormErrorSummary({ errors, message, style, className }: FioriFormErrorSummaryProps) {
    const count = Object.keys(errors).filter((k) => errors[k]).length;
    if (count === 0) return null;

    return (
        <FioriMessageStrip severity="error" style={style} className={className}>
            {message}
        </FioriMessageStrip>
    );
}
