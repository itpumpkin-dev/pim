import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import { router } from '@inertiajs/react';
import { FormEvent, useState } from 'react';

export interface AttributeOptionItem {
    id: number;
    code: string;
    admin_label: string | null;
    swatch_value: string | null;
    sort_order: number;
}

const slugify = (value: string) => value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

function SwatchPreview({ swatchType, value }: { swatchType: string; value: string | null }) {
    if (!value) return null;

    if (swatchType === 'color') {
        return <Box sx={{ width: 22, height: 22, borderRadius: 0.5, bgcolor: value, border: 1, borderColor: 'divider', flexShrink: 0 }} />;
    }

    if (swatchType === 'image') {
        return <Box component="img" src={value} sx={{ width: 24, height: 24, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0 }} />;
    }

    return null;
}

function OptionRow({ attributeId, swatchType, option }: { attributeId: number; swatchType: string; option: AttributeOptionItem }) {
    const [code, setCode] = useState(option.code);
    const [adminLabel, setAdminLabel] = useState(option.admin_label ?? '');
    const [swatchText, setSwatchText] = useState(swatchType === 'color' ? (option.swatch_value ?? '') : '');
    const [swatchImage, setSwatchImage] = useState<File | null>(null);

    const save = () => {
        router.post(
            `/catalog/attributes/${attributeId}/options/${option.id}`,
            {
                _method: 'put',
                code,
                admin_label: adminLabel,
                swatch_value: swatchType === 'color' ? swatchText : undefined,
                swatch_image: swatchImage ?? undefined,
            },
            { preserveScroll: true, forceFormData: true },
        );
    };

    const destroy = () => {
        router.delete(`/catalog/attributes/${attributeId}/options/${option.id}`, { preserveScroll: true });
    };

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <TextField size="small" label="Code" value={code} onChange={(e) => setCode(slugify(e.target.value))} sx={{ width: 140 }} />
            <TextField size="small" label="Label" value={adminLabel} onChange={(e) => setAdminLabel(e.target.value)} sx={{ flex: 1 }} />
            {swatchType === 'color' && (
                <TextField size="small" label="Color (hex)" value={swatchText} onChange={(e) => setSwatchText(e.target.value)} sx={{ width: 140 }} />
            )}
            {swatchType === 'image' && (
                <TextField
                    type="file"
                    size="small"
                    sx={{ width: 200 }}
                    onChange={(e) => setSwatchImage((e.target as HTMLInputElement).files?.[0] ?? null)}
                    slotProps={{ htmlInput: { accept: 'image/*' } }}
                />
            )}
            <SwatchPreview swatchType={swatchType} value={option.swatch_value} />
            <IconButton size="small" onClick={save} title="Save">
                <SaveIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={destroy} title="Delete">
                <DeleteIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
}

/**
 * Options CRUD for select/multiselect attributes. Each row saves/deletes
 * independently via a direct Inertia request back to this same edit page
 * (redirect-back pattern, matching every other catalog controller), instead
 * of being folded into the attribute's own save form.
 */
export function AttributeOptionsPanel({
    attributeId,
    swatchType,
    options,
}: {
    attributeId: number;
    swatchType: string;
    options: AttributeOptionItem[];
}) {
    const [newCode, setNewCode] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newSwatchText, setNewSwatchText] = useState('');
    const [newSwatchImage, setNewSwatchImage] = useState<File | null>(null);

    const addOption = (event: FormEvent) => {
        event.preventDefault();
        router.post(
            `/catalog/attributes/${attributeId}/options`,
            {
                code: newCode,
                admin_label: newLabel,
                swatch_value: swatchType === 'color' ? newSwatchText : undefined,
                swatch_image: newSwatchImage ?? undefined,
            },
            {
                preserveScroll: true,
                forceFormData: true,
                onSuccess: () => {
                    setNewCode('');
                    setNewLabel('');
                    setNewSwatchText('');
                    setNewSwatchImage(null);
                },
            },
        );
    };

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                Options
            </Typography>

            <Stack spacing={1.5} sx={{ mb: 2 }}>
                {options.map((option) => (
                    <OptionRow key={option.id} attributeId={attributeId} swatchType={swatchType} option={option} />
                ))}
                {options.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        No options yet
                    </Typography>
                )}
            </Stack>

            <Box component="form" onSubmit={addOption}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                        size="small"
                        label="Code"
                        required
                        value={newCode}
                        onChange={(e) => setNewCode(slugify(e.target.value))}
                        sx={{ width: 140 }}
                    />
                    <TextField size="small" label="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} sx={{ flex: 1 }} />
                    {swatchType === 'color' && (
                        <TextField
                            size="small"
                            label="Color (hex)"
                            value={newSwatchText}
                            onChange={(e) => setNewSwatchText(e.target.value)}
                            sx={{ width: 140 }}
                        />
                    )}
                    {swatchType === 'image' && (
                        <TextField
                            type="file"
                            size="small"
                            sx={{ width: 200 }}
                            onChange={(e) => setNewSwatchImage((e.target as HTMLInputElement).files?.[0] ?? null)}
                            slotProps={{ htmlInput: { accept: 'image/*' } }}
                        />
                    )}
                    <Button type="submit" variant="outlined">
                        Add option
                    </Button>
                </Stack>
            </Box>
        </Paper>
    );
}
