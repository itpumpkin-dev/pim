import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Button, IconButton, Paper, Stack, TextField, Typography } from '@mui/material';
import { router } from '@inertiajs/react';
import { KeyboardEvent, useEffect, useState } from 'react';

export interface AttributeOptionItem {
    id: number;
    code: string;
    admin_label: string | null;
    swatch_value: string | null;
    sort_order: number;
}

interface EditableOption {
    id: number;
    code: string;
    admin_label: string;
    swatchText: string;
    swatchImage: File | null;
    existingSwatchValue: string | null;
}

const slugify = (value: string) => value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

const toEditableOption = (option: AttributeOptionItem, swatchType: string): EditableOption => ({
    id: option.id,
    code: option.code,
    admin_label: option.admin_label ?? '',
    swatchText: swatchType === 'color' ? (option.swatch_value ?? '') : '',
    swatchImage: null,
    existingSwatchValue: option.swatch_value,
});

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

function OptionRow({
    attributeId,
    swatchType,
    row,
    onChange,
}: {
    attributeId: number;
    swatchType: string;
    row: EditableOption;
    onChange: (next: EditableOption) => void;
}) {
    const destroy = () => {
        router.delete(`/catalog/attributes/${attributeId}/options/${row.id}`, { preserveScroll: true });
    };

    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <TextField
                size="small"
                label="Code"
                value={row.code}
                onChange={(e) => onChange({ ...row, code: slugify(e.target.value) })}
                sx={{ width: 140 }}
            />
            <TextField
                size="small"
                label="Label"
                value={row.admin_label}
                onChange={(e) => onChange({ ...row, admin_label: e.target.value })}
                sx={{ flex: 1 }}
            />
            {swatchType === 'color' && (
                <TextField
                    size="small"
                    label="Color (hex)"
                    value={row.swatchText}
                    onChange={(e) => onChange({ ...row, swatchText: e.target.value })}
                    sx={{ width: 140 }}
                />
            )}
            {swatchType === 'image' && (
                <TextField
                    type="file"
                    size="small"
                    sx={{ width: 200 }}
                    onChange={(e) => onChange({ ...row, swatchImage: (e.target as HTMLInputElement).files?.[0] ?? null })}
                    slotProps={{ htmlInput: { accept: 'image/*' } }}
                />
            )}
            <SwatchPreview swatchType={swatchType} value={row.existingSwatchValue} />
            <IconButton size="small" onClick={destroy} title="Delete">
                <DeleteIcon fontSize="small" />
            </IconButton>
        </Stack>
    );
}

/**
 * Options CRUD for select/multiselect attributes. Add/delete are still
 * immediate, independent requests, but edits to existing rows are batched —
 * some of these option lists run into the hundreds (bulk-imported taxonomy
 * data), where a save button per row isn't practical. "Save all" sends every
 * row's current values in one request; rows aren't individually saved.
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
    const [rows, setRows] = useState<EditableOption[]>(() => options.map((o) => toEditableOption(o, swatchType)));
    const [saving, setSaving] = useState(false);

    // Reconciles with fresh server data (after add/delete/save-all) without
    // discarding in-progress edits to rows that are still around — only rows
    // that are new (just added) or gone (just deleted) actually change here.
    useEffect(() => {
        setRows((prevRows) => {
            const prevById = new Map(prevRows.map((row) => [row.id, row]));
            return options.map((o) => prevById.get(o.id) ?? toEditableOption(o, swatchType));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [options]);

    const [newCode, setNewCode] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newSwatchText, setNewSwatchText] = useState('');
    const [newSwatchImage, setNewSwatchImage] = useState<File | null>(null);

    const addOption = () => {
        if (!newCode.trim()) return;

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

    const saveAll = () => {
        setSaving(true);
        // PHP does not parse multipart/form-data bodies for PUT requests, so
        // this has to go through POST with a spoofed _method — same reason
        // ProductController's own submit does it (see edit.tsx), otherwise
        // the batch endpoint sees an empty request and silently no-ops.
        router.post(
            `/catalog/attributes/${attributeId}/options/batch`,
            {
                _method: 'put',
                options: rows.map((row) => ({
                    id: row.id,
                    code: row.code,
                    admin_label: row.admin_label,
                    swatch_value: swatchType === 'color' ? row.swatchText : undefined,
                    swatch_image: row.swatchImage ?? undefined,
                })),
            },
            {
                preserveScroll: true,
                forceFormData: true,
                onFinish: () => setSaving(false),
            },
        );
    };

    // This panel is always rendered inside the attribute edit page's own
    // <form>, so it can't be a <form> itself (nested forms are invalid HTML
    // and React warns/hydration-fails on them) — Enter is wired up manually
    // instead of relying on native form-submit-on-Enter.
    const submitOnEnter = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addOption();
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={700}>
                    Options
                </Typography>
                <Button type="button" variant="contained" size="small" disabled={saving || rows.length === 0} onClick={saveAll}>
                    Save all
                </Button>
            </Stack>

            <Stack spacing={1.5} sx={{ mb: 2 }}>
                {rows.map((row) => (
                    <OptionRow
                        key={row.id}
                        attributeId={attributeId}
                        swatchType={swatchType}
                        row={row}
                        onChange={(next) => setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))}
                    />
                ))}
                {rows.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                        No options yet
                    </Typography>
                )}
            </Stack>

            <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                        size="small"
                        label="Code"
                        value={newCode}
                        onChange={(e) => setNewCode(slugify(e.target.value))}
                        onKeyDown={submitOnEnter}
                        sx={{ width: 140 }}
                    />
                    <TextField
                        size="small"
                        label="Label"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={submitOnEnter}
                        sx={{ flex: 1 }}
                    />
                    {swatchType === 'color' && (
                        <TextField
                            size="small"
                            label="Color (hex)"
                            value={newSwatchText}
                            onChange={(e) => setNewSwatchText(e.target.value)}
                            onKeyDown={submitOnEnter}
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
                    <Button type="button" variant="outlined" onClick={addOption}>
                        Add option
                    </Button>
                </Stack>
            </Box>
        </Paper>
    );
}
