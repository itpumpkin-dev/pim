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

type ShopeeFilter = 'all' | 'leaf' | 'parent' | 'flagged';

interface MappedCategory {
    id: number;
    name: string;
}

interface ShopeeRow {
    id: number;
    name: string;
    name_th: string | null;
    path: string;
    path_th: string | null;
    leaf: boolean;
    mapped_categories: MappedCategory[];
    brand_count: number;
}

interface ShopeeAttributeRow {
    id: number;
    name: string;
    input_type: number | null;
    mandatory: boolean;
    mapped: { id: number; name: string } | null;
}

const MAPPABLE_ATTRIBUTE_INPUT_TYPE = 3; // FREE_TEXT_FILED — ต้องตรงกับ ShopeeAttributeMappingController::MAPPABLE_INPUT_TYPE

const ATTRIBUTE_INPUT_TYPE_LABEL_KEYS: Record<number, string> = {
    1: 'inputTypeDropdown',
    2: 'inputTypeCombo',
    3: 'inputTypeFreeText',
    4: 'inputTypeMultiDropdown',
    5: 'inputTypeMultiCombo',
};

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    categories: PaginatedData<ShopeeRow>;
    stats: { total: number; leaf: number; parent: number; mapped: number };
    lastSyncedAt: string | null;
    filters: { filter: ShopeeFilter; search: string; per_page: number };
}

/** สิ่งที่การแก้ไขที่ยังไม่บันทึกเตรียมไว้สำหรับ PIM category id หนึ่งตัว: `null` คือล้าง mapping กับ Shopee ทิ้ง ส่วนถ้าเป็น object คือชี้ไปที่ Shopee node ตัวใหม่ (อาจเป็นคนละตัวกับเดิม) ใช้ PIM category id เป็น key ไม่ใช่ Shopee id — เพราะนั่นคือสิ่งที่ bulkMapShopee() บันทึกจริงๆ */
interface PendingAssignment {
    shopeeId: number;
    pimName: string;
}

export default function ShopeeCategoryMapping({ categories, stats, lastSyncedAt, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    // เขียนข้อมูล attribute mapping ไม่ใช่ข้อมูลหมวดหมู่ — เลย gate ด้วยสิทธิ์แยก
    // ของตัวเอง (marketplace_shopee.edit_attribute_mapping_shopee) ไม่ได้พ่วงกับ
    // attributes.edit_attributes ทั่วไป หรือ categories.edit_categories ที่ gate
    // ทั้งหน้านี้อีกต่อไป (ดู routes/catalog.php) — ส่วนตาราง "Shopee Brands"
    // ที่เคยอยู่ตรงนี้ ย้ายไปอยู่ที่ shopee-products.tsx (ผ่าน
    // ShopeeBrandMappingPanel) แล้ว ใกล้จุดที่แอดมินจะเจอปัญหา brand จริงๆ มากกว่า
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEditAttributes = permissions.includes('marketplace_shopee.edit_attribute_mapping_shopee');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '#' },
        { title: 'Shopee', href: '/catalog/marketplace/shopee' },
        { title: t('shopeeMappingTitle'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<ShopeeFilter>(filters.filter ?? 'leaf');
    const [perPage, setPerPage] = useState<number>(categories.per_page ?? 25);
    const [pending, setPending] = useState<Record<number, PendingAssignment | null>>({});
    const [assigningFor, setAssigningFor] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [syncingCategories, setSyncingCategories] = useState(false);

    // "detail" ที่อยู่ใต้ตารางหมวดหมู่ — ขับเคลื่อนด้วยแถว leaf category ล่าสุดที่คลิก
    // (เดิมมีตาราง Shopee Brands คู่กันตรงนี้ด้วย ย้ายไปอยู่ที่ shopee-products.tsx
    // แล้ว — ดู ShopeeBrandMappingPanel's docblock)
    const [selectedCategory, setSelectedCategory] = useState<ShopeeRow | null>(null);
    const firstRender = useRef(true);

    // ตาราง Shopee Attributes — ใช้แพทเทิร์นตาราง "detail" เดียวกัน คือเลือก leaf
    // category ด้านบนก่อน แต่ทำงานแบบ synchronous (ไม่มี JobTracker/
    // polling) เพราะ get_attribute_tree ไม่มี pagination และ schema ของแต่ละหมวดหมู่
    // ก็เล็ก ทำให้ ShopeeAttributeMappingController::syncShopeeAttributesForCategory()
    // แค่ return ผลลัพธ์กลับมาตรงๆ ได้เลย
    const [attributes, setAttributes] = useState<ShopeeAttributeRow[] | null>(null);
    const [loadingAttributes, setLoadingAttributes] = useState(false);
    const [attributeSyncing, setAttributeSyncing] = useState(false);
    const [attributeSyncMessage, setAttributeSyncMessage] = useState('');
    const [savingAttributeId, setSavingAttributeId] = useState<number | null>(null);

    const loadAttributes = (shopeeCategoryId: number) => {
        setLoadingAttributes(true);
        fetch(`/catalog/categories/${shopeeCategoryId}/shopee-attributes`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: ShopeeAttributeRow[] }) => setAttributes(body.data))
            .finally(() => setLoadingAttributes(false));
    };

    useEffect(() => {
        setAttributes(null);
        setAttributeSyncMessage('');
        if (selectedCategory) loadAttributes(selectedCategory.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory?.id]);

    const triggerAttributeSync = () => {
        if (!selectedCategory) return;
        setAttributeSyncing(true);
        setAttributeSyncMessage('');

        fetch('/catalog/categories/shopee-mapping/sync-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ shopee_category_id: selectedCategory.id }),
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setAttributeSyncMessage(body.message ?? 'Could not sync attributes.');
                    return;
                }

                setAttributeSyncMessage(t('attributesSyncedCount', { count: body.count ?? 0 }));
                loadAttributes(selectedCategory.id);
            })
            .catch(() => setAttributeSyncMessage('Network error while syncing attributes.'))
            .finally(() => setAttributeSyncing(false));
    };

    // `pimAttributeId` คือแถว PIM Attribute ที่จะถูกเขียนค่าลงไปจริงๆ (แถวใน
    // shopee_attribute_mappings ที่ key ด้วย attribute_id) — ถ้าเป็นการจับคู่ใหม่
    // ก็คือ id ของ attribute PIM ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม ก็คือ
    // PIM id ของ mapping เดิมนั้น ส่วน `targetField` เป็น null คือล้าง mapping
    // (ShopeeAttributeMappingController::update() จะลบแถวทิ้ง) ถ้าเป็น
    // 'shopee_attribute' คือตั้งค่า mapping
    const persistAttribute = (
        shopeeAttributeId: number,
        pimAttributeId: number,
        targetField: 'shopee_attribute' | null,
        display: { id: number; name: string } | null,
    ) => {
        setSavingAttributeId(shopeeAttributeId);
        fetch('/catalog/attributes/shopee-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttributeId,
                        target_field: targetField,
                        shopee_attribute_id: targetField ? shopeeAttributeId : null,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setAttributes((prev) => (prev ? prev.map((a) => (a.id === shopeeAttributeId ? { ...a, mapped: display } : a)) : prev));
            })
            .finally(() => setSavingAttributeId(null));
    };

    const assignAttribute = (shopeeAttributeId: number, pimAttribute: PimAttributeOption) => {
        persistAttribute(shopeeAttributeId, pimAttribute.id, 'shopee_attribute', { id: pimAttribute.id, name: pimAttribute.name });
    };

    const clearAttribute = (shopeeAttributeId: number, currentPimAttributeId: number) => {
        persistAttribute(shopeeAttributeId, currentPimAttributeId, null, null);
    };

    const runCategorySync = () => {
        setSyncingCategories(true);
        router.post('/catalog/categories/sync-shopee', {}, { preserveScroll: true, onFinish: () => setSyncingCategories(false) });
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
            router.get('/catalog/categories/shopee-mapping', { search, filter, per_page: perPage }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const applyFilter = (value: ShopeeFilter) => {
        setFilter(value);
        router.get('/catalog/categories/shopee-mapping', { search, filter: value, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categories/shopee-mapping', { search, filter, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/categories/shopee-mapping', { search, filter, per_page: perPage, page }, { preserveState: true });
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

    const stageAssign = (row: ShopeeRow, pimCategory: CategoryOption) => {
        setPending((prev) => ({ ...prev, [pimCategory.id]: { shopeeId: row.id, pimName: pimCategory.name } }));
        setAssigningFor(null);
    };

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([pimId, assignment]) => ({
            category_id: Number(pimId),
            shopee_category_id: assignment ? assignment.shopeeId : null,
        }));

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post('/catalog/categories/shopee-mapping', { mappings }, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    // แถวหนึ่งจะถูกนับเป็น "pending" (ไฮไลต์ด้วยเส้นประ) ได้ทั้งสองทาง: กำลังจะล้าง/
    // ย้าย mapping PIM เดิมของมันออกไป หรือกำลังจะมีการจับคู่ใหม่จาก PIM category
    // อื่นเข้ามาลงตรงนี้
    const rowHasPendingChange = (row: ShopeeRow) =>
        row.mapped_categories.some((pc) => pc.id in pending) || Object.values(pending).some((assignment) => assignment?.shopeeId === row.id);

    const columns: FioriResponsiveColumn<ShopeeRow>[] = [
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
            render: (row) => (
                <div className={mappingStyles.stack}>
                    <LeafStatusTag leaf={row.leaf} label={row.leaf ? t('leafLabel') : t('parentLabel')} />
                    {row.leaf && row.brand_count > 0 && (
                        <span className={mappingStyles.caption}>{t('brandsInCategory', { count: row.brand_count })}</span>
                    )}
                </div>
            ),
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

                // ทุกอย่างที่ mapping กับ Shopee node นี้อยู่ตอนนี้ รวมเข้ากับการแก้ไข
                // ที่ยังค้างอยู่ของ PIM category เดียวกัน — รวมถึงกรณีที่ย้ายไปที่อื่น
                // ด้วย ซึ่งต้อง render ตรงนี้เป็น "will clear" เหมือนกัน
                const existingChips = row.mapped_categories.map((pc) => {
                    const staged = pending[pc.id];
                    if (staged === undefined) {
                        return (
                            <MappingChip key={pc.id} label={pc.name} variant="mapped" onDelete={() => stageClear(pc.id)} deleteLabel={t('delete')} />
                        );
                    }

                    const label = staged && staged.shopeeId === row.id ? `${t('willMapTo')}: ${pc.name}` : `${t('willClearMapping')}: ${pc.name}`;
                    return <MappingChip key={pc.id} label={label} variant="pending" onDelete={() => undoPending(pc.id)} deleteLabel={t('cancel')} />;
                });

                // PIM category ที่ยังไม่อยู่ในลิสต์นี้ แต่ถูกเตรียมไว้ (จากแถวของมันเองที่
                // อื่นในหน้านี้) ให้ย้ายมาอยู่ตรงนี้
                const newlyAssigned = Object.entries(pending)
                    .filter((entry): entry is [string, PendingAssignment] => {
                        const [pimId, assignment] = entry;
                        return assignment !== null && assignment.shopeeId === row.id && !existingIds.has(Number(pimId));
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

    const attributeColumns: FioriResponsiveColumn<ShopeeAttributeRow>[] = [
        {
            key: 'id',
            header: t('idColumn'),
            priority: 'high',
            align: 'right',
            width: 120,
            render: (attribute) => <span className={mappingStyles.mono}>{attribute.id}</span>,
        },
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
            key: 'type',
            header: t('typeColumn'),
            priority: 'medium',
            render: (attribute) => (
                <span className={mappingStyles.caption}>
                    {attribute.input_type != null && ATTRIBUTE_INPUT_TYPE_LABEL_KEYS[attribute.input_type]
                        ? t(ATTRIBUTE_INPUT_TYPE_LABEL_KEYS[attribute.input_type])
                        : t('inputTypeUnknown')}
                </span>
            ),
        },
        {
            key: 'mapping',
            header: t('attributeMappingColumn'),
            priority: 'high',
            minWidth: 260,
            render: (attribute) => {
                if (attribute.input_type !== MAPPABLE_ATTRIBUTE_INPUT_TYPE) {
                    return <span className={mappingStyles.mutedBody}>{t('notMappableAttribute')}</span>;
                }

                return (
                    <MappingPickerCell saving={savingAttributeId === attribute.id}>
                        <PimAttributePicker
                            value={attribute.mapped}
                            disabled={savingAttributeId === attribute.id}
                            onChange={(val) => {
                                if (val) {
                                    assignAttribute(attribute.id, val);
                                } else if (attribute.mapped) {
                                    clearAttribute(attribute.id, attribute.mapped.id);
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
            <Head title={t('shopeeMappingTitle')} />
            <MappingPage>
                <MappingPageHeader
                    backLabel="Shopee"
                    onBack={() => router.visit('/catalog/marketplace/shopee')}
                    title={t('shopeeMappingTitle')}
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
                        <MappingFilterToggle<ShopeeFilter>
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
                    getRowKey={(row: ShopeeRow) => row.id}
                    onRowClick={(row: ShopeeRow) => row.leaf && setSelectedCategory(row)}
                    rowClassName={(row: ShopeeRow) =>
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
                            title={selectedCategory ? t('attributesForCategory', { name: selectedCategory.name }) : t('shopeeAttributesSectionTitle')}
                            message={selectedCategory ? attributeSyncMessage : undefined}
                            actions={
                                selectedCategory && (
                                    <MappingSyncButton busy={attributeSyncing} onClick={triggerAttributeSync}>
                                        {attributeSyncing ? t('syncingAttributes') : t('syncAttributesForCategory')}
                                    </MappingSyncButton>
                                )
                            }
                        />

                        {!selectedCategory ? (
                            <MappingEmptyPrompt>{t('selectCategoryPrompt')}</MappingEmptyPrompt>
                        ) : (
                            <FioriResponsiveTable
                                columns={attributeColumns}
                                rows={attributes ?? []}
                                getRowKey={(attribute: ShopeeAttributeRow) => attribute.id}
                                emptyMessage={loadingAttributes ? <MappingLoading /> : t('noAttributesInCategory')}
                            />
                        )}
                    </>
                )}
            </MappingPage>
        </AppLayout>
    );
}
