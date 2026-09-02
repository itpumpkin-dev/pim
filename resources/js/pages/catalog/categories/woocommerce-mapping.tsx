import { CategoryPicker, type CategoryOption } from '@/components/catalog/category-picker';
import { PimBrandPicker, type PimBrandOption } from '@/components/catalog/pim-brand-picker';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { xsrfToken } from '@/lib/csrf';
import { FIORI, fioriSearchFieldSx, fioriToggleButtonGroupSx } from '@/lib/fiori-style';
import { mappedChipSx, pendingChipSx, pendingRowSx, solidActionSx } from '@/lib/ui-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ใช้ตารางแบบ marketplace-tree-row-centric เหมือนกับ categories/shopee-mapping.tsx/
// categories/lazada-mapping.tsx/categories/tiktok-mapping.tsx (ดู docblock ของ
// CategoryController::woocommerceMapping()) — ไม่มีส่วน "Attributes" ในหน้านี้
// เหมือน Shopee/Lazada/TikTok เพราะ custom attributes ของ WooCommerce ไม่ได้ผูกกับ
// schema หมวดหมู่เลย (ดู WooCommerceAttributeMappingController —
// syncWoocommerceAttributes() ทำงานแบบ global ไม่มีแนวคิดแยกตามหมวดหมู่ให้เลียนแบบ)
//
// ปุ่ม "ดาวน์โหลด CSV"/"นำเข้าเป็นหมวดหมู่ PIM" ย้ายมาจาก
// categories/marketplace-sync.tsx แล้ว (ดู docblock ของหน้านั้น) — ใช้ endpoint
// เดิมทุกอย่าง (categories/export-woocommerce, categories/import-woocommerce)
// ไม่มีการแก้ backend เลย แค่ย้าย UI มาไว้ที่มาสเตอร์ > มาร์เก็ตเพลส > WooCommerce
// ตรงๆ แทน
type WoocommerceFilter = 'all' | 'leaf' | 'parent' | 'flagged';

interface MappedCategory {
    id: number;
    name: string;
}

interface WoocommerceRow {
    id: number;
    name: string;
    path: string;
    leaf: boolean;
    mapped_categories: MappedCategory[];
}

interface WoocommerceBrandRow {
    id: number;
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

interface Props {
    categories: PaginatedData<WoocommerceRow>;
    stats: { total: number; leaf: number; parent: number; mapped: number };
    lastSyncedAt: string | null;
    filters: { filter: WoocommerceFilter; search: string; per_page: number };
}

/** สิ่งที่การแก้ไขที่ยังไม่บันทึกเตรียมไว้สำหรับ PIM category id หนึ่งตัว: `null` คือล้าง mapping กับ WooCommerce ทิ้ง ส่วนถ้าเป็น object คือชี้ไปที่ WooCommerce node ตัวใหม่ (อาจเป็นคนละตัวกับเดิม) ใช้ PIM category id เป็น key ไม่ใช่ WooCommerce id — เพราะนั่นคือสิ่งที่ bulkMapWoocommerce() บันทึกจริงๆ */
interface PendingAssignment {
    woocommerceId: number;
    pimName: string;
}

export default function WoocommerceCategoryMapping({ categories, stats, lastSyncedAt, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEditBrands = permissions.includes('brands.edit_brands');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('marketplaceSyncTitle'), href: '/catalog/categories/marketplace-sync' },
        { title: t('woocommerceMappingTitle'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<WoocommerceFilter>(filters.filter ?? 'leaf');
    const [perPage, setPerPage] = useState<number>(categories.per_page ?? 25);
    const [pending, setPending] = useState<Record<number, PendingAssignment | null>>({});
    const [assigningFor, setAssigningFor] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [syncingCategories, setSyncingCategories] = useState(false);
    const [importingCategories, setImportingCategories] = useState(false);
    const firstRender = useRef(true);

    const runCategorySync = () => {
        setSyncingCategories(true);
        router.post('/catalog/categories/sync-woocommerce', {}, { preserveScroll: true, onFinish: () => setSyncingCategories(false) });
    };

    // ดาวน์โหลด/นำเข้า CSV หมวดหมู่ PIM — คนละกลไกกับ "sync categories" ด้านบน
    // ("sync categories" ดึงต้นไม้หมวดหมู่จาก WooCommerce API มาเก็บไว้ที่ตาราง
    // staging woocommerce_categories สำหรับ map เข้ากับหมวดหมู่ PIM ที่มีอยู่แล้ว
    // ส่วนตัวนี้ export/import หมวดหมู่ PIM เองเป็นไฟล์ CSV ตรงๆ — ใช้เวลาต้องการ
    // แก้ไข/สร้างหมวดหมู่ PIM จำนวนมากนอก UI แล้วนำเข้ากลับมา)
    const runCategoryImport = () => {
        setImportingCategories(true);
        router.post('/catalog/categories/import-woocommerce', {}, { onFinish: () => setImportingCategories(false) });
    };

    // ---- WooCommerce Brands ----
    const [woocommerceBrands, setWoocommerceBrands] = useState<PaginatedData<WoocommerceBrandRow> | null>(null);
    const [loadingWoocommerceBrands, setLoadingWoocommerceBrands] = useState(false);
    const [woocommerceBrandSearch, setWoocommerceBrandSearch] = useState('');
    const [woocommerceBrandPerPage, setWoocommerceBrandPerPage] = useState(25);
    const [savingWoocommerceBrandId, setSavingWoocommerceBrandId] = useState<number | null>(null);
    const [woocommerceBrandSyncing, setWoocommerceBrandSyncing] = useState(false);
    const [woocommerceBrandSyncMessage, setWoocommerceBrandSyncMessage] = useState('');
    const firstWoocommerceBrandSearchRender = useRef(true);

    const loadWoocommerceBrands = (opts: { search?: string; page?: number; perPage?: number } = {}) => {
        const params = new URLSearchParams({
            search: opts.search ?? woocommerceBrandSearch,
            page: String(opts.page ?? 1),
            per_page: String(opts.perPage ?? woocommerceBrandPerPage),
        });

        setLoadingWoocommerceBrands(true);
        fetch(`/catalog/categories/woocommerce-mapping/woocommerce-brands?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [], current_page: 1, last_page: 1, per_page: 25, total: 0 }))
            .then((body: PaginatedData<WoocommerceBrandRow>) => setWoocommerceBrands(body))
            .finally(() => setLoadingWoocommerceBrands(false));
    };

    useEffect(() => {
        if (canEditBrands) loadWoocommerceBrands({ page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (firstWoocommerceBrandSearchRender.current) {
            firstWoocommerceBrandSearchRender.current = false;
            return;
        }

        const timeout = setTimeout(() => loadWoocommerceBrands({ search: woocommerceBrandSearch, page: 1 }), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [woocommerceBrandSearch]);

    const handleWoocommerceBrandPerPageChange = (value: number) => {
        setWoocommerceBrandPerPage(value);
        loadWoocommerceBrands({ page: 1, perPage: value });
    };

    const goToWoocommerceBrandPage = (page: number) => {
        loadWoocommerceBrands({ page });
    };

    // การ sync แบรนด์ของ WooCommerce เองทำงานแบบ synchronous (mode: 'sync' —
    // endpoint Product Brands ของมัน return ข้อมูลทั้งหมดมาแค่ไม่กี่หน้า) — แค่ POST
    // ธรรมดา + onFinish สไตล์ Inertia ก็พอ ไม่ต้องมี JobTracker/polling แบบที่
    // queued brand sync ของ Shopee/Lazada/TikTok ใช้
    const triggerWoocommerceBrandSync = () => {
        setWoocommerceBrandSyncing(true);
        setWoocommerceBrandSyncMessage('');
        router.post(
            '/catalog/brands/sync-woocommerce',
            {},
            {
                preserveScroll: true,
                onFinish: () => {
                    setWoocommerceBrandSyncing(false);
                    loadWoocommerceBrands({ page: 1 });
                },
            },
        );
    };

    // `optionId` คือแถว PIM AttributeOption ที่จะถูกเขียนค่าลงไปจริงๆ
    // (attribute_options.woocommerce_brand_id) — ถ้าเป็นการจับคู่ใหม่ ก็คือ id ของ
    // แบรนด์ PIM ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม ก็คือ PIM id ของ mapping
    // เดิมนั้น ไม่ใช่อะไรที่คำนวณมาจาก `woocommerceBrandId` ส่วน `display` คือสิ่งที่จะ
    // โชว์ในแถวหลังจากนั้น
    const persistWoocommerceBrand = (
        woocommerceBrandId: number,
        optionId: number,
        newWoocommerceId: number | null,
        display: { id: number; name: string } | null,
    ) => {
        setSavingWoocommerceBrandId(woocommerceBrandId);
        fetch('/catalog/brands/woocommerce-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings: [{ option_id: optionId, marketplace_brand_id: newWoocommerceId }] }),
        })
            .then((res) => {
                if (!res.ok) return;
                setWoocommerceBrands((prev) =>
                    prev ? { ...prev, data: prev.data.map((b) => (b.id === woocommerceBrandId ? { ...b, mapped: display } : b)) } : prev,
                );
            })
            .finally(() => setSavingWoocommerceBrandId(null));
    };

    const assignWoocommerceBrand = (woocommerceBrandId: number, pimBrand: PimBrandOption) => {
        persistWoocommerceBrand(woocommerceBrandId, pimBrand.id, woocommerceBrandId, { id: pimBrand.id, name: pimBrand.name });
    };

    const clearWoocommerceBrand = (woocommerceBrandId: number, currentPimOptionId: number) => {
        persistWoocommerceBrand(woocommerceBrandId, currentPimOptionId, null, null);
    };

    // ทุกครั้งที่มีการ navigate (เปลี่ยนหน้า/filter/search หรือบันทึกเสร็จ) เราจะได้
    // prop `categories` ชุดใหม่มา — การเลือกที่ยังค้างอยู่จากชุดแถวเดิมใช้ไม่ได้แล้ว
    // เลยต้องล้างทิ้ง ไม่งั้นมันจะหลุดไปปนกับการบันทึกครั้งถัดไป
    useEffect(() => {
        setPending({});
        setAssigningFor(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories]);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/categories/woocommerce-mapping', { search, filter, per_page: perPage }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const applyFilter = (value: WoocommerceFilter) => {
        setFilter(value);
        router.get('/catalog/categories/woocommerce-mapping', { search, filter: value, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categories/woocommerce-mapping', { search, filter, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/categories/woocommerce-mapping', { search, filter, per_page: perPage, page }, { preserveState: true });
    };

    const currentPage = categories.current_page ?? 1;
    const lastPage = categories.last_page ?? 1;
    const pendingCount = Object.keys(pending).length;

    const stageClear = (pimId: number) => {
        setPending((prev) => ({ ...prev, [pimId]: null }));
    };

    const undoPending = (pimId: number) => {
        setPending((prev) => {
            const next = { ...prev };
            delete next[pimId];
            return next;
        });
    };

    const stageAssign = (row: WoocommerceRow, pimCategory: CategoryOption) => {
        setPending((prev) => ({ ...prev, [pimCategory.id]: { woocommerceId: row.id, pimName: pimCategory.name } }));
        setAssigningFor(null);
    };

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([pimId, assignment]) => ({
            category_id: Number(pimId),
            woocommerce_category_id: assignment ? assignment.woocommerceId : null,
        }));

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post('/catalog/categories/woocommerce-mapping', { mappings }, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    // แถวหนึ่งจะถูกนับเป็น "pending" (ไฮไลต์ด้วยเส้นประ) ได้ทั้งสองทาง: กำลังจะล้าง/
    // ย้าย mapping PIM เดิมของมันออกไป หรือกำลังจะมีการจับคู่ใหม่จาก PIM category
    // อื่นเข้ามาลงตรงนี้
    const rowHasPendingChange = (row: WoocommerceRow) =>
        row.mapped_categories.some((pc) => pc.id in pending) || Object.values(pending).some((assignment) => assignment?.woocommerceId === row.id);

    const columns: FioriResponsiveColumn<WoocommerceRow>[] = [
        {
            key: 'id',
            header: t('idColumn'),
            priority: 'high',
            align: 'right',
            width: 100,
            render: (row) => (
                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                    {row.id}
                </Typography>
            ),
        },
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 220,
            render: (row) => <Typography fontWeight={600}>{row.name}</Typography>,
        },
        {
            key: 'path',
            header: t('pathColumn'),
            priority: 'medium',
            minWidth: 260,
            render: (row) => (
                <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                    {row.path}
                </Typography>
            ),
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'medium',
            render: (row) => (
                <Chip
                    label={row.leaf ? t('leafLabel') : t('parentLabel')}
                    size="small"
                    sx={{
                        bgcolor: row.leaf ? FIORI.successBg : FIORI.neutralBg,
                        color: row.leaf ? FIORI.success : FIORI.textSecondary,
                        fontWeight: 600,
                    }}
                />
            ),
        },
        {
            key: 'mapping',
            header: t('mappingColumn'),
            priority: 'high',
            minWidth: 320,
            render: (row) => {
                if (!row.leaf) {
                    return (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            {t('notMappableParent')}
                        </Typography>
                    );
                }

                const existingIds = new Set(row.mapped_categories.map((c) => c.id));

                // ทุกอย่างที่ mapping กับ WooCommerce node นี้อยู่ตอนนี้ รวมเข้ากับ
                // การแก้ไขที่ยังค้างอยู่ของ PIM category เดียวกัน — รวมถึงกรณีที่ย้าย
                // ไปที่อื่นด้วย ซึ่งต้อง render ตรงนี้เป็น "will clear" เหมือนกัน
                const existingChips = row.mapped_categories.map((pc) => {
                    const staged = pending[pc.id];
                    if (staged === undefined) {
                        return (
                            <Chip
                                key={pc.id}
                                label={pc.name}
                                size="small"
                                onDelete={() => stageClear(pc.id)}
                                deleteIcon={<CloseIcon fontSize="small" />}
                                sx={mappedChipSx}
                            />
                        );
                    }

                    const label =
                        staged && staged.woocommerceId === row.id ? `${t('willMapTo')}: ${pc.name}` : `${t('willClearMapping')}: ${pc.name}`;
                    return (
                        <Chip
                            key={pc.id}
                            label={label}
                            size="small"
                            variant="outlined"
                            onDelete={() => undoPending(pc.id)}
                            deleteIcon={<CloseIcon fontSize="small" />}
                            sx={pendingChipSx}
                        />
                    );
                });

                // PIM category ที่ยังไม่อยู่ในลิสต์นี้ แต่ถูกเตรียมไว้ (จากแถวของมันเองที่
                // อื่นในหน้านี้) ให้ย้ายมาอยู่ตรงนี้
                const newlyAssigned = Object.entries(pending)
                    .filter((entry): entry is [string, PendingAssignment] => {
                        const [pimId, assignment] = entry;
                        return assignment !== null && assignment.woocommerceId === row.id && !existingIds.has(Number(pimId));
                    })
                    .map(([pimId, assignment]) => (
                        <Chip
                            key={pimId}
                            label={`${t('willMapTo')}: ${assignment.pimName}`}
                            size="small"
                            variant="outlined"
                            onDelete={() => undoPending(Number(pimId))}
                            deleteIcon={<CloseIcon fontSize="small" />}
                            sx={pendingChipSx}
                        />
                    ));

                const hasChips = existingChips.length > 0 || newlyAssigned.length > 0;

                return (
                    <Box>
                        {hasChips && (
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                {existingChips}
                                {newlyAssigned}
                            </Stack>
                        )}

                        {assigningFor === row.id ? (
                            <Box sx={{ maxWidth: 360 }}>
                                <CategoryPicker
                                    value={null}
                                    onChange={(val) => val && stageAssign(row, val)}
                                    placeholder={t('searchPimCategoryPlaceholder')}
                                />
                            </Box>
                        ) : (
                            <Button size="small" onClick={() => setAssigningFor(row.id)} sx={{ textTransform: 'none', px: 0 }}>
                                {t('assignPimCategory')}
                            </Button>
                        )}
                    </Box>
                );
            },
        },
    ];

    const woocommerceBrandColumns: FioriResponsiveColumn<WoocommerceBrandRow>[] = [
        {
            key: 'id',
            header: t('idColumn'),
            priority: 'high',
            align: 'right',
            width: 120,
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
                            disabled={savingWoocommerceBrandId === brand.id}
                            onChange={(val) => {
                                if (val) {
                                    assignWoocommerceBrand(brand.id, val);
                                } else if (brand.mapped) {
                                    clearWoocommerceBrand(brand.id, brand.mapped.id);
                                }
                            }}
                            placeholder={t('searchPimBrandPlaceholder')}
                        />
                    </Box>
                    {savingWoocommerceBrandId === brand.id && <CircularProgress size={14} />}
                </Stack>
            ),
        },
    ];

    const statTiles = [
        { label: t('statTotalCategories'), value: stats.total },
        { label: t('statLeafCategories'), value: stats.leaf },
        { label: t('statParentCategories'), value: stats.parent },
        { label: t('statMappedCategories'), value: stats.mapped, accent: true },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('woocommerceMappingTitle')} />
            <Box sx={{ p: 4 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
                    <Box>
                        <Button
                            size="small"
                            startIcon={<ArrowBackIcon fontSize="small" />}
                            onClick={() => router.visit('/catalog/categories/marketplace-sync')}
                            sx={{ textTransform: 'none', mb: 1, color: 'text.secondary' }}
                        >
                            {t('marketplaceSyncTitle')}
                        </Button>
                        <Typography variant="h4" fontWeight={700}>
                            {t('woocommerceMappingTitle')}
                        </Typography>
                        <Divider sx={{ my: 2 }} />
                        <Typography color="text.secondary">
                            {t('leafCategoriesMapped', { mapped: stats.mapped, total: stats.leaf })}
                            {lastSyncedAt ? ` · ${t('lastSyncedAt', { datetime: new Date(lastSyncedAt).toLocaleString() })}` : ''}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon fontSize="small" />}
                            component="a"
                            href="/catalog/categories/export-woocommerce"
                            sx={{ textTransform: 'none' }}
                        >
                            {t('exportCategoriesCsv')}
                        </Button>
                        <Button
                            variant="outlined"
                            disabled={importingCategories}
                            startIcon={importingCategories ? <CircularProgress size={16} /> : <SystemUpdateAltIcon fontSize="small" />}
                            onClick={runCategoryImport}
                            sx={{ textTransform: 'none' }}
                        >
                            {importingCategories ? t('importingCategories') : t('importAsPimCategories')}
                        </Button>
                        <Button
                            variant="outlined"
                            disabled={syncingCategories}
                            startIcon={syncingCategories ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
                            onClick={runCategorySync}
                            sx={{ textTransform: 'none' }}
                        >
                            {syncingCategories ? t('syncingLazada') : t('syncCategories')}
                        </Button>
                        <Button
                            variant="contained"
                            disabled={pendingCount === 0 || saving}
                            onClick={saveChanges}
                            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                            sx={solidActionSx}
                        >
                            {t('saveChanges')}
                            {pendingCount > 0 ? ` (${pendingCount})` : ''}
                        </Button>
                    </Stack>
                </Stack>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
                        gap: '1px',
                        bgcolor: FIORI.border,
                        border: `1px solid ${FIORI.border}`,
                        borderRadius: '10px',
                        overflow: 'hidden',
                        mb: 3,
                    }}
                >
                    {statTiles.map((tile) => (
                        <Box key={tile.label} sx={{ bgcolor: FIORI.surface, p: 2 }}>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: FIORI.textSecondary,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.06em',
                                    display: 'block',
                                }}
                            >
                                {tile.label}
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: 26,
                                    fontWeight: 700,
                                    fontVariantNumeric: 'tabular-nums',
                                    color: tile.accent ? FIORI.brand : FIORI.textPrimary,
                                    mt: 0.25,
                                }}
                            >
                                {tile.value.toLocaleString()}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                    <TextField
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('searchCategories')}
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
                        <ToggleButtonGroup
                            value={filter}
                            exclusive
                            size="small"
                            onChange={(_event, value: WoocommerceFilter | null) => value && applyFilter(value)} sx={fioriToggleButtonGroupSx}
                        >
                            <ToggleButton value="all">{t('statusAll')}</ToggleButton>
                            <ToggleButton value="leaf">{t('leafOnly')}</ToggleButton>
                            <ToggleButton value="parent">{t('parentOnly')}</ToggleButton>
                            <ToggleButton value="flagged">{t('flaggedOnly')}</ToggleButton>
                        </ToggleButtonGroup>

                        <Select
                            value={perPage}
                            onChange={(e) => handlePerPageChange(Number(e.target.value))}
                            size="small"
                            sx={{ minWidth: 60, height: 36 }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                            <MenuItem value={100}>100</MenuItem>
                        </Select>
                        <Typography variant="body2" color="text.secondary">
                            {tGrid('perPage')}
                        </Typography>

                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2">{currentPage}</Typography>
                        </Paper>
                        <Typography variant="body2" color="text.secondary">
                            {tGrid('pageOf', { lastPage })}
                        </Typography>

                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                                <FirstPageIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                <LastPageIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                <FioriResponsiveTable
                    columns={columns}
                    rows={categories.data}
                    getRowKey={(row) => row.id}
                    rowSx={(row) => pendingRowSx(rowHasPendingChange(row))}
                    emptyMessage={t('noCategoriesFound')}
                />

                {canEditBrands && (
                    <>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 5, mb: 2 }}>
                            <Typography variant="h6" fontWeight={700}>
                                {t('woocommerceBrandsSectionTitle')}
                            </Typography>

                            <Stack direction="row" spacing={1.5} alignItems="center">
                                {woocommerceBrandSyncMessage && (
                                    <Typography variant="caption" color="text.secondary">
                                        {woocommerceBrandSyncMessage}
                                    </Typography>
                                )}
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={woocommerceBrandSyncing}
                                    startIcon={woocommerceBrandSyncing ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                                    onClick={triggerWoocommerceBrandSync}
                                    sx={{ textTransform: 'none' }}
                                >
                                    {woocommerceBrandSyncing ? t('syncingBrands') : t('syncBrands')}
                                </Button>
                            </Stack>
                        </Stack>

                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                            <TextField
                                value={woocommerceBrandSearch}
                                onChange={(event) => setWoocommerceBrandSearch(event.target.value)}
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
                                {loadingWoocommerceBrands && <CircularProgress size={18} />}

                                <Select
                                    value={woocommerceBrandPerPage}
                                    onChange={(e) => handleWoocommerceBrandPerPageChange(Number(e.target.value))}
                                    size="small"
                                    sx={{ minWidth: 60, height: 36 }}
                                >
                                    <MenuItem value={10}>10</MenuItem>
                                    <MenuItem value={25}>25</MenuItem>
                                    <MenuItem value={50}>50</MenuItem>
                                    <MenuItem value={100}>100</MenuItem>
                                </Select>
                                <Typography variant="body2" color="text.secondary">
                                    {tGrid('perPage')}
                                </Typography>

                                <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center' }}>
                                    <Typography variant="body2">{woocommerceBrands?.current_page ?? 1}</Typography>
                                </Paper>
                                <Typography variant="body2" color="text.secondary">
                                    {tGrid('pageOf', { lastPage: woocommerceBrands?.last_page ?? 1 })}
                                </Typography>

                                <Stack direction="row" spacing={0.2}>
                                    <IconButton
                                        size="small"
                                        disabled={(woocommerceBrands?.current_page ?? 1) <= 1}
                                        onClick={() => goToWoocommerceBrandPage(1)}
                                    >
                                        <FirstPageIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        disabled={(woocommerceBrands?.current_page ?? 1) <= 1}
                                        onClick={() => goToWoocommerceBrandPage((woocommerceBrands?.current_page ?? 1) - 1)}
                                    >
                                        <ChevronLeftIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        disabled={(woocommerceBrands?.current_page ?? 1) >= (woocommerceBrands?.last_page ?? 1)}
                                        onClick={() => goToWoocommerceBrandPage((woocommerceBrands?.current_page ?? 1) + 1)}
                                    >
                                        <ChevronRightIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        disabled={(woocommerceBrands?.current_page ?? 1) >= (woocommerceBrands?.last_page ?? 1)}
                                        onClick={() => goToWoocommerceBrandPage(woocommerceBrands?.last_page ?? 1)}
                                    >
                                        <LastPageIcon fontSize="small" />
                                    </IconButton>
                                </Stack>
                            </Stack>
                        </Stack>

                        <FioriResponsiveTable
                            columns={woocommerceBrandColumns}
                            rows={woocommerceBrands?.data ?? []}
                            getRowKey={(brand) => brand.id}
                            emptyMessage={loadingWoocommerceBrands ? <CircularProgress size={20} /> : t('noBrandsFound')}
                        />
                    </>
                )}
            </Box>
        </AppLayout>
    );
}
