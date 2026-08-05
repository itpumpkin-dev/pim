import { router } from '@inertiajs/react';
import {
    Button,
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

const slugify = (value: string) => value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

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
 * single-option entry point into it. Collects a label per active locale
 * (same `translations` shape the attribute/group/family label forms use),
 * not just one flat label.
 */
export function QuickAddOptionDialog({
    open,
    attributeId,
    attributeLabel,
    swatchType,
    existingOptions = [],
    onClose,
    onCreated,
}: {
    open: boolean;
    attributeId: number;
    attributeLabel: string;
    swatchType?: string | null;
    existingOptions?: ExistingOption[];
    onClose: () => void;
    onCreated: (code: string) => void;
}) {
    const { locales } = useLocale();
    const [code, setCode] = useState('');
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [swatchText, setSwatchText] = useState('');
    const [swatchImage, setSwatchImage] = useState<File | null>(null);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setCode('');
        setTranslations({});
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
        if (!code.trim()) {
            setError('Code is required.');
            return;
        }

        setProcessing(true);
        setError(null);

        router.post(
            `/catalog/attributes/${attributeId}/options`,
            {
                code,
                translations,
                swatch_value: swatchType === 'color' ? swatchText : undefined,
                swatch_image: swatchImage ?? undefined,
            },
            {
                preserveScroll: true,
                preserveState: true,
                forceFormData: true,
                onSuccess: () => {
                    onCreated(code);
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
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
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
                        label="Code"
                        size="small"
                        value={code}
                        onChange={(e) => setCode(slugify(e.target.value))}
                        onKeyDown={submitOnEnter}
                        autoFocus
                        sx={{ width: 160 }}
                    />
                    {locales.map((locale) => (
                        <TextField
                            key={locale.id}
                            label={locale.display_name ?? locale.code}
                            size="small"
                            value={translations[String(locale.id)] ?? ''}
                            onChange={(e) => setTranslations((prev) => ({ ...prev, [String(locale.id)]: e.target.value }))}
                            onKeyDown={submitOnEnter}
                            sx={{ minWidth: 160, flex: 1 }}
                        />
                    ))}
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
                <Button variant="contained" onClick={submit} disabled={processing}>
                    Add
                </Button>
            </DialogActions>
        </Dialog>
    );
}
