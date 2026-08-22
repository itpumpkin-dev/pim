import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Grid,
    InputAdornment,
    ListSubheader,
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

type TargetField =
    | 'description'
    | 'short_description'
    | 'name'
    | 'price'
    | 'image'
    | 'qty'
    | 'weight'
    | 'length'
    | 'width'
    | 'height'
    | 'wc_attribute'
    | '';

// Three resolution modes, not just three groups of labels — see
// WooCommerceProductSyncService::buildContentFields() (compose every
// mapped attribute), resolveMappedField() (first mapped attribute with a
// value wins), and buildWooCommerceAttributes() (first-match-wins per
// distinct woocommerce_attribute_id). The grouping below exists to make
// that distinction visible in the picker, not just for tidiness.
const CONTENT_FIELDS: TargetField[] = ['description', 'short_description'];
const STRUCTURED_FIELDS: TargetField[] = ['name', 'price', 'image', 'qty', 'weight', 'length', 'width', 'height'];

// The target Select's value is a plain TargetField string for every fixed
// target, but a WooCommerce Product Attribute mapping needs to also carry
// *which* one — encoded as this prefix + its id (e.g. "wc_attribute:7") so
// one MUI Select can represent both without a second control.
const WC_ATTRIBUTE_PREFIX = 'wc_attribute:';

interface WooCommerceAttributeOption {
    id: number;
    name: string;
    slug: string;
}

interface AttributeRow {
    id: number;
    code: string;
    label: string;
    type: string;
    target_field: TargetField | null;
    woocommerce_attribute_id: number | null;
    sort_order: number;
}

export interface WooCommerceAttributeMappingPanelProps {
    attributes: AttributeRow[];
    wooCommerceAttributes: WooCommerceAttributeOption[];
}

interface PendingEntry {
    target_field: TargetField;
    woocommerce_attribute_id: number | null;
    sort_order: number;
}

// Field identifiers are snake_case (matching the backend's target_field
// values) but this app's i18n keys are camelCase — map explicitly rather
// than assuming `t(field)` resolves, which would silently fail for
// short_description.
// 'wc_attribute' has no fixed label here — its MenuItem is rendered from
// the synced WooCommerce attribute's own name instead (see WC_ATTRIBUTE_PREFIX).
const FIELD_LABEL_KEYS: Record<Exclude<TargetField, '' | 'wc_attribute'>, string> = {
    description: 'description',
    short_description: 'shortDescription',
    name: 'name',
    price: 'price',
    image: 'image',
    qty: 'qty',
    weight: 'weight',
    length: 'length',
    width: 'width',
    height: 'height',
};

export function WooCommerceAttributeMappingPanel({ attributes, wooCommerceAttributes }: WooCommerceAttributeMappingPanelProps) {
    const { t } = useTranslation('catalog');

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<'all' | 'mapped' | 'unmapped'>('all');
    const [pending, setPending] = useState<Record<number, PendingEntry>>({});
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const valueFor = (row: AttributeRow): PendingEntry =>
        pending[row.id] ?? {
            target_field: (row.target_field ?? '') as TargetField,
            woocommerce_attribute_id: row.woocommerce_attribute_id ?? null,
            sort_order: row.sort_order,
        };

    const isMapped = (row: AttributeRow) => valueFor(row).target_field !== '';

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

    // Encodes {target_field, woocommerce_attribute_id} as a single string so
    // one MUI Select can represent both a fixed field and a specific WC
    // attribute — see WC_ATTRIBUTE_PREFIX.
    const buildTargetValue = (entry: PendingEntry): string =>
        entry.target_field === 'wc_attribute' && entry.woocommerce_attribute_id
            ? `${WC_ATTRIBUTE_PREFIX}${entry.woocommerce_attribute_id}`
            : entry.target_field;

    const applySelectValue = (row: AttributeRow, raw: string) => {
        const entry: PendingEntry = raw.startsWith(WC_ATTRIBUTE_PREFIX)
            ? {
                  ...valueFor(row),
                  target_field: 'wc_attribute',
                  woocommerce_attribute_id: Number(raw.slice(WC_ATTRIBUTE_PREFIX.length)),
              }
            : { ...valueFor(row), target_field: raw as TargetField, woocommerce_attribute_id: null };

        setPending((prev) => ({ ...prev, [row.id]: entry }));
    };

    const setSortOrder = (row: AttributeRow, sort_order: number) => {
        setPending((prev) => ({ ...prev, [row.id]: { ...valueFor(row), sort_order } }));
    };

    const pendingCount = Object.keys(pending).length;

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([attributeId, entry]) => ({
            attribute_id: Number(attributeId),
            target_field: entry.target_field || null,
            woocommerce_attribute_id: entry.woocommerce_attribute_id,
            sort_order: entry.sort_order,
        }));

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post(
            '/catalog/attributes/woocommerce-mapping',
            { mappings },
            {
                preserveScroll: true,
                onSuccess: () => setPending({}),
                onFinish: () => setSaving(false),
            },
        );
    };

    const syncFromWoocommerce = () => {
        setSyncing(true);
        router.post(
            '/catalog/attributes/woocommerce-mapping/sync',
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
                    {t('woocommerceContentMappingHelp')}
                </Typography>

                <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
                    <Button
                        variant="outlined"
                        disabled={syncing}
                        onClick={syncFromWoocommerce}
                        startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
                    >
                        {t('syncFromWoocommerce')}
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
                                    value={buildTargetValue(value)}
                                    onChange={(e) => applySelectValue(row, e.target.value)}
                                    size="small"
                                    fullWidth
                                >
                                    <MenuItem value="">{t('notUsed')}</MenuItem>
                                    <ListSubheader>{t('contentFieldsGroup')}</ListSubheader>
                                    {CONTENT_FIELDS.map((field) => (
                                        <MenuItem key={field} value={field}>{t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'wc_attribute'>])}</MenuItem>
                                    ))}
                                    <ListSubheader>{t('productFieldsGroup')}</ListSubheader>
                                    {STRUCTURED_FIELDS.map((field) => (
                                        <MenuItem key={field} value={field}>{t(FIELD_LABEL_KEYS[field as Exclude<TargetField, '' | 'wc_attribute'>])}</MenuItem>
                                    ))}
                                    <ListSubheader>{t('wcAttributesGroup')}</ListSubheader>
                                    {wooCommerceAttributes.map((wa) => (
                                        <MenuItem key={`wc_attribute:${wa.id}`} value={`${WC_ATTRIBUTE_PREFIX}${wa.id}`}>{wa.name}</MenuItem>
                                    ))}
                                </Select>

                                {value.target_field && (
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
