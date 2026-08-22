import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Grid,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { router } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mappedChipSx, naChipSx, pendingRowSx, solidActionSx, UI_BORDER } from '@/lib/ui-style';

// v1 supports free-value Lazada attributes (input_type text/numeric) and
// richText fields (e.g. description/short_description, which accept real
// HTML) — see LazadaAttributeMappingController::update(), which rejects a
// mapping to any other input_type. singleSelect/multiSelect/enumInput
// attributes are still listed (so an admin can see they exist) but
// disabled, since Lazada needs a specific predefined option for those
// rather than an arbitrary value.
const MAPPABLE_INPUT_TYPES = ['text', 'numeric', 'richText'];

interface LazadaAttributeOption {
    name: string;
    label: string | null;
    input_type: string | null;
}

interface AttributeRow {
    id: number;
    code: string;
    label: string;
    type: string;
    lazada_attribute_name: string | null;
    sort_order: number;
}

export interface LazadaAttributeMappingPanelProps {
    attributes: AttributeRow[];
    lazadaAttributes: LazadaAttributeOption[];
}

interface PendingEntry {
    lazada_attribute_name: string | null;
    sort_order: number;
}

export function LazadaAttributeMappingPanel({ attributes, lazadaAttributes }: LazadaAttributeMappingPanelProps) {
    const { t } = useTranslation('catalog');

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'all' | 'mapped' | 'unmapped'>('all');
    const [pending, setPending] = useState<Record<number, PendingEntry>>({});
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const valueFor = (row: AttributeRow): PendingEntry =>
        pending[row.id] ?? { lazada_attribute_name: row.lazada_attribute_name ?? null, sort_order: row.sort_order };

    const isMapped = (row: AttributeRow) => valueFor(row).lazada_attribute_name !== null;

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();

        return attributes.filter((a) => {
            if (needle && !a.code.toLowerCase().includes(needle) && !a.label.toLowerCase().includes(needle)) {
                return false;
            }

            if (status === 'mapped' && !isMapped(a)) return false;
            if (status === 'unmapped' && isMapped(a)) return false;

            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attributes, search, status, pending]);

    const setLazadaAttribute = (row: AttributeRow, raw: string) => {
        setPending((prev) => ({
            ...prev,
            [row.id]: { ...valueFor(row), lazada_attribute_name: raw === '' ? null : raw },
        }));
    };

    const setSortOrder = (row: AttributeRow, sort_order: number) => {
        setPending((prev) => ({ ...prev, [row.id]: { ...valueFor(row), sort_order } }));
    };

    const pendingCount = Object.keys(pending).length;

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([attributeId, entry]) => ({
            attribute_id: Number(attributeId),
            lazada_attribute_name: entry.lazada_attribute_name,
            sort_order: entry.sort_order,
        }));

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post(
            '/catalog/attributes/lazada-mapping',
            { mappings },
            {
                preserveScroll: true,
                onSuccess: () => setPending({}),
                onFinish: () => setSaving(false),
            },
        );
    };

    const syncFromLazada = () => {
        setSyncing(true);
        router.post(
            '/catalog/attributes/lazada-mapping/sync',
            {},
            {
                preserveScroll: true,
                onFinish: () => setSyncing(false),
            },
        );
    };

    return (
        <Box>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-start' }} spacing={2} sx={{ mb: 3 }}>
                <Typography color="text.secondary" sx={{ maxWidth: 840 }}>
                    {t('lazadaAttributeMappingHelp')}
                </Typography>

                <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
                    <Button
                        variant="outlined"
                        disabled={syncing}
                        onClick={syncFromLazada}
                        startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
                    >
                        {t('syncFromLazada')}
                    </Button>

                    <Button
                        variant="contained"
                        disabled={pendingCount === 0 || saving}
                        onClick={saveChanges}
                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={solidActionSx}
                    >
                        {t('saveChanges')}{pendingCount > 0 ? ` (${pendingCount})` : ''}
                    </Button>
                </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <TextField
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('searchAttributes')}
                    size="small"
                    sx={{ minWidth: 320 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                />

                <Select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'all' | 'mapped' | 'unmapped')}
                    size="small"
                    sx={{ minWidth: 160 }}
                >
                    <MenuItem value="all">{t('statusAll')}</MenuItem>
                    <MenuItem value="mapped">{t('statusMapped')}</MenuItem>
                    <MenuItem value="unmapped">{t('statusUnmapped')}</MenuItem>
                </Select>
            </Stack>

            <Grid container spacing={2}>
                {filtered.map((row) => {
                    const value = valueFor(row);
                    const hasPendingChange = row.id in pending;
                    const mapped = isMapped(row);

                    return (
                        <Grid item xs={12} sm={6} md={4} key={row.id}>
                            <Paper
                                variant="outlined"
                                sx={{ p: 2, borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, ...pendingRowSx(hasPendingChange) }}
                            >
                                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography fontWeight={600} noWrap title={row.label}>{row.label}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                            {row.code} · {row.type}
                                        </Typography>
                                    </Box>

                                    <Chip
                                        label={mapped ? t('statusMapped') : t('statusUnmapped')}
                                        size="small"
                                        sx={mapped ? mappedChipSx : naChipSx}
                                    />
                                </Stack>

                                <Select
                                    value={value.lazada_attribute_name ?? ''}
                                    onChange={(e) => setLazadaAttribute(row, e.target.value)}
                                    size="small"
                                    fullWidth
                                >
                                    <MenuItem value="">{t('notUsed')}</MenuItem>
                                    {lazadaAttributes.map((la) => (
                                        <MenuItem
                                            key={la.name}
                                            value={la.name}
                                            disabled={!la.input_type || !MAPPABLE_INPUT_TYPES.includes(la.input_type)}
                                        >
                                            {la.label ?? la.name}
                                            {!la.input_type || !MAPPABLE_INPUT_TYPES.includes(la.input_type) ? ` ${t('lazadaSelectUnsupported')}` : ''}
                                        </MenuItem>
                                    ))}
                                </Select>

                                {value.lazada_attribute_name !== null && (
                                    <TextField
                                        type="number"
                                        size="small"
                                        label={t('sortOrder')}
                                        value={value.sort_order}
                                        onChange={(e) => setSortOrder(row, Number(e.target.value) || 0)}
                                        sx={{ width: 100 }}
                                        slotProps={{ htmlInput: { min: 0 } }}
                                    />
                                )}
                            </Paper>
                        </Grid>
                    );
                })}

                {filtered.length === 0 && (
                    <Grid item xs={12}>
                        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2, borderColor: UI_BORDER }}>
                            <Typography color="text.secondary">{t('noAttributesFound')}</Typography>
                        </Paper>
                    </Grid>
                )}
            </Grid>
        </Box>
    );
}
