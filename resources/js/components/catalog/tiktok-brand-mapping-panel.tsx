import { PimBrandPicker, type PimBrandOption } from '@/components/catalog/pim-brand-picker';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { xsrfToken } from '@/lib/csrf';
import { FIORI, fioriDefaultSx, fioriSearchFieldSx } from '@/lib/fiori-style';
import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';
import CancelIcon from '@mui/icons-material/Cancel';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import { Box, Button, CircularProgress, IconButton, InputAdornment, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// `id` เป็น string ไม่ใช่ number — เพราะ brand id ของ TikTok เองเป็นเลข 19 หลัก
// สไตล์ snowflake ซึ่งจะเสีย precision ทันทีที่ JSON.parse ของ JS แตะเข้าไปเกิน
// Number.MAX_SAFE_INTEGER (ดู docblock ของ BrandController::tiktokBrandsList()
// — เจอจริงกับข้อมูลจริงมาแล้ว)
interface TikTokBrandRow {
    id: string;
    name: string;
    mapped: { id: number; name: string } | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

/**
 * Extracted from categories/tiktok-mapping.tsx's "TikTok Brands" section
 * (moved wholesale, not duplicated — that page no longer renders one) onto
 * tiktok-products.tsx's Object Page instead, mirroring the same move already
 * done for Shopee's ShopeeBrandMappingPanel.
 *
 * Unlike Shopee, TikTok's brand catalog carries no category dimension at all
 * (confirmed live — get_brand_list here isn't scoped by category the way
 * Shopee's is) — so this needs no props to know what to load, no
 * shopeeCategoryId-style parameter, just mounts and loads once. Kept its own
 * permission check (marketplace_tiktok.edit_brand_mapping_tiktok) the same
 * way the original page did, since a product-page viewer might have
 * attribute-mapping access without brand-mapping access.
 */
export function TikTokBrandMappingPanel() {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { auth } = usePage<SharedData>().props;
    const canEditBrands = (auth.permissions || []).includes('marketplace_tiktok.edit_brand_mapping_tiktok');

    const [brands, setBrands] = useState<PaginatedData<TikTokBrandRow> | null>(null);
    const [loadingBrands, setLoadingBrands] = useState(false);
    const [brandSearch, setBrandSearch] = useState('');
    const [brandPerPage, setBrandPerPage] = useState(25);
    const [savingBrandId, setSavingBrandId] = useState<string | null>(null);
    const [brandSyncing, setBrandSyncing] = useState(false);
    const [brandSyncMessage, setBrandSyncMessage] = useState('');
    const [activeJobTrackerId, setActiveJobTrackerId] = useState<number | null>(null);
    const brandPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstSearchRender = useRef(true);

    useEffect(() => {
        return () => {
            if (brandPollTimer.current) clearTimeout(brandPollTimer.current);
        };
    }, []);

    const loadBrands = (opts: { search?: string; page?: number; perPage?: number } = {}) => {
        const params = new URLSearchParams({
            search: opts.search ?? brandSearch,
            page: String(opts.page ?? 1),
            per_page: String(opts.perPage ?? brandPerPage),
        });

        setLoadingBrands(true);
        fetch(`/catalog/categories/tiktok-mapping/tiktok-brands?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [], current_page: 1, last_page: 1, per_page: 25, total: 0 }))
            .then((body: PaginatedData<TikTokBrandRow>) => setBrands(body))
            .finally(() => setLoadingBrands(false));
    };

    // โหลดครั้งเดียวตอน mount — ไม่ต้องรอเลือกอะไรก่อน (ไม่มีมิติหมวดหมู่ให้เลือก)
    useEffect(() => {
        if (canEditBrands) loadBrands({ page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (firstSearchRender.current) {
            firstSearchRender.current = false;
            return;
        }

        const timeout = setTimeout(() => loadBrands({ search: brandSearch, page: 1 }), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brandSearch]);

    const handlePerPageChange = (value: number) => {
        setBrandPerPage(value);
        loadBrands({ page: 1, perPage: value });
    };

    const goToPage = (page: number) => {
        loadBrands({ page });
    };

    const pollBrandSync = (jobTrackerId: number) => {
        fetch(`/catalog/brands/sync-jobs/${jobTrackerId}/status`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setBrandSyncing(false);
                    setBrandSyncMessage(body.message ?? 'Could not check sync status.');
                    setActiveJobTrackerId(null);
                    return;
                }

                if (body.status === 'completed') {
                    setBrandSyncing(false);
                    setActiveJobTrackerId(null);
                    setBrandSyncMessage(t('brandsSyncedCount', { count: body.total_records_created ?? 0 }));
                    loadBrands({ page: 1 });
                    return;
                }

                if (body.status === 'failed' || body.status === 'cancelled') {
                    setBrandSyncing(false);
                    setActiveJobTrackerId(null);
                    setBrandSyncMessage(body.error_log?.[0]?.message ?? 'Sync failed.');
                    return;
                }

                brandPollTimer.current = setTimeout(() => pollBrandSync(jobTrackerId), 2000);
            })
            .catch(() => {
                setBrandSyncing(false);
                setActiveJobTrackerId(null);
                setBrandSyncMessage('Network error while checking sync status.');
            });
    };

    const triggerBrandSync = () => {
        setBrandSyncing(true);
        setBrandSyncMessage('');

        fetch('/catalog/brands/sync-tiktok', {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_tracker_id) {
                    setBrandSyncing(false);
                    setBrandSyncMessage(body.message ?? 'Could not start sync.');
                    return;
                }

                setActiveJobTrackerId(body.job_tracker_id);
                pollBrandSync(body.job_tracker_id);
            })
            .catch(() => {
                setBrandSyncing(false);
                setBrandSyncMessage('Network error while starting sync.');
            });
    };

    const cancelBrandSync = () => {
        if (!activeJobTrackerId) return;

        fetch(`/catalog/brands/sync-jobs/${activeJobTrackerId}/cancel`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        }).catch(() => setBrandSyncMessage('Network error while cancelling sync.'));
    };

    // `optionId` คือแถว PIM AttributeOption ที่จะถูกเขียนค่าลงไปจริงๆ
    // (attribute_options.tiktok_brand_id) — ถ้าเป็นการจับคู่ใหม่ ก็คือ id ของแบรนด์ PIM
    // ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม ก็คือ PIM id ของ mapping เดิมนั้น
    const persistBrand = (tiktokBrandId: string, optionId: number, newTiktokId: string | null, display: { id: number; name: string } | null) => {
        setSavingBrandId(tiktokBrandId);
        fetch('/catalog/brands/tiktok-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings: [{ option_id: optionId, marketplace_brand_id: newTiktokId }] }),
        })
            .then((res) => {
                if (!res.ok) return;
                setBrands((prev) => (prev ? { ...prev, data: prev.data.map((b) => (b.id === tiktokBrandId ? { ...b, mapped: display } : b)) } : prev));
            })
            .finally(() => setSavingBrandId(null));
    };

    const assignBrand = (tiktokBrandId: string, pimBrand: PimBrandOption) => {
        persistBrand(tiktokBrandId, pimBrand.id, tiktokBrandId, { id: pimBrand.id, name: pimBrand.name });
    };

    const clearBrand = (tiktokBrandId: string, currentPimOptionId: number) => {
        persistBrand(tiktokBrandId, currentPimOptionId, null, null);
    };

    const brandColumns: FioriResponsiveColumn<TikTokBrandRow>[] = [
        {
            key: 'id',
            header: t('idColumn'),
            priority: 'high',
            align: 'right',
            width: 160,
            render: (brand) => (
                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                    {brand.id}
                </Typography>
            ),
        },
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 200,
            render: (brand) => <Typography fontWeight={600}>{brand.name}</Typography>,
        },
        {
            key: 'mapping',
            header: t('brandMappingColumn'),
            priority: 'high',
            minWidth: 260,
            render: (brand) => (
                <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ flex: 1, minWidth: 200 }}>
                        <PimBrandPicker
                            value={brand.mapped}
                            disabled={savingBrandId === brand.id}
                            onChange={(val) => {
                                if (val) {
                                    assignBrand(brand.id, val);
                                } else if (brand.mapped) {
                                    clearBrand(brand.id, brand.mapped.id);
                                }
                            }}
                            placeholder={t('searchPimBrandPlaceholder')}
                        />
                    </Box>
                    {savingBrandId === brand.id && <CircularProgress size={14} />}
                </Stack>
            ),
        },
    ];

    if (!canEditBrands) {
        return (
            <Typography variant="body2" sx={{ color: FIORI.textSecondary }} align="center" py={3}>
                คุณไม่มีสิทธิ์จับคู่แบรนด์ของ TikTok (marketplace_tiktok.edit_brand_mapping_tiktok)
            </Typography>
        );
    }

    return (
        <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" fontWeight={700} sx={{ color: FIORI.textPrimary }}>
                    {t('tiktokBrandsSectionTitle')}
                </Typography>

                <Stack direction="row" spacing={1.5} alignItems="center">
                    {brandSyncMessage && (
                        <Typography variant="caption" color="text.secondary">
                            {brandSyncMessage}
                        </Typography>
                    )}
                    <Button
                        size="small"
                        variant="outlined"
                        disabled={brandSyncing}
                        startIcon={brandSyncing ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                        onClick={triggerBrandSync}
                        sx={fioriDefaultSx}
                    >
                        {brandSyncing ? t('syncingBrands') : t('syncBrands')}
                    </Button>
                    {brandSyncing && activeJobTrackerId && (
                        <Button size="small" variant="outlined" color="error" startIcon={<CancelIcon fontSize="small" />} onClick={cancelBrandSync} sx={{ textTransform: 'none' }}>
                            {t('cancel')}
                        </Button>
                    )}
                </Stack>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
                <TextField
                    value={brandSearch}
                    onChange={(event) => setBrandSearch(event.target.value)}
                    placeholder={t('searchBrands')}
                    size="small"
                    sx={{ ...fioriSearchFieldSx, minWidth: 280 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                            </InputAdornment>
                        ),
                    }}
                />

                <Stack direction="row" alignItems="center" spacing={1.5}>
                    {loadingBrands && <CircularProgress size={18} />}

                    <Select value={brandPerPage} onChange={(e) => handlePerPageChange(Number(e.target.value))} size="small" sx={{ minWidth: 60, height: 36 }}>
                        <MenuItem value={10}>10</MenuItem>
                        <MenuItem value={25}>25</MenuItem>
                        <MenuItem value={50}>50</MenuItem>
                        <MenuItem value={100}>100</MenuItem>
                    </Select>
                    <Typography variant="body2" color="text.secondary">
                        {tGrid('perPage')}
                    </Typography>

                    <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body2">{brands?.current_page ?? 1}</Typography>
                    </Paper>
                    <Typography variant="body2" color="text.secondary">
                        {tGrid('pageOf', { lastPage: brands?.last_page ?? 1 })}
                    </Typography>

                    <Stack direction="row" spacing={0.2}>
                        <IconButton size="small" disabled={(brands?.current_page ?? 1) <= 1} onClick={() => goToPage(1)}>
                            <FirstPageIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" disabled={(brands?.current_page ?? 1) <= 1} onClick={() => goToPage((brands?.current_page ?? 1) - 1)}>
                            <ChevronLeftIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small"
                            disabled={(brands?.current_page ?? 1) >= (brands?.last_page ?? 1)}
                            onClick={() => goToPage((brands?.current_page ?? 1) + 1)}
                        >
                            <ChevronRightIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" disabled={(brands?.current_page ?? 1) >= (brands?.last_page ?? 1)} onClick={() => goToPage(brands?.last_page ?? 1)}>
                            <LastPageIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Stack>
            </Stack>

            <FioriResponsiveTable
                columns={brandColumns}
                rows={brands?.data ?? []}
                getRowKey={(brand) => brand.id}
                emptyMessage={loadingBrands ? <CircularProgress size={20} /> : t('noBrandsFound')}
            />
        </Stack>
    );
}
