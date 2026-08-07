import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import SearchIcon from '@mui/icons-material/Search';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
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
import { router, usePage } from '@inertiajs/react';
import { KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useLocale } from '@/hooks/use-locale';

export interface AttributeOptionItem {
    id: number;
    code: string;
    admin_label: string | null;
    translations?: Record<string, string>;
    swatch_value: string | null;
    sort_order: number;
}

interface EditableOption {
    id: number;
    code: string;
    translations: Record<string, string>;
    swatchText: string;
    swatchImage: File | null;
    existingSwatchValue: string | null;
}

const toEditableOption = (option: AttributeOptionItem, swatchType: string): EditableOption => ({
    id: option.id,
    code: option.code,
    translations: option.translations ?? {},
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

const PER_PAGE_OPTIONS = [10, 25, 50, 100];

/**
 * Options CRUD for select/multiselect attributes, laid out as a grid with a
 * single label column for whichever locale is currently active — rather
 * than one column per locale — so filling in options doesn't mean scrolling
 * a wide table of every language at once. Follows the same active locale as
 * this page's own LocaleLabelFields (the site-wide language dropdown in the
 * header, via useLocale()) rather than having its own separate selector, so
 * there's one control for "which language am I editing" on this page, not
 * two that could disagree. Reloading on a language switch is safe here even
 * with rows mid-edit: the reconciliation effect below keeps any row that
 * still exists (matched by id) untouched, so in-progress edits survive it.
 * Add/delete are still immediate, independent requests, but edits to existing
 * rows are batched: some of these option lists run into the hundreds
 * (bulk-imported taxonomy data), where a save button per row isn't practical.
 * "Save all" sends every row's current values in one request.
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
    const { locale, locales } = useLocale();
    const { errors } = usePage<any>().props;
    const [rows, setRows] = useState<EditableOption[]>(() => options.map((o) => toEditableOption(o, swatchType)));
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    const [perPage, setPerPage] = useState(10);
    const [page, setPage] = useState(1);
    const activeLocale = locales.find((l) => l.code === locale) ?? locales[0];
    const activeLocaleId = activeLocale?.id;

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

    const [newTranslations, setNewTranslations] = useState<Record<string, string>>({});
    const [newSwatchText, setNewSwatchText] = useState('');
    const [newSwatchImage, setNewSwatchImage] = useState<File | null>(null);
    const [adding, setAdding] = useState(false);
    const hasNewLabel = activeLocaleId !== undefined && (newTranslations[String(activeLocaleId)] ?? '').trim() !== '';

    const addOption = () => {
        if (!hasNewLabel) return;

        setAdding(true);
        router.post(
            `/catalog/attributes/${attributeId}/options`,
            {
                translations: newTranslations,
                swatch_value: swatchType === 'color' ? newSwatchText : undefined,
                swatch_image: newSwatchImage ?? undefined,
            },
            {
                preserveScroll: true,
                forceFormData: true,
                onSuccess: () => {
                    setNewTranslations({});
                    setNewSwatchText('');
                    setNewSwatchImage(null);
                },
                onFinish: () => setAdding(false),
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
                    translations: row.translations,
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

    const [deletingId, setDeletingId] = useState<number | null>(null);

    const destroy = (id: number) => {
        setDeletingId(id);
        router.delete(`/catalog/attributes/${attributeId}/options/${id}`, {
            preserveScroll: true,
            onFinish: () => setDeletingId(null),
        });
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

    const updateRow = (id: number, next: EditableOption) => {
        setRows((prev) => prev.map((r) => (r.id === id ? next : r)));
    };

    const filteredRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return rows;

        return rows.filter((row) => {
            if (row.code.toLowerCase().includes(term)) return true;
            return Object.values(row.translations).some((label) => label.toLowerCase().includes(term));
        });
    }, [rows, search]);

    const pageCount = Math.max(1, Math.ceil(filteredRows.length / perPage));
    const currentPage = Math.min(page, pageCount);
    const pagedRows = filteredRows.slice((currentPage - 1) * perPage, currentPage * perPage);
    const showSwatchColumn = swatchType === 'color' || swatchType === 'image';
    const columnCount = 2 + 1 + (showSwatchColumn ? 1 : 0);

    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" fontWeight={700}>
                    Options
                </Typography>
                <Button
                    type="button"
                    variant="contained"
                    size="small"
                    disabled={saving || rows.length === 0}
                    onClick={saveAll}
                    startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                    {saving ? 'Saving…' : 'Save all'}
                </Button>
            </Stack>

            {/* Option Errors Alert */}
            {(errors.options || Object.keys(errors).some(k => k.startsWith('options.'))) && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.options}
                    {Object.entries(errors)
                        .filter(([key]) => key.startsWith('options.'))
                        .map(([key, val]) => (
                            <div key={key}>{String(val)}</div>
                        ))
                    }
                </Alert>
            )}

            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
                <TextField
                    size="small"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                    }}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
                    sx={{ width: 240 }}
                />
                <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" color="text.secondary">
                        {filteredRows.length} Results
                    </Typography>
                    <Select size="small" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                        {PER_PAGE_OPTIONS.map((n) => (
                            <MenuItem key={n} value={n}>{n}</MenuItem>
                        ))}
                    </Select>
                    <Typography variant="body2" color="text.secondary">Per Page</Typography>
                    <IconButton size="small" disabled={currentPage <= 1} onClick={() => setPage(1)}>
                        <FirstPageIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
                        <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                    <Typography variant="body2">{currentPage} of {pageCount}</Typography>
                    <IconButton size="small" disabled={currentPage >= pageCount} onClick={() => setPage((p) => p + 1)}>
                        <ChevronRightIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={currentPage >= pageCount} onClick={() => setPage(pageCount)}>
                        <LastPageIcon fontSize="small" />
                    </IconButton>
                </Stack>
            </Stack>

            <TableContainer sx={{ mb: 1 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700, width: 160 }}>Code</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>
                                Label ({activeLocale?.display_name ?? activeLocale?.code})
                            </TableCell>
                            {showSwatchColumn && <TableCell sx={{ fontWeight: 700 }}>Swatch</TableCell>}
                            <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                            <TableCell>
                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    Auto
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <TextField
                                    size="small"
                                    fullWidth
                                    value={activeLocaleId !== undefined ? (newTranslations[String(activeLocaleId)] ?? '') : ''}
                                    onChange={(e) => activeLocaleId !== undefined && setNewTranslations((prev) => ({ ...prev, [String(activeLocaleId)]: e.target.value }))}
                                    onKeyDown={submitOnEnter}
                                />
                            </TableCell>
                            {swatchType === 'color' && (
                                <TableCell>
                                    <TextField
                                        size="small"
                                        placeholder="#hex"
                                        value={newSwatchText}
                                        onChange={(e) => setNewSwatchText(e.target.value)}
                                        onKeyDown={submitOnEnter}
                                    />
                                </TableCell>
                            )}
                            {swatchType === 'image' && (
                                <TableCell>
                                    <TextField
                                        type="file"
                                        size="small"
                                        onChange={(e) => setNewSwatchImage((e.target as HTMLInputElement).files?.[0] ?? null)}
                                        slotProps={{ htmlInput: { accept: 'image/*' } }}
                                    />
                                </TableCell>
                            )}
                            <TableCell align="right">
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={addOption}
                                    disabled={!hasNewLabel || adding}
                                    startIcon={adding ? <CircularProgress size={14} color="inherit" /> : undefined}
                                >
                                    {adding ? 'Adding…' : 'Add Row'}
                                </Button>
                            </TableCell>
                        </TableRow>

                        {pagedRows.map((row) => {
                            return (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            fullWidth
                                            value={row.code}
                                            disabled
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            size="small"
                                            fullWidth
                                            value={activeLocaleId !== undefined ? (row.translations[String(activeLocaleId)] ?? '') : ''}
                                            onChange={(e) => activeLocaleId !== undefined && updateRow(row.id, {
                                                ...row,
                                                translations: { ...row.translations, [String(activeLocaleId)]: e.target.value },
                                            })}
                                        />
                                    </TableCell>
                                    {swatchType === 'color' && (
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <TextField
                                                    size="small"
                                                    value={row.swatchText}
                                                    onChange={(e) => updateRow(row.id, { ...row, swatchText: e.target.value })}
                                                    sx={{ width: 100 }}
                                                />
                                                <SwatchPreview swatchType={swatchType} value={row.existingSwatchValue} />
                                            </Stack>
                                        </TableCell>
                                    )}
                                    {swatchType === 'image' && (
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <TextField
                                                    type="file"
                                                    size="small"
                                                    onChange={(e) => updateRow(row.id, { ...row, swatchImage: (e.target as HTMLInputElement).files?.[0] ?? null })}
                                                    slotProps={{ htmlInput: { accept: 'image/*' } }}
                                                    sx={{ width: 160 }}
                                                />
                                                <SwatchPreview swatchType={swatchType} value={row.existingSwatchValue} />
                                            </Stack>
                                        </TableCell>
                                    )}
                                    <TableCell align="right">
                                        <IconButton size="small" onClick={() => destroy(row.id)} disabled={deletingId === row.id} title="Delete">
                                            {deletingId === row.id ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon fontSize="small" />}
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            );
                        })}

                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columnCount} align="center" sx={{ py: 3 }}>
                                    <Typography variant="body2" color="text.secondary">No options yet</Typography>
                                </TableCell>
                            </TableRow>
                        )}

                        {rows.length > 0 && filteredRows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={columnCount} align="center" sx={{ py: 3 }}>
                                    <Typography variant="body2" color="text.secondary">No options match your search.</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}
