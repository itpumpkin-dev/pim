import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import CancelIcon from '@mui/icons-material/Cancel';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
import { CategoryPicker, type CategoryOption } from '@/components/catalog/category-picker';
import { PimAttributePicker, type PimAttributeOption } from '@/components/catalog/pim-attribute-picker';
import { PimBrandPicker, type PimBrandOption } from '@/components/catalog/pim-brand-picker';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { xsrfToken } from '@/lib/csrf';
import { FIORI, fioriSearchFieldSx } from '@/lib/fiori-style';
import { mappedChipSx, pendingChipSx, pendingRowSx, solidActionSx } from '@/lib/ui-style';

// ใช้ตารางแบบ marketplace-tree-row-centric เหมือนกับ categories/shopee-mapping.tsx/
// categories/lazada-mapping.tsx (ดู docblock ของ CategoryController::tiktokMapping())
// รวมถึงส่วน detail "Brands"/"Attributes" แบบเดียวกันด้วย — brand catalog ของ
// TikTok เป็น global เหมือน Lazada (ไม่มีมิติหมวดหมู่) แต่ attribute schema ผูกกับ
// หมวดหมู่เหมือนของ Shopee เลยทำให้ส่วน Attributes ด้านล่างเลียนแบบรูปแบบของหน้านั้นแทน
type TikTokFilter = 'all' | 'leaf' | 'parent' | 'flagged';

interface MappedCategory {
    id: number;
    name: string;
}

interface TikTokRow {
    id: number;
    name: string;
    name_th: string | null;
    path: string;
    path_th: string | null;
    leaf: boolean;
    mapped_categories: MappedCategory[];
}

// `id` เป็น string ไม่ใช่ number — เพราะ brand id ของ TikTok เองเป็นเลข 19 หลัก
// สไตล์ snowflake ซึ่งจะเสีย precision ทันทีที่ JSON.parse ของ JS แตะเข้าไปเกิน
// Number.MAX_SAFE_INTEGER (ดู docblock ของ BrandController::tiktokBrandsList()
// — เจอจริงกับข้อมูลจริงมาแล้ว) ส่วน category id ไม่มีปัญหานี้ (เอกสารของ TikTok เอง
// ก็โชว์เป็นเลขน้อยๆ เช่น "600002") เลยทำให้ TikTokRow.id ด้านบนยังคงเป็น
// number ธรรมดาได้
interface TikTokBrandRow {
    id: string;
    name: string;
    mapped: { id: number; name: string } | null;
}

interface TikTokAttributeRow {
    // ใช้ `id` เป็น key ซึ่งเป็น string — ดู docblock ของ TikTokAttribute ประกอบ
    id: string;
    name: string;
    is_customizable: boolean;
    mandatory: boolean;
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
    categories: PaginatedData<TikTokRow>;
    stats: { total: number; leaf: number; parent: number; mapped: number };
    lastSyncedAt: string | null;
    filters: { filter: TikTokFilter; search: string; per_page: number };
}

/** สิ่งที่การแก้ไขที่ยังไม่บันทึกเตรียมไว้สำหรับ PIM category id หนึ่งตัว: `null` คือล้าง mapping กับ TikTok ทิ้ง ส่วนถ้าเป็น object คือชี้ไปที่ TikTok node ตัวใหม่ (อาจเป็นคนละตัวกับเดิม) ใช้ PIM category id เป็น key ไม่ใช่ TikTok id — เพราะนั่นคือสิ่งที่ bulkMapTiktok() บันทึกจริงๆ */
interface PendingAssignment {
    tiktokId: number;
    pimName: string;
}

export default function TikTokCategoryMapping({ categories, stats, lastSyncedAt, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEditBrands = permissions.includes('brands.edit_brands');
    const canEditAttributes = permissions.includes('attributes.edit_attributes');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('marketplaceSyncTitle'), href: '/catalog/categories/marketplace-sync' },
        { title: t('tiktokMappingTitle'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<TikTokFilter>(filters.filter ?? 'leaf');
    const [perPage, setPerPage] = useState<number>(categories.per_page ?? 25);
    const [pending, setPending] = useState<Record<number, PendingAssignment | null>>({});
    const [assigningFor, setAssigningFor] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [syncingCategories, setSyncingCategories] = useState(false);
    const firstRender = useRef(true);

    // ขับเคลื่อนตาราง TikTok Attributes ด้านล่าง (ผูกกับหมวดหมู่ เหมือนของ Shopee)
    // — ส่วนตาราง TikTok Brands ไม่ต้องใช้ตัวนี้เลย เพราะ brand catalog ของ TikTok
    // ไม่มีมิติหมวดหมู่ (ดู state ของส่วนนั้นด้านล่างประกอบ)
    const [selectedCategory, setSelectedCategory] = useState<TikTokRow | null>(null);

    const runCategorySync = () => {
        setSyncingCategories(true);
        router.post('/catalog/categories/sync-tiktok', {}, { preserveScroll: true, onFinish: () => setSyncingCategories(false) });
    };

    // ---- TikTok Brands (global — ดู docblock ของ TikTokBrandRow ประกอบ) ----
    const [tiktokBrands, setTiktokBrands] = useState<PaginatedData<TikTokBrandRow> | null>(null);
    const [loadingTiktokBrands, setLoadingTiktokBrands] = useState(false);
    const [tiktokBrandSearch, setTiktokBrandSearch] = useState('');
    const [tiktokBrandPerPage, setTiktokBrandPerPage] = useState(25);
    const [savingTiktokBrandId, setSavingTiktokBrandId] = useState<string | null>(null);
    const [tiktokBrandSyncing, setTiktokBrandSyncing] = useState(false);
    const [tiktokBrandSyncMessage, setTiktokBrandSyncMessage] = useState('');
    const [activeTiktokBrandJobTrackerId, setActiveTiktokBrandJobTrackerId] = useState<number | null>(null);
    const tiktokBrandPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstTiktokBrandSearchRender = useRef(true);

    useEffect(() => {
        return () => {
            if (tiktokBrandPollTimer.current) clearTimeout(tiktokBrandPollTimer.current);
        };
    }, []);

    const loadTiktokBrands = (opts: { search?: string; page?: number; perPage?: number } = {}) => {
        const params = new URLSearchParams({
            search: opts.search ?? tiktokBrandSearch,
            page: String(opts.page ?? 1),
            per_page: String(opts.perPage ?? tiktokBrandPerPage),
        });

        setLoadingTiktokBrands(true);
        fetch(`/catalog/categories/tiktok-mapping/tiktok-brands?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [], current_page: 1, last_page: 1, per_page: 25, total: 0 }))
            .then((body: PaginatedData<TikTokBrandRow>) => setTiktokBrands(body))
            .finally(() => setLoadingTiktokBrands(false));
    };

    // โหลดครั้งเดียวตอน mount — ต่างจากตาราง Brands ของ Shopee ตรงนี้ไม่ต้องเลือก
    // หมวดหมู่ก่อนถึงจะโหลดได้ (brand catalog ของ TikTok ไม่มีมิติหมวดหมู่เลย
    // เหมือนกับของ Lazada)
    useEffect(() => {
        if (canEditBrands) loadTiktokBrands({ page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (firstTiktokBrandSearchRender.current) {
            firstTiktokBrandSearchRender.current = false;
            return;
        }

        const timeout = setTimeout(() => loadTiktokBrands({ search: tiktokBrandSearch, page: 1 }), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tiktokBrandSearch]);

    const handleTiktokBrandPerPageChange = (value: number) => {
        setTiktokBrandPerPage(value);
        loadTiktokBrands({ page: 1, perPage: value });
    };

    const goToTiktokBrandPage = (page: number) => {
        loadTiktokBrands({ page });
    };

    const pollTiktokBrandSync = (jobTrackerId: number) => {
        fetch(`/catalog/brands/sync-jobs/${jobTrackerId}/status`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setTiktokBrandSyncing(false);
                    setTiktokBrandSyncMessage(body.message ?? 'Could not check sync status.');
                    setActiveTiktokBrandJobTrackerId(null);
                    return;
                }

                if (body.status === 'completed') {
                    setTiktokBrandSyncing(false);
                    setActiveTiktokBrandJobTrackerId(null);
                    setTiktokBrandSyncMessage(t('brandsSyncedCount', { count: body.total_records_created ?? 0 }));
                    loadTiktokBrands({ page: 1 });
                    return;
                }

                if (body.status === 'failed' || body.status === 'cancelled') {
                    setTiktokBrandSyncing(false);
                    setActiveTiktokBrandJobTrackerId(null);
                    setTiktokBrandSyncMessage(body.error_log?.[0]?.message ?? 'Sync failed.');
                    return;
                }

                tiktokBrandPollTimer.current = setTimeout(() => pollTiktokBrandSync(jobTrackerId), 2000);
            })
            .catch(() => {
                setTiktokBrandSyncing(false);
                setActiveTiktokBrandJobTrackerId(null);
                setTiktokBrandSyncMessage('Network error while checking sync status.');
            });
    };

    const triggerTiktokBrandSync = () => {
        setTiktokBrandSyncing(true);
        setTiktokBrandSyncMessage('');

        fetch('/catalog/brands/sync-tiktok', {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_tracker_id) {
                    setTiktokBrandSyncing(false);
                    setTiktokBrandSyncMessage(body.message ?? 'Could not start sync.');
                    return;
                }

                setActiveTiktokBrandJobTrackerId(body.job_tracker_id);
                pollTiktokBrandSync(body.job_tracker_id);
            })
            .catch(() => {
                setTiktokBrandSyncing(false);
                setTiktokBrandSyncMessage('Network error while starting sync.');
            });
    };

    const cancelTiktokBrandSync = () => {
        if (!activeTiktokBrandJobTrackerId) return;

        fetch(`/catalog/brands/sync-jobs/${activeTiktokBrandJobTrackerId}/cancel`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        }).catch(() => setTiktokBrandSyncMessage('Network error while cancelling sync.'));
    };

    // `optionId` คือแถว PIM AttributeOption ที่จะถูกเขียนค่าลงไปจริงๆ
    // (attribute_options.tiktok_brand_id) — ถ้าเป็นการจับคู่ใหม่ ก็คือ id ของแบรนด์ PIM
    // ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม ก็คือ PIM id ของ mapping เดิมนั้น
    // ไม่ใช่อะไรที่คำนวณมาจาก `tiktokBrandId` ส่วน `display` คือสิ่งที่จะโชว์ในแถวหลังจากนั้น
    // รูปแบบเดียวกับ persistBrand() ของ ShopeeCategoryMapping/LazadaCategoryMapping
    const persistTiktokBrand = (tiktokBrandId: string, optionId: number, newTiktokId: string | null, display: { id: number; name: string } | null) => {
        setSavingTiktokBrandId(tiktokBrandId);
        fetch('/catalog/brands/tiktok-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings: [{ option_id: optionId, marketplace_brand_id: newTiktokId }] }),
        })
            .then((res) => {
                if (!res.ok) return;
                setTiktokBrands((prev) =>
                    prev ? { ...prev, data: prev.data.map((b) => (b.id === tiktokBrandId ? { ...b, mapped: display } : b)) } : prev,
                );
            })
            .finally(() => setSavingTiktokBrandId(null));
    };

    const assignTiktokBrand = (tiktokBrandId: string, pimBrand: PimBrandOption) => {
        persistTiktokBrand(tiktokBrandId, pimBrand.id, tiktokBrandId, { id: pimBrand.id, name: pimBrand.name });
    };

    const clearTiktokBrand = (tiktokBrandId: string, currentPimOptionId: number) => {
        persistTiktokBrand(tiktokBrandId, currentPimOptionId, null, null);
    };

    // ---- TikTok Attributes (ผูกกับหมวดหมู่ เลียนแบบของ Shopee) ----
    const [tiktokAttributes, setTiktokAttributes] = useState<TikTokAttributeRow[] | null>(null);
    const [loadingTiktokAttributes, setLoadingTiktokAttributes] = useState(false);
    const [tiktokAttributeSyncing, setTiktokAttributeSyncing] = useState(false);
    const [tiktokAttributeSyncMessage, setTiktokAttributeSyncMessage] = useState('');
    const [savingTiktokAttributeId, setSavingTiktokAttributeId] = useState<string | null>(null);

    const loadTiktokAttributes = (tiktokCategoryId: number) => {
        setLoadingTiktokAttributes(true);
        fetch(`/catalog/categories/${tiktokCategoryId}/tiktok-attributes`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: TikTokAttributeRow[] }) => setTiktokAttributes(body.data))
            .finally(() => setLoadingTiktokAttributes(false));
    };

    useEffect(() => {
        setTiktokAttributes(null);
        setTiktokAttributeSyncMessage('');
        if (selectedCategory) loadTiktokAttributes(selectedCategory.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory?.id]);

    const triggerTiktokAttributeSync = () => {
        if (!selectedCategory) return;
        setTiktokAttributeSyncing(true);
        setTiktokAttributeSyncMessage('');

        fetch('/catalog/categories/tiktok-mapping/sync-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ tiktok_category_id: selectedCategory.id }),
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setTiktokAttributeSyncMessage(body.message ?? 'Could not sync attributes.');
                    return;
                }

                setTiktokAttributeSyncMessage(t('attributesSyncedCount', { count: body.count ?? 0 }));
                loadTiktokAttributes(selectedCategory.id);
            })
            .catch(() => setTiktokAttributeSyncMessage('Network error while syncing attributes.'))
            .finally(() => setTiktokAttributeSyncing(false));
    };

    // `pimAttributeId` คือแถว PIM Attribute ที่จะถูกเขียนค่าลงไปจริงๆ — ถ้าเป็นการ
    // จับคู่ใหม่ ก็คือ id ของ attribute PIM ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม
    // ก็คือ PIM id ของ mapping เดิมนั้น
    const persistTiktokAttribute = (
        tiktokAttributeId: string,
        pimAttributeId: number,
        targetField: 'tiktok_attribute' | null,
        display: { id: number; name: string } | null,
    ) => {
        setSavingTiktokAttributeId(tiktokAttributeId);
        fetch('/catalog/attributes/tiktok-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttributeId,
                        target_field: targetField,
                        tiktok_attribute_id: targetField ? tiktokAttributeId : null,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setTiktokAttributes((prev) =>
                    prev ? prev.map((a) => (a.id === tiktokAttributeId ? { ...a, mapped: display } : a)) : prev,
                );
            })
            .finally(() => setSavingTiktokAttributeId(null));
    };

    const assignTiktokAttribute = (tiktokAttributeId: string, pimAttribute: PimAttributeOption) => {
        persistTiktokAttribute(tiktokAttributeId, pimAttribute.id, 'tiktok_attribute', { id: pimAttribute.id, name: pimAttribute.name });
    };

    const clearTiktokAttribute = (tiktokAttributeId: string, currentPimAttributeId: number) => {
        persistTiktokAttribute(tiktokAttributeId, currentPimAttributeId, null, null);
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
            router.get('/catalog/categories/tiktok-mapping', { search, filter, per_page: perPage }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const applyFilter = (value: TikTokFilter) => {
        setFilter(value);
        router.get('/catalog/categories/tiktok-mapping', { search, filter: value, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categories/tiktok-mapping', { search, filter, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/categories/tiktok-mapping', { search, filter, per_page: perPage, page }, { preserveState: true });
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

    const stageAssign = (row: TikTokRow, pimCategory: CategoryOption) => {
        setPending((prev) => ({ ...prev, [pimCategory.id]: { tiktokId: row.id, pimName: pimCategory.name } }));
        setAssigningFor(null);
    };

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([pimId, assignment]) => ({
            category_id: Number(pimId),
            tiktok_category_id: assignment ? assignment.tiktokId : null,
        }));

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post('/catalog/categories/tiktok-mapping', { mappings }, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    // แถวหนึ่งจะถูกนับเป็น "pending" (ไฮไลต์ด้วยเส้นประ) ได้ทั้งสองทาง: กำลังจะล้าง/
    // ย้าย mapping PIM เดิมของมันออกไป หรือกำลังจะมีการจับคู่ใหม่จาก PIM category
    // อื่นเข้ามาลงตรงนี้
    const rowHasPendingChange = (row: TikTokRow) =>
        row.mapped_categories.some((pc) => pc.id in pending) || Object.values(pending).some((assignment) => assignment?.tiktokId === row.id);

    const columns: FioriResponsiveColumn<TikTokRow>[] = [
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
            render: (row) => (
                <Stack spacing={0}>
                    <Typography fontWeight={600}>{row.name}</Typography>
                    {row.name_th ? (
                        <Typography variant="caption" color="text.secondary">
                            {row.name_th}
                        </Typography>
                    ) : (
                        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            {t('noThaiName')}
                        </Typography>
                    )}
                </Stack>
            ),
        },
        {
            key: 'path',
            header: t('pathColumn'),
            priority: 'medium',
            minWidth: 260,
            render: (row) => (
                <Stack spacing={0}>
                    <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                        {row.path}
                    </Typography>
                    {row.path_th && (
                        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            {row.path_th}
                        </Typography>
                    )}
                </Stack>
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

                // ทุกอย่างที่ mapping กับ TikTok node นี้อยู่ตอนนี้ รวมเข้ากับการแก้ไข
                // ที่ยังค้างอยู่ของ PIM category เดียวกัน — รวมถึงกรณีที่ย้ายไปที่อื่น
                // ด้วย ซึ่งต้อง render ตรงนี้เป็น "will clear" เหมือนกัน
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

                    const label = staged && staged.tiktokId === row.id ? `${t('willMapTo')}: ${pc.name}` : `${t('willClearMapping')}: ${pc.name}`;
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
                        return assignment !== null && assignment.tiktokId === row.id && !existingIds.has(Number(pimId));
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
                                <CategoryPicker value={null} onChange={(val) => val && stageAssign(row, val)} placeholder={t('searchPimCategoryPlaceholder')} />
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

    const tiktokBrandColumns: FioriResponsiveColumn<TikTokBrandRow>[] = [
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
                            disabled={savingTiktokBrandId === brand.id}
                            onChange={(val) => {
                                if (val) {
                                    assignTiktokBrand(brand.id, val);
                                } else if (brand.mapped) {
                                    clearTiktokBrand(brand.id, brand.mapped.id);
                                }
                            }}
                            placeholder={t('searchPimBrandPlaceholder')}
                        />
                    </Box>
                    {savingTiktokBrandId === brand.id && <CircularProgress size={14} />}
                </Stack>
            ),
        },
    ];

    const tiktokAttributeColumns: FioriResponsiveColumn<TikTokAttributeRow>[] = [
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 200,
            render: (attribute) => (
                <Stack spacing={0.25} alignItems="flex-start">
                    <Typography fontWeight={600}>{attribute.name}</Typography>
                    {attribute.mandatory && (
                        <Chip label={t('mandatoryLabel')} size="small" sx={{ bgcolor: FIORI.warningBg, color: FIORI.warning, fontWeight: 600 }} />
                    )}
                </Stack>
            ),
        },
        {
            key: 'mapping',
            header: t('attributeMappingColumn'),
            priority: 'high',
            minWidth: 260,
            render: (attribute) => {
                if (!attribute.is_customizable) {
                    return (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            {t('notMappableTiktokAttribute')}
                        </Typography>
                    );
                }

                return (
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1, minWidth: 200 }}>
                            <PimAttributePicker
                                value={attribute.mapped}
                                disabled={savingTiktokAttributeId === attribute.id}
                                onChange={(val) => {
                                    if (val) {
                                        assignTiktokAttribute(attribute.id, val);
                                    } else if (attribute.mapped) {
                                        clearTiktokAttribute(attribute.id, attribute.mapped.id);
                                    }
                                }}
                                placeholder={t('searchPimAttributePlaceholder')}
                            />
                        </Box>
                        {savingTiktokAttributeId === attribute.id && <CircularProgress size={14} />}
                    </Stack>
                );
            },
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
            <Head title={t('tiktokMappingTitle')} />
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
                        <Typography variant="h4" fontWeight={700}>{t('tiktokMappingTitle')}</Typography><Divider sx={{ my: 2 }} />
                        <Typography color="text.secondary">
                            {t('leafCategoriesMapped', { mapped: stats.mapped, total: stats.leaf })}
                            {lastSyncedAt ? ` · ${t('lastSyncedAt', { datetime: new Date(lastSyncedAt).toLocaleString() })}` : ''}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1.5}>
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
                        {t('saveChanges')}{pendingCount > 0 ? ` (${pendingCount})` : ''}
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
                                sx={{ color: FIORI.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}
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
                            onChange={(_event, value: TikTokFilter | null) => value && applyFilter(value)}
                            sx={{
                                '& .MuiToggleButton-root': {
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    px: 1.5,
                                    color: FIORI.textSecondary,
                                    borderColor: FIORI.border,
                                    '&.Mui-selected': { bgcolor: FIORI.brand, color: '#fff', '&:hover': { bgcolor: FIORI.brandDark } },
                                },
                            }}
                        >
                            <ToggleButton value="all">{t('statusAll')}</ToggleButton>
                            <ToggleButton value="leaf">{t('leafOnly')}</ToggleButton>
                            <ToggleButton value="parent">{t('parentOnly')}</ToggleButton>
                            <ToggleButton value="flagged">{t('flaggedOnly')}</ToggleButton>
                        </ToggleButtonGroup>

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

                <FioriResponsiveTable
                    columns={columns}
                    rows={categories.data}
                    getRowKey={(row) => row.id}
                    onRowClick={(row) => row.leaf && setSelectedCategory(row)}
                    rowSx={(row) => ({
                        ...pendingRowSx(rowHasPendingChange(row)),
                        ...(row.id === selectedCategory?.id ? { bgcolor: FIORI.selected } : {}),
                        ...(row.leaf ? {} : { cursor: 'default' }),
                    })}
                    emptyMessage={t('noCategoriesFound')}
                />

                {canEditBrands && (
                    <>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 5, mb: 2 }}>
                            <Typography variant="h6" fontWeight={700}>{t('tiktokBrandsSectionTitle')}</Typography>

                            <Stack direction="row" spacing={1.5} alignItems="center">
                                {tiktokBrandSyncMessage && (
                                    <Typography variant="caption" color="text.secondary">{tiktokBrandSyncMessage}</Typography>
                                )}
                                <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={tiktokBrandSyncing}
                                    startIcon={tiktokBrandSyncing ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                                    onClick={triggerTiktokBrandSync}
                                    sx={{ textTransform: 'none' }}
                                >
                                    {tiktokBrandSyncing ? t('syncingBrands') : t('syncBrands')}
                                </Button>
                                {tiktokBrandSyncing && activeTiktokBrandJobTrackerId && (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        color="error"
                                        startIcon={<CancelIcon fontSize="small" />}
                                        onClick={cancelTiktokBrandSync}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {t('cancel')}
                                    </Button>
                                )}
                            </Stack>
                        </Stack>

                        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                            <TextField
                                value={tiktokBrandSearch}
                                onChange={(event) => setTiktokBrandSearch(event.target.value)}
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
                                {loadingTiktokBrands && <CircularProgress size={18} />}

                                <Select value={tiktokBrandPerPage} onChange={(e) => handleTiktokBrandPerPageChange(Number(e.target.value))} size="small" sx={{ minWidth: 60, height: 36 }}>
                                    <MenuItem value={10}>10</MenuItem>
                                    <MenuItem value={25}>25</MenuItem>
                                    <MenuItem value={50}>50</MenuItem>
                                    <MenuItem value={100}>100</MenuItem>
                                </Select>
                                <Typography variant="body2" color="text.secondary">{tGrid('perPage')}</Typography>

                                <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center' }}>
                                    <Typography variant="body2">{tiktokBrands?.current_page ?? 1}</Typography>
                                </Paper>
                                <Typography variant="body2" color="text.secondary">{tGrid('pageOf', { lastPage: tiktokBrands?.last_page ?? 1 })}</Typography>

                                <Stack direction="row" spacing={0.2}>
                                    <IconButton size="small" disabled={(tiktokBrands?.current_page ?? 1) <= 1} onClick={() => goToTiktokBrandPage(1)}><FirstPageIcon fontSize="small" /></IconButton>
                                    <IconButton size="small" disabled={(tiktokBrands?.current_page ?? 1) <= 1} onClick={() => goToTiktokBrandPage((tiktokBrands?.current_page ?? 1) - 1)}><ChevronLeftIcon fontSize="small" /></IconButton>
                                    <IconButton size="small" disabled={(tiktokBrands?.current_page ?? 1) >= (tiktokBrands?.last_page ?? 1)} onClick={() => goToTiktokBrandPage((tiktokBrands?.current_page ?? 1) + 1)}><ChevronRightIcon fontSize="small" /></IconButton>
                                    <IconButton size="small" disabled={(tiktokBrands?.current_page ?? 1) >= (tiktokBrands?.last_page ?? 1)} onClick={() => goToTiktokBrandPage(tiktokBrands?.last_page ?? 1)}><LastPageIcon fontSize="small" /></IconButton>
                                </Stack>
                            </Stack>
                        </Stack>

                        <FioriResponsiveTable
                            columns={tiktokBrandColumns}
                            rows={tiktokBrands?.data ?? []}
                            getRowKey={(brand) => brand.id}
                            emptyMessage={loadingTiktokBrands ? <CircularProgress size={20} /> : t('noBrandsFound')}
                        />
                    </>
                )}

                {canEditAttributes && (
                    <>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 5, mb: 2 }}>
                            <Typography variant="h6" fontWeight={700}>
                                {selectedCategory ? t('tiktokAttributesForCategory', { name: selectedCategory.name }) : t('tiktokAttributesSectionTitle')}
                            </Typography>

                            {selectedCategory && (
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    {tiktokAttributeSyncMessage && (
                                        <Typography variant="caption" color="text.secondary">{tiktokAttributeSyncMessage}</Typography>
                                    )}
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        disabled={tiktokAttributeSyncing}
                                        startIcon={tiktokAttributeSyncing ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                                        onClick={triggerTiktokAttributeSync}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {tiktokAttributeSyncing ? t('syncingAttributes') : t('syncAttributesForCategory')}
                                    </Button>
                                </Stack>
                            )}
                        </Stack>

                        {!selectedCategory ? (
                            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                                <Typography color="text.secondary">{t('selectCategoryPrompt')}</Typography>
                            </Paper>
                        ) : (
                            <FioriResponsiveTable
                                columns={tiktokAttributeColumns}
                                rows={tiktokAttributes ?? []}
                                getRowKey={(attribute) => attribute.id}
                                emptyMessage={loadingTiktokAttributes ? <CircularProgress size={20} /> : t('noAttributesInCategory')}
                            />
                        )}
                    </>
                )}
            </Box>
        </AppLayout>
    );
}
