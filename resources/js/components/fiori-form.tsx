import { FIORI, fioriCardSx } from '@/lib/fiori-style';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Box, Paper, Typography, type SxProps, type Theme } from '@mui/material';
import { type ReactNode } from 'react';

/**
 * SAP Fiori "Form" + "Form Field Validation" primitives.
 * ref: sap.com/design-system/fiori-design-web → UI elements → Form / Form Field Validation
 *
 *  - <FioriFormGroup>   = Form container (titled section, header rule, compact row rhythm)
 *  - <FioriField>       = label / control / value-state message row
 *                         (label left on md+, stacked on xs; required "*" AFTER the label per SAPUI5)
 *  - fioriFieldStateSx  = full Fiori (Horizon) field look for a MUI TextField/Select:
 *                         compact 2rem height, 0.375rem corners, darker border, brand hover/focus,
 *                         plus the 2px border + tint for a non-None value state
 *  - valueStateOf       = map an Inertia error string → value state
 *  - <FioriFormErrorSummary> = message strip shown on submit when fields need fixing
 */

export type FioriValueState = 'none' | 'error' | 'warning' | 'success' | 'information';

// Fiori Horizon: Error & Warning draw a 2px (0.125rem) border, Success & Information 1px.
const STATE_COLOR: Record<Exclude<FioriValueState, 'none'>, { fg: string; bg: string; borderWidth: string }> = {
    error: { fg: FIORI.error, bg: FIORI.errorBg, borderWidth: '2px' },
    warning: { fg: FIORI.warning, bg: FIORI.warningBg, borderWidth: '2px' },
    success: { fg: FIORI.success, bg: FIORI.successBg, borderWidth: '1px' },
    information: { fg: FIORI.information, bg: FIORI.neutralBg, borderWidth: '1px' },
};

export function valueStateOf(error?: string | null): FioriValueState {
    return error ? 'error' : 'none';
}

/**
 * Base Fiori (Horizon) input styling shared by every field: compact density
 * (2rem / 32px control height), 0.375rem corner radius, a darker-than-divider
 * border, and brand-coloured hover/focus — mirrors `--sapField_*` tokens.
 */
const fioriInputBaseSx = {
    '& .MuiOutlinedInput-root': {
        bgcolor: FIORI.surface,
        borderRadius: '0.375rem',
        fontSize: '0.875rem',
        '& fieldset': { borderColor: FIORI.borderStrong, transition: 'border-color 0.1s ease' },
        '&:hover fieldset': { borderColor: FIORI.brand },
        '&.Mui-focused fieldset': { borderColor: FIORI.brand, borderWidth: '1px' },
        '&.Mui-disabled': { bgcolor: FIORI.headerBg },
        '&.Mui-disabled fieldset': { borderColor: FIORI.border },
    },
    // compact single-line height ≈ 2rem — via padding only, no explicit height
    // (an explicit height + border-box clips the text and the value looks blank)
    '& .MuiOutlinedInput-input': {
        paddingTop: '6px',
        paddingBottom: '6px',
        paddingLeft: '8px',
        lineHeight: '1.4375em',
        '&::placeholder': { color: FIORI.textSecondary, opacity: 1 },
    },
    '& .MuiSelect-select.MuiOutlinedInput-input': { paddingTop: '6px', paddingBottom: '6px', paddingLeft: '8px' },
    // multiline: MUI keeps the padding on the root, the textarea is flush already
    '& .MuiOutlinedInput-root.MuiInputBase-multiline': { paddingTop: '6px', paddingBottom: '6px' },
} as const;

/**
 * `sx` for a MUI outlined `TextField` / `Select` / `FormControl` giving it the
 * full Fiori Horizon field look plus the border/tint for its value state.
 * Spread onto the component's `sx`.
 */
export function fioriFieldStateSx(state: FioriValueState): SxProps<Theme> {
    if (state === 'none') {
        return fioriInputBaseSx;
    }

    const { fg, bg, borderWidth } = STATE_COLOR[state];

    return {
        ...fioriInputBaseSx,
        '& .MuiOutlinedInput-root': {
            ...fioriInputBaseSx['& .MuiOutlinedInput-root'],
            bgcolor: bg,
            '& fieldset': { borderColor: fg, borderWidth },
            '&:hover fieldset': { borderColor: fg, borderWidth },
            '&.Mui-focused fieldset': { borderColor: fg, borderWidth },
        },
    };
}

/**
 * `sx` for a MUI multi-select `Autocomplete` styled as a SAP Fiori
 * "MultiInput": squared-off tokens (not pills) with a thin border sitting
 * inside a compact Fiori field, plus the value-state border/tint on error.
 * ref: sap.com/design-system/fiori-design-web → UI elements → MultiInput
 */
export function fioriMultiInputSx(state: FioriValueState): SxProps<Theme> {
    const base = {
        '& .MuiAutocomplete-inputRoot': {
            bgcolor: FIORI.surface,
            borderRadius: '0.375rem',
            padding: '3px 8px',
            gap: '4px',
            '& fieldset': { borderColor: FIORI.borderStrong, transition: 'border-color 0.1s ease' },
            '&:hover fieldset': { borderColor: FIORI.brand },
            '&.Mui-focused fieldset': { borderColor: FIORI.brand, borderWidth: '1px' },
        },
        '& .MuiAutocomplete-input': { minWidth: 60, fontSize: '0.875rem', padding: '4px 0' },
        // Fiori token: rectangular, subtle fill, 1px border — never a pill
        '& .MuiAutocomplete-tag': {
            margin: 0,
            height: 22,
            borderRadius: '0.25rem',
            backgroundColor: FIORI.brandBg,
            border: `1px solid ${FIORI.borderStrong}`,
            color: FIORI.textPrimary,
            fontSize: '0.8125rem',
            '& .MuiChip-deleteIcon': { color: FIORI.textSecondary, fontSize: 16, '&:hover': { color: FIORI.error } },
        },
    } as const;

    if (state === 'none') {
        return base;
    }

    const { fg, bg, borderWidth } = STATE_COLOR[state];

    return {
        ...base,
        '& .MuiAutocomplete-inputRoot': {
            ...base['& .MuiAutocomplete-inputRoot'],
            bgcolor: bg,
            '& fieldset': { borderColor: fg, borderWidth },
            '&:hover fieldset': { borderColor: fg, borderWidth },
            '&.Mui-focused fieldset': { borderColor: fg, borderWidth },
        },
    };
}

/**
 * `sx` for a single-select MUI `Autocomplete` styled as a SAP Fiori Horizon
 * **ComboBox** web component: compact 2rem field, 0.375rem corners, darker
 * border with brand hover/focus, a chevron popup button and a subtle clear
 * button, plus the value-state border/tint. Pair with
 * `popupIcon={<KeyboardArrowDownIcon />}` and
 * `slotProps={{ paper: { sx: fioriComboBoxPaperSx } }}`.
 * ref: sap.com/design-system/fiori-design-web → UI elements → ComboBox
 */
export function fioriComboBoxSx(state: FioriValueState): SxProps<Theme> {
    const border = state === 'none' ? FIORI.borderStrong : STATE_COLOR[state].fg;
    const borderWidth = state === 'none' ? '1px' : STATE_COLOR[state].borderWidth;
    const bg = state === 'none' ? FIORI.surface : STATE_COLOR[state].bg;

    return {
        // Match the exact rendered height of a fiori Text/Select field (2rem):
        // same 6px top/bottom input padding + 0.875rem/1.4375 line-height, with
        // no extra vertical padding on the flex row. Nested one level deeper
        // than MUI's own `.MuiAutocomplete-inputRoot .MuiAutocomplete-input`
        // rule so this wins on specificity.
        '& .MuiOutlinedInput-root.MuiAutocomplete-inputRoot': {
            bgcolor: bg,
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            minHeight: '2rem',
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            '& .MuiAutocomplete-input': {
                padding: '6px 4px 6px 8px',
                lineHeight: '1.4375em',
                '&::placeholder': { color: FIORI.textSecondary, opacity: 1 },
            },
            '& fieldset': { borderColor: border, borderWidth, transition: 'border-color 0.1s ease' },
            '&:hover fieldset': { borderColor: state === 'none' ? FIORI.brand : border, borderWidth },
            '&.Mui-focused fieldset': { borderColor: state === 'none' ? FIORI.brand : border, borderWidth },
            '&.Mui-disabled': { bgcolor: FIORI.headerBg },
            '&.Mui-disabled fieldset': { borderColor: FIORI.border },
        },
        '& .MuiAutocomplete-endAdornment': { right: 6 },
        '& .MuiAutocomplete-popupIndicator, & .MuiAutocomplete-clearIndicator': {
            color: FIORI.textSecondary,
            '&:hover': { backgroundColor: 'transparent', color: FIORI.brand },
            '& svg': { fontSize: 18 },
        },
    };
}

/** `sx` for the ComboBox dropdown surface — a Fiori popover list. */
export const fioriComboBoxPaperSx: SxProps<Theme> = {
    mt: '2px',
    borderRadius: '0.375rem',
    border: `1px solid ${FIORI.borderStrong}`,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    '& .MuiAutocomplete-listbox': { padding: 0 },
    '& .MuiAutocomplete-option': {
        fontSize: '0.875rem',
        minHeight: 32,
        color: FIORI.textPrimary,
        '&.Mui-focused': { backgroundColor: FIORI.hover },
        '&[aria-selected="true"]': { backgroundColor: FIORI.selected },
        '&[aria-selected="true"].Mui-focused': { backgroundColor: FIORI.selected },
    },
};

interface FioriFormGroupProps {
    title?: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    sx?: SxProps<Theme>;
}

export function FioriFormGroup({ title, description, actions, children, sx }: FioriFormGroupProps) {
    return (
        <Paper elevation={0} sx={[fioriCardSx, sx] as SxProps<Theme>}>
            {(title || description || actions) && (
                <Box
                    sx={{
                        px: 3,
                        py: 1.75,
                        borderBottom: `1px solid ${FIORI.border}`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 2,
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        {title && (
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: FIORI.textPrimary, lineHeight: 1.4 }}>
                                {title}
                            </Typography>
                        )}
                        {description && (
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                                {description}
                            </Typography>
                        )}
                    </Box>
                    {actions && <Box sx={{ flexShrink: 0 }}>{actions}</Box>}
                </Box>
            )}
            <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', rowGap: 1.75 }}>{children}</Box>
        </Paper>
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
    /** width of the label column on md+ (px) */
    labelWidth?: number;
    /** max width of the control column (px) — ignored when `fullWidth` is set */
    fieldMaxWidth?: number;
    /** let the control fill the whole field column (for tree pickers, long textareas, galleries) */
    fullWidth?: boolean;
    children: ReactNode;
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
}: FioriFieldProps) {
    const stateFg = valueState === 'none' ? FIORI.textSecondary : STATE_COLOR[valueState].fg;

    return (
        <Box
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: `${labelWidth}px minmax(0, 1fr)` },
                columnGap: 3,
                rowGap: 0.5,
                alignItems: 'start',
            }}
        >
            <Box
                component="label"
                htmlFor={htmlFor}
                sx={{
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    color: FIORI.textPrimary,
                    lineHeight: 1.4,
                    pt: { md: '7px' },
                    textAlign: { md: 'right' },
                    mb: { xs: 0.5, md: 0 },
                }}
            >
                {label}
                {required && (
                    <Box component="span" aria-hidden sx={{ color: FIORI.error, ml: 0.25 }}>
                        *
                    </Box>
                )}
            </Box>

            <Box sx={{ maxWidth: fullWidth ? '100%' : fieldMaxWidth, minWidth: 0 }}>
                {children}
                {(message || hint) && (
                    <Typography
                        variant="caption"
                        sx={{ display: 'block', mt: 0.5, color: message ? stateFg : FIORI.textSecondary }}
                    >
                        {message ?? hint}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

interface FioriFormErrorSummaryProps {
    /** the Inertia `errors` object; the strip only renders when it has keys */
    errors: Record<string, string | undefined>;
    message: ReactNode;
    sx?: SxProps<Theme>;
}

/** Fiori message strip — shown at the top/bottom of a form after a failed submit. */
export function FioriFormErrorSummary({ errors, message, sx }: FioriFormErrorSummaryProps) {
    const count = Object.keys(errors).filter((k) => errors[k]).length;
    if (count === 0) return null;

    return (
        <Box
            role="alert"
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1.25,
                borderRadius: '8px',
                bgcolor: FIORI.errorBg,
                border: `1px solid ${FIORI.error}`,
                color: FIORI.textPrimary,
                ...sx,
            }}
        >
            <ErrorOutlineIcon sx={{ fontSize: 18, color: FIORI.error, flexShrink: 0 }} />
            <Typography variant="body2">{message}</Typography>
        </Box>
    );
}
