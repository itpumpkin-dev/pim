import { router } from '@inertiajs/react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { KeyboardEvent, useState } from 'react';
import LocaleLabelFields from '@/components/catalog/locale-label-fields';

const slugify = (value: string) => value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

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
    onClose,
    onCreated,
}: {
    open: boolean;
    attributeId: number;
    attributeLabel: string;
    swatchType?: string | null;
    onClose: () => void;
    onCreated: (code: string) => void;
}) {
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
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle>Add option — {attributeLabel}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        label="Code"
                        size="small"
                        value={code}
                        onChange={(e) => setCode(slugify(e.target.value))}
                        onKeyDown={submitOnEnter}
                        autoFocus
                        fullWidth
                    />
                    <LocaleLabelFields title="Label" values={translations} onChange={(localeId, value) => setTranslations((prev) => ({ ...prev, [localeId]: value }))} />
                    {swatchType === 'color' && (
                        <TextField
                            label="Color (hex)"
                            size="small"
                            value={swatchText}
                            onChange={(e) => setSwatchText(e.target.value)}
                            onKeyDown={submitOnEnter}
                            fullWidth
                        />
                    )}
                    {swatchType === 'image' && (
                        <TextField
                            type="file"
                            size="small"
                            fullWidth
                            onChange={(e) => setSwatchImage((e.target as HTMLInputElement).files?.[0] ?? null)}
                            slotProps={{ htmlInput: { accept: 'image/*' } }}
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
