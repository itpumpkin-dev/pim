import { router, usePage } from '@inertiajs/react';
import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { KeyboardEvent, useState } from 'react';
import { useLocale } from '@/hooks/use-locale';
import { type SharedData } from '@/types';

export interface ExistingOption {
    id: number;
    code?: string;
    admin_label?: string;
}

/**
 * Lets a user add a new option to a select/multiselect attribute without
 * leaving the product form — opened from the attribute's field on the
 * product edit page. Posts to the same endpoint as the full options CRUD
 * panel on the attribute edit page (attribute-options-panel.tsx), so
 * permissions and validation stay identical; this is just a narrower,
 * single-option entry point into it.
 *
 * Only collects a label for the locale currently being edited on the
 * product page (not every locale at once) — other locales can still be
 * filled in later from the full options panel. `code` isn't collected at
 * all: the backend always generates it (see CodeGenerator), ignoring
 * anything a caller sends, so asking for one here was a dead field.
 */
export function QuickAddOptionDialog({
    open,
    attributeId,
    attributeLabel,
    activeLocaleCode,
    swatchType,
    existingOptions = [],
    onClose,
    onCreated,
}: {
    open: boolean;
    attributeId: number;
    attributeLabel: string;
    activeLocaleCode?: string;
    swatchType?: string | null;
    existingOptions?: ExistingOption[];
    onClose: () => void;
    onCreated: (code: string) => void;
}) {
    const { locales } = useLocale();
    const { props } = usePage<SharedData>();
    const activeLocale = locales.find((l) => l.code === activeLocaleCode) ?? locales[0];
    const [label, setLabel] = useState('');
    const [swatchText, setSwatchText] = useState('');
    const [swatchImage, setSwatchImage] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setLabel('');
        setSwatchText('');
        setSwatchImage(null);
        setError(null);
    };

    const handleClose = () => {
        if (processing) return;
        reset();
        onClose();
    };

    const submit = () => {
        if (!label.trim()) {
            setError('Label is required.');
            return;
        }

        setProcessing(true);
        setError(null);

        router.post(
            `/catalog/attributes/${attributeId}/options`,
            {
                translations: activeLocale ? { [String(activeLocale.id)]: label } : {},
                swatch_value: swatchType === 'color' ? swatchText : undefined,
                swatch_image: swatchImage ?? undefined,
            },
            {
                preserveScroll: true,
                preserveState: true,
                forceFormData: true,
                onSuccess: (page) => {
                    const newCode = (page.props as { created_option_code?: string | null }).created_option_code ?? props.created_option_code;
                    if (newCode) onCreated(newCode);
                    reset();
                    onClose();
                },
                onError: (errors) => {
                    setError((Object.values(errors)[0] as string) ?? 'Could not add option.');
                },
                onFinish: () => setProcessing(false),
            },
        );
    };

    const submitOnEnter = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add option — {attributeLabel}</DialogTitle>
            <DialogContent>
                {existingOptions.length > 0 && (
                    <>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1, mb: 1 }}>
                            Existing options ({existingOptions.length})
                        </Typography>
                        <TableContainer sx={{ maxHeight: 220, mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>Label</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {existingOptions.map((option) => (
                                        <TableRow key={option.id}>
                                            <TableCell>{option.code}</TableCell>
                                            <TableCell>{option.admin_label || '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                    New option
                </Typography>
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                    <TextField
                        label={`Label (${activeLocale?.display_name ?? activeLocale?.code ?? 'default'})`}
                        size="small"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        onKeyDown={submitOnEnter}
                        autoFocus
                        sx={{ minWidth: 220, flex: 1 }}
                    />
                    {swatchType === 'color' && (
                        <TextField
                            label="Color (hex)"
                            size="small"
                            value={swatchText}
                            onChange={(e) => setSwatchText(e.target.value)}
                            onKeyDown={submitOnEnter}
                            sx={{ width: 140 }}
                        />
                    )}
                    {swatchType === 'image' && (
                        <TextField
                            type="file"
                            size="small"
                            onChange={(e) => setSwatchImage((e.target as HTMLInputElement).files?.[0] ?? null)}
                            slotProps={{ htmlInput: { accept: 'image/*' } }}
                            sx={{ width: 220 }}
                        />
                    )}
                    {error && (
                        <Typography variant="caption" color="error">
                            {error}
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} disabled={processing}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={submit}
                    disabled={processing || !label.trim()}
                    startIcon={processing ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                    {processing ? 'Adding…' : 'Add'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
