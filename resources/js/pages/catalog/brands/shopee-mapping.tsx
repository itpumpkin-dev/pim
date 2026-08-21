import AppLayout from '@/layouts/app-layout';
import { ShopeeBrandPicker, type ShopeeBrandOption } from '@/components/catalog/shopee-brand-picker';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mappedChipSx, pendingChipSx, pendingRowSx, solidActionSx } from '@/lib/ui-style';

interface MappingRow {
    id: number;
    code: string;
    name: string;
    current: { id: number; name: string } | null;
    products_count: number;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    brands: PaginatedData<MappingRow>;
    stats: { total: number; mapped: number };
    filters: { status: 'unmapped' | 'mapped' | 'all'; search: string; per_page: number; only_with_products: boolean };
}

/**
 * Brand-specific version of categories/shopee-mapping.tsx — deliberately
 * simpler: no CategoryMatcher-style auto-suggestions (AttributeOption has no
 * hierarchical path to score against), just search-and-pick per row via
 * ShopeeBrandPicker plus a batch save, same pending-changes-chip pattern.
 */
export default function ShopeeBrandMapping({ brands, stats, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('brandMarketplaceSyncTitle'), href: '/catalog/brands/marketplace-sync' },
        { title: t('shopeeBrandMappingTitle'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [status, setStatus] = useState(filters.status ?? 'unmapped');
    const [onlyWithProducts, setOnlyWithProducts] = useState(filters.only_with_products ?? false);
    const [perPage, setPerPage] = useState<number>(brands.per_page ?? 25);
    const [pending, setPending] = useState<Record<number, ShopeeBrandOption | null>>({});
    const [saving, setSaving] = useState(false);
    const firstRender = useRef(true);

    // A fresh `brands` prop (new page/filter/search, or after a save) means
    // pending picks made against the previous rows no longer apply.
    useEffect(() => {
        setPending({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brands]);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/brands/shopee-mapping', { search, status, per_page: perPage, only_with_products: onlyWithProducts }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const applyStatus = (value: 'unmapped' | 'mapped' | 'all') => {
        setStatus(value);
        router.get('/catalog/brands/shopee-mapping', { search, status: value, per_page: perPage, only_with_products: onlyWithProducts }, { preserveState: true });
    };

    const applyOnlyWithProducts = (value: boolean) => {
        setOnlyWithProducts(value);
        router.get('/catalog/brands/shopee-mapping', { search, status, per_page: perPage, only_with_products: value }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/brands/shopee-mapping', { search, status, per_page: value, only_with_products: onlyWithProducts }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/brands/shopee-mapping', { search, status, per_page: perPage, page, only_with_products: onlyWithProducts }, { preserveState: true });
    };

    const currentPage = brands.current_page ?? 1;
    const lastPage = brands.last_page ?? 1;
    const pendingCount = Object.keys(pending).length;

    const clearMapping = (row: MappingRow) => {
        setPending((prev) => ({ ...prev, [row.id]: null }));
    };

    const undoPending = (row: MappingRow) => {
        setPending((prev) => {
            const next = { ...prev };
            delete next[row.id];
            return next;
        });
    };

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([optionId, option]) => ({
            option_id: Number(optionId),
            marketplace_brand_id: option ? option.id : null,
        }));

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post(
            '/catalog/brands/shopee-mapping',
            { mappings },
            { preserveScroll: true, onFinish: () => setSaving(false) },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('shopeeBrandMappingTitle')} />
            <Box sx={{ p: 4 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
                    <Box>
                        <Button
                            size="small"
                            startIcon={<ArrowBackIcon fontSize="small" />}
                            onClick={() => router.visit('/catalog/brands/marketplace-sync')}
                            sx={{ textTransform: 'none', mb: 1, color: 'text.secondary' }}
                        >
                            {t('brandMarketplaceSyncTitle')}
                        </Button>
                        <Typography variant="h4" fontWeight={700}>{t('shopeeBrandMappingTitle')}</Typography>
                        <Typography color="text.secondary">
                            {t('brandsMapped', { mapped: stats.mapped, total: stats.total })}
                        </Typography>
                    </Box>

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

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                    <TextField
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('searchBrands')}
                        size="small"
                        sx={{ minWidth: 280 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Select value={status} onChange={(e) => applyStatus(e.target.value as 'unmapped' | 'mapped' | 'all')} size="small" sx={{ minWidth: 140 }}>
                            <MenuItem value="unmapped">{t('statusUnmapped')}</MenuItem>
                            <MenuItem value="mapped">{t('statusMapped')}</MenuItem>
                            <MenuItem value="all">{t('statusAll')}</MenuItem>
                        </Select>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    size="small"
                                    checked={onlyWithProducts}
                                    onChange={(e) => applyOnlyWithProducts(e.target.checked)}
                                />
                            }
                            label={t('onlyWithProducts')}
                            sx={{ mr: 0 }}
                        />

                        <Select value={perPage} onChange={(e) => handlePerPageChange(Number(e.target.value))} size="small" sx={{ minWidth: 60, height: 36 }}>
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                            <MenuItem value={100}>100</MenuItem>
                        </Select>
                        <Typography variant="body2" color="text.secondary">{tGrid('perPage')}</Typography>

                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2">{currentPage}</Typography>
                        </Paper>
                        <Typography variant="body2" color="text.secondary">{tGrid('pageOf', { lastPage })}</Typography>

                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(1)}><FirstPageIcon fontSize="small" /></IconButton>
                            <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}><ChevronLeftIcon fontSize="small" /></IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}><ChevronRightIcon fontSize="small" /></IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}><LastPageIcon fontSize="small" /></IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                <Stack spacing={1.5}>
                    {brands.data.map((row) => {
                        const rowPending = pending[row.id];
                        const hasPendingChange = row.id in pending;

                        return (
                            <Paper key={row.id} variant="outlined" sx={{ p: 2, borderRadius: 2, ...pendingRowSx(hasPendingChange) }}>
                                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                                    <Box sx={{ minWidth: 240, maxWidth: 340 }}>
                                        <Typography fontWeight={600}>{row.name}</Typography>
                                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                                            {t('productsInCategory', { count: row.products_count })}
                                        </Typography>
                                    </Box>

                                    <Box sx={{ flex: 1 }}>
                                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                            {row.current && !hasPendingChange && (
                                                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                                                    {t('currentMapping')}:
                                                </Typography>
                                            )}

                                            {row.current && !hasPendingChange && (
                                                <Chip
                                                    label={row.current.name}
                                                    size="small"
                                                    onDelete={() => clearMapping(row)}
                                                    deleteIcon={<CloseIcon fontSize="small" />}
                                                    sx={mappedChipSx}
                                                />
                                            )}

                                            {hasPendingChange && (
                                                <Chip
                                                    label={rowPending ? `${t('willMapTo')}: ${rowPending.name}` : t('willClearMapping')}
                                                    size="small"
                                                    onDelete={() => undoPending(row)}
                                                    deleteIcon={<CloseIcon fontSize="small" />}
                                                    variant="outlined"
                                                    sx={pendingChipSx}
                                                />
                                            )}
                                        </Stack>

                                        <Box sx={{ maxWidth: 360 }}>
                                            <ShopeeBrandPicker
                                                value={rowPending ?? null}
                                                onChange={(val) => setPending((prev) => ({ ...prev, [row.id]: val }))}
                                                placeholder={t('searchManually')}
                                            />
                                        </Box>
                                    </Box>
                                </Stack>
                            </Paper>
                        );
                    })}

                    {brands.data.length === 0 && (
                        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                            <Typography color="text.secondary">{t('noBrandsFound')}</Typography>
                        </Paper>
                    )}
                </Stack>
            </Box>
        </AppLayout>
    );
}
