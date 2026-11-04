import { CategoryPicker, type CategoryOption } from '@/components/catalog/category-picker';
import {
    LeafStatusTag,
    MappingChip,
    MappingFilterToggle,
    MappingLoading,
    MappingPage,
    MappingPageHeader,
    MappingPager,
    MappingPickerCell,
    MappingSearchInput,
    MappingSectionHeader,
    MappingStatTiles,
    MappingSyncButton,
    MappingToolbar,
    MappingToolbarGroup,
    mappingStyles,
} from '@/components/catalog/marketplace-mapping-ui';
import { PimBrandPicker, type PimBrandOption } from '@/components/catalog/pim-brand-picker';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { xsrfToken } from '@/lib/csrf';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/download-from-cloud.js';
import '@ui5/webcomponents-icons/dist/download.js';
import { Button } from '@ui5/webcomponents-react';
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

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    // แยกสิทธิ์ต่อแพลตฟอร์มแล้ว (marketplace_woocommerce.edit_brand_mapping_woocommerce)
    // — ไม่ได้พ่วงกับ brands.edit_brands ทั่วไปอีกต่อไป (ดู routes/catalog.php)
    const canEditBrands = permissions.includes('marketplace_woocommerce.edit_brand_mapping_woocommerce');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: 'WooCommerce', href: '/catalog/marketplace/woocommerce' },
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
            render: (row) => <span className={mappingStyles.mono}>{row.id}</span>,
        },
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 220,
            render: (row) => <span className={mappingStyles.primary}>{row.name}</span>,
        },
        {
            key: 'path',
            header: t('pathColumn'),
            priority: 'medium',
            minWidth: 260,
            render: (row) => <span className={mappingStyles.muted}>{row.path}</span>,
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'medium',
            render: (row) => <LeafStatusTag leaf={row.leaf} label={row.leaf ? t('leafLabel') : t('parentLabel')} />,
        },
        {
            key: 'mapping',
            header: t('mappingColumn'),
            priority: 'high',
            minWidth: 320,
            render: (row) => {
                if (!row.leaf) {
                    return <span className={mappingStyles.mutedBody}>{t('notMappableParent')}</span>;
                }

                const existingIds = new Set(row.mapped_categories.map((c) => c.id));

                // ทุกอย่างที่ mapping กับ WooCommerce node นี้อยู่ตอนนี้ รวมเข้ากับ
                // การแก้ไขที่ยังค้างอยู่ของ PIM category เดียวกัน — รวมถึงกรณีที่ย้าย
                // ไปที่อื่นด้วย ซึ่งต้อง render ตรงนี้เป็น "will clear" เหมือนกัน
                const existingChips = row.mapped_categories.map((pc) => {
                    const staged = pending[pc.id];
                    if (staged === undefined) {
                        return (
                            <MappingChip key={pc.id} label={pc.name} variant="mapped" onDelete={() => stageClear(pc.id)} deleteLabel={t('delete')} />
                        );
                    }

                    const label =
                        staged && staged.woocommerceId === row.id ? `${t('willMapTo')}: ${pc.name}` : `${t('willClearMapping')}: ${pc.name}`;
                    return <MappingChip key={pc.id} label={label} variant="pending" onDelete={() => undoPending(pc.id)} deleteLabel={t('cancel')} />;
                });

                // PIM category ที่ยังไม่อยู่ในลิสต์นี้ แต่ถูกเตรียมไว้ (จากแถวของมันเองที่
                // อื่นในหน้านี้) ให้ย้ายมาอยู่ตรงนี้
                const newlyAssigned = Object.entries(pending)
                    .filter((entry): entry is [string, PendingAssignment] => {
                        const [pimId, assignment] = entry;
                        return assignment !== null && assignment.woocommerceId === row.id && !existingIds.has(Number(pimId));
                    })
                    .map(([pimId, assignment]) => (
                        <MappingChip
                            key={pimId}
                            label={`${t('willMapTo')}: ${assignment.pimName}`}
                            variant="pending"
                            onDelete={() => undoPending(Number(pimId))}
                            deleteLabel={t('cancel')}
                        />
                    ));

                const hasChips = existingChips.length > 0 || newlyAssigned.length > 0;

                return (
                    <div>
                        {hasChips && (
                            <div className={mappingStyles.chipRow}>
                                {existingChips}
                                {newlyAssigned}
                            </div>
                        )}

                        {assigningFor === row.id ? (
                            <div style={{ maxWidth: 360 }}>
                                <CategoryPicker
                                    value={null}
                                    onChange={(val) => val && stageAssign(row, val)}
                                    placeholder={t('searchPimCategoryPlaceholder')}
                                />
                            </div>
                        ) : (
                            <Button design="Transparent" icon="add" onClick={() => setAssigningFor(row.id)}>
                                {t('assignPimCategory')}
                            </Button>
                        )}
                    </div>
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
            render: (brand) => <span className={mappingStyles.mono}>{brand.id}</span>,
        },
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 200,
            render: (brand) => <span className={mappingStyles.primary}>{brand.name}</span>,
        },
        {
            key: 'mapping',
            header: t('brandMappingColumn'),
            priority: 'high',
            minWidth: 260,
            render: (brand) => (
                <MappingPickerCell saving={savingWoocommerceBrandId === brand.id}>
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
                </MappingPickerCell>
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
            <MappingPage>
                <MappingPageHeader
                    backLabel="WooCommerce"
                    onBack={() => router.visit('/catalog/marketplace/woocommerce')}
                    title={t('woocommerceMappingTitle')}
                    subtitle={
                        <>
                            {t('leafCategoriesMapped', { mapped: stats.mapped, total: stats.leaf })}
                            {lastSyncedAt ? ` · ${t('lastSyncedAt', { datetime: new Date(lastSyncedAt).toLocaleString() })}` : ''}
                        </>
                    }
                    actions={
                        <>
                            <Button icon="download" onClick={() => (window.location.href = '/catalog/categories/export-woocommerce')}>
                                {t('exportCategoriesCsv')}
                            </Button>
                            <Button
                                icon={importingCategories ? undefined : 'download-from-cloud'}
                                loading={importingCategories}
                                loadingDelay={0}
                                disabled={importingCategories}
                                onClick={runCategoryImport}
                            >
                                {importingCategories ? t('importingCategories') : t('importAsPimCategories')}
                            </Button>
                            <MappingSyncButton busy={syncingCategories} onClick={runCategorySync}>
                                {syncingCategories ? t('syncingLazada') : t('syncCategories')}
                            </MappingSyncButton>
                            <Button
                                design="Emphasized"
                                disabled={pendingCount === 0 || saving}
                                loading={saving}
                                loadingDelay={0}
                                onClick={saveChanges}
                            >
                                {t('saveChanges')}
                                {pendingCount > 0 ? ` (${pendingCount})` : ''}
                            </Button>
                        </>
                    }
                />

                <MappingStatTiles tiles={statTiles} />

                <MappingToolbar>
                    <MappingSearchInput value={search} onChange={setSearch} placeholder={t('searchCategories')} />

                    <MappingToolbarGroup>
                        <MappingFilterToggle<WoocommerceFilter>
                            value={filter}
                            onChange={applyFilter}
                            options={[
                                { value: 'all', label: t('statusAll') },
                                { value: 'leaf', label: t('leafOnly') },
                                { value: 'parent', label: t('parentOnly') },
                                { value: 'flagged', label: t('flaggedOnly') },
                            ]}
                        />
                        <MappingPager
                            perPage={perPage}
                            onPerPageChange={handlePerPageChange}
                            currentPage={currentPage}
                            lastPage={lastPage}
                            onGoToPage={goToPage}
                        />
                    </MappingToolbarGroup>
                </MappingToolbar>

                <FioriResponsiveTable
                    columns={columns}
                    rows={categories.data}
                    getRowKey={(row: WoocommerceRow) => row.id}
                    rowClassName={(row: WoocommerceRow) => (rowHasPendingChange(row) ? mappingStyles.pendingRow : undefined)}
                    emptyMessage={t('noCategoriesFound')}
                />

                {canEditBrands && (
                    <>
                        <MappingSectionHeader
                            title={t('woocommerceBrandsSectionTitle')}
                            message={woocommerceBrandSyncMessage}
                            actions={
                                <>
                                    <MappingSyncButton busy={woocommerceBrandSyncing} onClick={triggerWoocommerceBrandSync}>
                                        {woocommerceBrandSyncing ? t('syncingBrands') : t('syncBrands')}
                                    </MappingSyncButton>
                                </>
                            }
                        />

                        <MappingToolbar compact>
                            <MappingSearchInput value={woocommerceBrandSearch} onChange={setWoocommerceBrandSearch} placeholder={t('searchBrands')} />
                            <MappingPager
                                loading={loadingWoocommerceBrands}
                                perPage={woocommerceBrandPerPage}
                                onPerPageChange={handleWoocommerceBrandPerPageChange}
                                currentPage={woocommerceBrands?.current_page ?? 1}
                                lastPage={woocommerceBrands?.last_page ?? 1}
                                onGoToPage={goToWoocommerceBrandPage}
                            />
                        </MappingToolbar>

                        <FioriResponsiveTable
                            columns={woocommerceBrandColumns}
                            rows={woocommerceBrands?.data ?? []}
                            getRowKey={(brand: WoocommerceBrandRow) => brand.id}
                            emptyMessage={loadingWoocommerceBrands ? <MappingLoading /> : t('noBrandsFound')}
                        />
                    </>
                )}
            </MappingPage>
        </AppLayout>
    );
}
