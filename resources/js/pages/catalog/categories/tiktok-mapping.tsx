import { CategoryPicker, type CategoryOption } from '@/components/catalog/category-picker';
import {
    LeafStatusTag,
    MandatoryTag,
    MappingChip,
    MappingEmptyPrompt,
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
    cx,
    mappingStyles,
} from '@/components/catalog/marketplace-mapping-ui';
import { PimAttributePicker, type PimAttributeOption } from '@/components/catalog/pim-attribute-picker';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { xsrfToken } from '@/lib/csrf';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import { Button } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

// (TikTokBrandRow เคยอยู่ตรงนี้ — ย้ายไปอยู่ใน TikTokBrandMappingPanel แล้ว
// พร้อมกับ docblock อธิบายว่าทำไม id ของมันเป็น string ไม่ใช่ number)
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

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    // แยกสิทธิ์ต่อแพลตฟอร์มแล้ว (marketplace_tiktok.edit_attribute_mapping_tiktok)
    // — ไม่ได้พ่วงกับ attributes.edit_attributes ทั่วไปอีกต่อไป (ดู
    // routes/catalog.php) — ส่วนสิทธิ์ edit_brand_mapping_tiktok ย้ายไปเช็คใน
    // TikTokBrandMappingPanel เอง (ดู docblock ของตัวนั้น) พร้อมกับตาราง
    // "TikTok Brands" ที่ย้ายไปอยู่ที่ tiktok-products.tsx แล้ว
    const canEditAttributes = permissions.includes('marketplace_tiktok.edit_attribute_mapping_tiktok');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: 'TikTok', href: '/catalog/marketplace/tiktok' },
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
                setTiktokAttributes((prev) => (prev ? prev.map((a) => (a.id === tiktokAttributeId ? { ...a, mapped: display } : a)) : prev));
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
            render: (row) => <span className={mappingStyles.mono}>{row.id}</span>,
        },
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 220,
            render: (row) => (
                <div className={mappingStyles.stack}>
                    <span className={mappingStyles.primary}>{row.name}</span>
                    {row.name_th ? (
                        <span className={mappingStyles.caption}>{row.name_th}</span>
                    ) : (
                        <span className={mappingStyles.muted}>{t('noThaiName')}</span>
                    )}
                </div>
            ),
        },
        {
            key: 'path',
            header: t('pathColumn'),
            priority: 'medium',
            minWidth: 260,
            render: (row) => (
                <div className={mappingStyles.stack}>
                    <span className={mappingStyles.muted}>{row.path}</span>
                    {row.path_th && <span className={mappingStyles.muted}>{row.path_th}</span>}
                </div>
            ),
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

                // ทุกอย่างที่ mapping กับ TikTok node นี้อยู่ตอนนี้ รวมเข้ากับการแก้ไข
                // ที่ยังค้างอยู่ของ PIM category เดียวกัน — รวมถึงกรณีที่ย้ายไปที่อื่น
                // ด้วย ซึ่งต้อง render ตรงนี้เป็น "will clear" เหมือนกัน
                const existingChips = row.mapped_categories.map((pc) => {
                    const staged = pending[pc.id];
                    if (staged === undefined) {
                        return (
                            <MappingChip key={pc.id} label={pc.name} variant="mapped" onDelete={() => stageClear(pc.id)} deleteLabel={t('delete')} />
                        );
                    }

                    const label = staged && staged.tiktokId === row.id ? `${t('willMapTo')}: ${pc.name}` : `${t('willClearMapping')}: ${pc.name}`;
                    return <MappingChip key={pc.id} label={label} variant="pending" onDelete={() => undoPending(pc.id)} deleteLabel={t('cancel')} />;
                });

                // PIM category ที่ยังไม่อยู่ในลิสต์นี้ แต่ถูกเตรียมไว้ (จากแถวของมันเองที่
                // อื่นในหน้านี้) ให้ย้ายมาอยู่ตรงนี้
                const newlyAssigned = Object.entries(pending)
                    .filter((entry): entry is [string, PendingAssignment] => {
                        const [pimId, assignment] = entry;
                        return assignment !== null && assignment.tiktokId === row.id && !existingIds.has(Number(pimId));
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

    const tiktokAttributeColumns: FioriResponsiveColumn<TikTokAttributeRow>[] = [
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 200,
            render: (attribute) => (
                <div className={mappingStyles.stack}>
                    <span className={mappingStyles.primary}>{attribute.name}</span>
                    {attribute.mandatory && <MandatoryTag label={t('mandatoryLabel')} />}
                </div>
            ),
        },
        {
            key: 'mapping',
            header: t('attributeMappingColumn'),
            priority: 'high',
            minWidth: 260,
            render: (attribute) => {
                if (!attribute.is_customizable) {
                    return <span className={mappingStyles.mutedBody}>{t('notMappableTiktokAttribute')}</span>;
                }

                return (
                    <MappingPickerCell saving={savingTiktokAttributeId === attribute.id}>
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
                    </MappingPickerCell>
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
            <MappingPage>
                <MappingPageHeader
                    backLabel="TikTok"
                    onBack={() => router.visit('/catalog/marketplace/tiktok')}
                    title={t('tiktokMappingTitle')}
                    subtitle={
                        <>
                            {t('leafCategoriesMapped', { mapped: stats.mapped, total: stats.leaf })}
                            {lastSyncedAt ? ` · ${t('lastSyncedAt', { datetime: new Date(lastSyncedAt).toLocaleString() })}` : ''}
                        </>
                    }
                    actions={
                        <>
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
                        <MappingFilterToggle<TikTokFilter>
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
                    getRowKey={(row: TikTokRow) => row.id}
                    onRowClick={(row: TikTokRow) => row.leaf && setSelectedCategory(row)}
                    rowClassName={(row: TikTokRow) =>
                        cx(
                            rowHasPendingChange(row) && mappingStyles.pendingRow,
                            row.id === selectedCategory?.id && mappingStyles.selectedRow,
                            !row.leaf && mappingStyles.notClickable,
                        )
                    }
                    emptyMessage={t('noCategoriesFound')}
                />

                {canEditAttributes && (
                    <>
                        <MappingSectionHeader
                            title={
                                selectedCategory
                                    ? t('tiktokAttributesForCategory', { name: selectedCategory.name })
                                    : t('tiktokAttributesSectionTitle')
                            }
                            message={selectedCategory ? tiktokAttributeSyncMessage : undefined}
                            actions={
                                selectedCategory && (
                                    <MappingSyncButton busy={tiktokAttributeSyncing} onClick={triggerTiktokAttributeSync}>
                                        {tiktokAttributeSyncing ? t('syncingAttributes') : t('syncAttributesForCategory')}
                                    </MappingSyncButton>
                                )
                            }
                        />

                        {!selectedCategory ? (
                            <MappingEmptyPrompt>{t('selectCategoryPrompt')}</MappingEmptyPrompt>
                        ) : (
                            <FioriResponsiveTable
                                columns={tiktokAttributeColumns}
                                rows={tiktokAttributes ?? []}
                                getRowKey={(attribute: TikTokAttributeRow) => attribute.id}
                                emptyMessage={loadingTiktokAttributes ? <MappingLoading /> : t('noAttributesInCategory')}
                            />
                        )}
                    </>
                )}
            </MappingPage>
        </AppLayout>
    );
}
