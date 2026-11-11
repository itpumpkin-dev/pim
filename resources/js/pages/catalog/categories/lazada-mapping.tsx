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
import { PimBrandPicker, type PimBrandOption } from '@/components/catalog/pim-brand-picker';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { xsrfToken } from '@/lib/csrf';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/add.js';
import '@ui5/webcomponents-icons/dist/sys-cancel.js';
import { Button } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ใช้ตารางแบบ marketplace-tree-row-centric เหมือนกับ categories/shopee-mapping.tsx
// (ดูเหตุผลได้ใน docblock ของ CategoryController::lazadaMapping()) รวมถึงส่วน
// detail "Brands"/"Attributes" ด้านล่างแบบเดียวกับหน้านั้นด้วย — ดู state/handler
// ของแต่ละส่วนด้านล่างว่ารูปแบบ API เฉพาะของ Lazada (brands เป็น global,
// attributes ผูกกับหมวดหมู่) ทำให้ต่างจากหน้านั้นยังไง
type LazadaFilter = 'all' | 'leaf' | 'parent' | 'flagged';

interface MappedCategory {
    id: number;
    name: string;
}

interface LazadaRow {
    id: number;
    name: string;
    path: string;
    leaf: boolean;
    mapped_categories: MappedCategory[];
}

interface LazadaBrandRow {
    id: number;
    name: string;
    mapped: { id: number; name: string } | null;
}

interface LazadaAttributeRow {
    // ใช้ `name` เป็น key ไม่ใช่ id ตัวเลข — ดู docblock ของ LazadaAttribute ประกอบ
    name: string;
    label: string;
    input_type: string | null;
    mandatory: boolean;
    mapped: { id: number; name: string } | null;
}

// ต้องตรงกับ LazadaAttributeMappingController::MAPPABLE_INPUT_TYPES —
// ประเภท singleSelect/multiSelect/enumInput/multiEnumInput/img/date ต้องการ
// ตัวเลือกที่กำหนดไว้ล่วงหน้าเฉพาะ หรือรูปแบบข้อมูลที่ไม่ใช่ string ซึ่งหน้านี้ยังไม่รองรับ
const MAPPABLE_LAZADA_INPUT_TYPES = ['text', 'numeric', 'richText'];

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    categories: PaginatedData<LazadaRow>;
    stats: { total: number; leaf: number; parent: number; mapped: number };
    lastSyncedAt: string | null;
    filters: { filter: LazadaFilter; search: string; per_page: number };
}

/** สิ่งที่การแก้ไขที่ยังไม่บันทึกเตรียมไว้สำหรับ PIM category id หนึ่งตัว: `null` คือล้าง mapping กับ Lazada ทิ้ง ส่วนถ้าเป็น object คือชี้ไปที่ Lazada node ตัวใหม่ (อาจเป็นคนละตัวกับเดิม) ใช้ PIM category id เป็น key ไม่ใช่ Lazada id — เพราะนั่นคือสิ่งที่ bulkMapLazada() บันทึกจริงๆ */
interface PendingAssignment {
    lazadaId: number;
    pimName: string;
}

export default function LazadaCategoryMapping({ categories, stats, lastSyncedAt, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    // แยกสิทธิ์ต่อแพลตฟอร์มแล้ว (marketplace_lazada.edit_brand_mapping_lazada /
    // edit_attribute_mapping_lazada) — ไม่ได้พ่วงกับ brands.edit_brands /
    // attributes.edit_attributes ทั่วไปอีกต่อไป (ดู routes/catalog.php)
    const canEditBrands = permissions.includes('marketplace_lazada.edit_brand_mapping_lazada');
    const canEditAttributes = permissions.includes('marketplace_lazada.edit_attribute_mapping_lazada');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('marketplace'), href: '/catalog/marketplace' },
        { title: 'Lazada', href: '/catalog/marketplace/product-master?platform=lazada' },
        { title: t('lazadaMappingTitle'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<LazadaFilter>(filters.filter ?? 'leaf');
    const [perPage, setPerPage] = useState<number>(categories.per_page ?? 25);
    const [pending, setPending] = useState<Record<number, PendingAssignment | null>>({});
    const [assigningFor, setAssigningFor] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [syncingCategories, setSyncingCategories] = useState(false);
    const firstRender = useRef(true);

    // ขับเคลื่อนตาราง Lazada Attributes ด้านล่าง (ผูกกับหมวดหมู่ เหมือนของ Shopee)
    // — ส่วนตาราง Lazada Brands ไม่ต้องใช้ตัวนี้เลย เพราะ brand catalog ของ Lazada
    // ไม่มีมิติหมวดหมู่ (ดู state ของส่วนนั้นด้านล่างประกอบ)
    const [selectedCategory, setSelectedCategory] = useState<LazadaRow | null>(null);

    const runCategorySync = () => {
        setSyncingCategories(true);
        router.post('/catalog/categories/sync-lazada', {}, { preserveScroll: true, onFinish: () => setSyncingCategories(false) });
    };

    // ---- Lazada Brands (global — ดู docblock ของ LazadaBrandRow ประกอบ) ----
    const [lazadaBrands, setLazadaBrands] = useState<PaginatedData<LazadaBrandRow> | null>(null);
    const [loadingLazadaBrands, setLoadingLazadaBrands] = useState(false);
    const [lazadaBrandSearch, setLazadaBrandSearch] = useState('');
    const [lazadaBrandPerPage, setLazadaBrandPerPage] = useState(25);
    const [savingLazadaBrandId, setSavingLazadaBrandId] = useState<number | null>(null);
    const [lazadaBrandSyncing, setLazadaBrandSyncing] = useState(false);
    const [lazadaBrandSyncMessage, setLazadaBrandSyncMessage] = useState('');
    const [activeLazadaBrandJobTrackerId, setActiveLazadaBrandJobTrackerId] = useState<number | null>(null);
    const lazadaBrandPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstLazadaBrandSearchRender = useRef(true);

    useEffect(() => {
        return () => {
            if (lazadaBrandPollTimer.current) clearTimeout(lazadaBrandPollTimer.current);
        };
    }, []);

    const loadLazadaBrands = (opts: { search?: string; page?: number; perPage?: number } = {}) => {
        const params = new URLSearchParams({
            search: opts.search ?? lazadaBrandSearch,
            page: String(opts.page ?? 1),
            per_page: String(opts.perPage ?? lazadaBrandPerPage),
        });

        setLoadingLazadaBrands(true);
        fetch(`/catalog/categories/lazada-mapping/lazada-brands?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [], current_page: 1, last_page: 1, per_page: 25, total: 0 }))
            .then((body: PaginatedData<LazadaBrandRow>) => setLazadaBrands(body))
            .finally(() => setLoadingLazadaBrands(false));
    };

    // โหลดครั้งเดียวตอน mount — ต่างจากตาราง Brands ของ Shopee ตรงนี้ไม่ต้องเลือก
    // หมวดหมู่ก่อนถึงจะโหลดได้ (brand catalog ของ Lazada ไม่มีมิติหมวดหมู่เลย)
    useEffect(() => {
        if (canEditBrands) loadLazadaBrands({ page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (firstLazadaBrandSearchRender.current) {
            firstLazadaBrandSearchRender.current = false;
            return;
        }

        const timeout = setTimeout(() => loadLazadaBrands({ search: lazadaBrandSearch, page: 1 }), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lazadaBrandSearch]);

    const handleLazadaBrandPerPageChange = (value: number) => {
        setLazadaBrandPerPage(value);
        loadLazadaBrands({ page: 1, perPage: value });
    };

    const goToLazadaBrandPage = (page: number) => {
        loadLazadaBrands({ page });
    };

    const pollLazadaBrandSync = (jobTrackerId: number) => {
        fetch(`/catalog/brands/sync-jobs/${jobTrackerId}/status`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setLazadaBrandSyncing(false);
                    setLazadaBrandSyncMessage(body.message ?? 'Could not check sync status.');
                    setActiveLazadaBrandJobTrackerId(null);
                    return;
                }

                if (body.status === 'completed') {
                    setLazadaBrandSyncing(false);
                    setActiveLazadaBrandJobTrackerId(null);
                    setLazadaBrandSyncMessage(t('brandsSyncedCount', { count: body.total_records_created ?? 0 }));
                    loadLazadaBrands({ page: 1 });
                    return;
                }

                if (body.status === 'failed' || body.status === 'cancelled') {
                    setLazadaBrandSyncing(false);
                    setActiveLazadaBrandJobTrackerId(null);
                    setLazadaBrandSyncMessage(body.error_log?.[0]?.message ?? 'Sync failed.');
                    return;
                }

                lazadaBrandPollTimer.current = setTimeout(() => pollLazadaBrandSync(jobTrackerId), 2000);
            })
            .catch(() => {
                setLazadaBrandSyncing(false);
                setActiveLazadaBrandJobTrackerId(null);
                setLazadaBrandSyncMessage('Network error while checking sync status.');
            });
    };

    const triggerLazadaBrandSync = () => {
        setLazadaBrandSyncing(true);
        setLazadaBrandSyncMessage('');

        fetch('/catalog/brands/sync-lazada', {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_tracker_id) {
                    setLazadaBrandSyncing(false);
                    setLazadaBrandSyncMessage(body.message ?? 'Could not start sync.');
                    return;
                }

                setActiveLazadaBrandJobTrackerId(body.job_tracker_id);
                pollLazadaBrandSync(body.job_tracker_id);
            })
            .catch(() => {
                setLazadaBrandSyncing(false);
                setLazadaBrandSyncMessage('Network error while starting sync.');
            });
    };

    const cancelLazadaBrandSync = () => {
        if (!activeLazadaBrandJobTrackerId) return;

        fetch(`/catalog/brands/sync-jobs/${activeLazadaBrandJobTrackerId}/cancel`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken(), Accept: 'application/json' },
        }).catch(() => setLazadaBrandSyncMessage('Network error while cancelling sync.'));
    };

    // `optionId` คือแถว PIM AttributeOption ที่จะถูกเขียนค่าลงไปจริงๆ
    // (attribute_options.lazada_brand_id) — ถ้าเป็นการจับคู่ใหม่ ก็คือ id ของแบรนด์ PIM
    // ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม ก็คือ PIM id ของ mapping เดิมนั้น
    // ไม่ใช่อะไรที่คำนวณมาจาก `lazadaBrandId` ส่วน `display` คือสิ่งที่จะโชว์ในแถวหลังจากนั้น
    // รูปแบบเดียวกับ persistBrand() ของ ShopeeCategoryMapping
    const persistLazadaBrand = (
        lazadaBrandId: number,
        optionId: number,
        newLazadaId: number | null,
        display: { id: number; name: string } | null,
    ) => {
        setSavingLazadaBrandId(lazadaBrandId);
        fetch('/catalog/brands/lazada-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings: [{ option_id: optionId, marketplace_brand_id: newLazadaId }] }),
        })
            .then((res) => {
                if (!res.ok) return;
                setLazadaBrands((prev) =>
                    prev ? { ...prev, data: prev.data.map((b) => (b.id === lazadaBrandId ? { ...b, mapped: display } : b)) } : prev,
                );
            })
            .finally(() => setSavingLazadaBrandId(null));
    };

    const assignLazadaBrand = (lazadaBrandId: number, pimBrand: PimBrandOption) => {
        persistLazadaBrand(lazadaBrandId, pimBrand.id, lazadaBrandId, { id: pimBrand.id, name: pimBrand.name });
    };

    const clearLazadaBrand = (lazadaBrandId: number, currentPimOptionId: number) => {
        persistLazadaBrand(lazadaBrandId, currentPimOptionId, null, null);
    };

    // ---- Lazada Attributes (ผูกกับหมวดหมู่ เลียนแบบของ Shopee) ----
    const [lazadaAttributes, setLazadaAttributes] = useState<LazadaAttributeRow[] | null>(null);
    const [loadingLazadaAttributes, setLoadingLazadaAttributes] = useState(false);
    const [lazadaAttributeSyncing, setLazadaAttributeSyncing] = useState(false);
    const [lazadaAttributeSyncMessage, setLazadaAttributeSyncMessage] = useState('');
    const [savingLazadaAttributeName, setSavingLazadaAttributeName] = useState<string | null>(null);

    const loadLazadaAttributes = (lazadaCategoryId: number) => {
        setLoadingLazadaAttributes(true);
        fetch(`/catalog/categories/${lazadaCategoryId}/lazada-attributes`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [] }))
            .then((body: { data: LazadaAttributeRow[] }) => setLazadaAttributes(body.data))
            .finally(() => setLoadingLazadaAttributes(false));
    };

    useEffect(() => {
        setLazadaAttributes(null);
        setLazadaAttributeSyncMessage('');
        if (selectedCategory) loadLazadaAttributes(selectedCategory.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory?.id]);

    const triggerLazadaAttributeSync = () => {
        if (!selectedCategory) return;
        setLazadaAttributeSyncing(true);
        setLazadaAttributeSyncMessage('');

        fetch('/catalog/categories/lazada-mapping/sync-attributes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ lazada_category_id: selectedCategory.id }),
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setLazadaAttributeSyncMessage(body.message ?? 'Could not sync attributes.');
                    return;
                }

                setLazadaAttributeSyncMessage(t('attributesSyncedCount', { count: body.count ?? 0 }));
                loadLazadaAttributes(selectedCategory.id);
            })
            .catch(() => setLazadaAttributeSyncMessage('Network error while syncing attributes.'))
            .finally(() => setLazadaAttributeSyncing(false));
    };

    // `pimAttributeId` คือแถว PIM Attribute ที่จะถูกเขียนค่าลงไปจริงๆ — ถ้าเป็นการ
    // จับคู่ใหม่ ก็คือ id ของ attribute PIM ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม
    // ก็คือ PIM id ของ mapping เดิมนั้น
    const persistLazadaAttribute = (
        lazadaAttributeName: string,
        pimAttributeId: number,
        targetField: 'lazada_attribute' | null,
        display: { id: number; name: string } | null,
    ) => {
        setSavingLazadaAttributeName(lazadaAttributeName);
        fetch('/catalog/attributes/lazada-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({
                mappings: [
                    {
                        attribute_id: pimAttributeId,
                        target_field: targetField,
                        lazada_attribute_name: targetField ? lazadaAttributeName : null,
                        sort_order: 0,
                    },
                ],
            }),
        })
            .then((res) => {
                if (!res.ok) return;
                setLazadaAttributes((prev) => (prev ? prev.map((a) => (a.name === lazadaAttributeName ? { ...a, mapped: display } : a)) : prev));
            })
            .finally(() => setSavingLazadaAttributeName(null));
    };

    const assignLazadaAttribute = (lazadaAttributeName: string, pimAttribute: PimAttributeOption) => {
        persistLazadaAttribute(lazadaAttributeName, pimAttribute.id, 'lazada_attribute', { id: pimAttribute.id, name: pimAttribute.name });
    };

    const clearLazadaAttribute = (lazadaAttributeName: string, currentPimAttributeId: number) => {
        persistLazadaAttribute(lazadaAttributeName, currentPimAttributeId, null, null);
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
            router.get('/catalog/categories/lazada-mapping', { search, filter, per_page: perPage }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const applyFilter = (value: LazadaFilter) => {
        setFilter(value);
        router.get('/catalog/categories/lazada-mapping', { search, filter: value, per_page: perPage }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categories/lazada-mapping', { search, filter, per_page: value }, { preserveState: true });
    };

    const goToPage = (page: number) => {
        router.get('/catalog/categories/lazada-mapping', { search, filter, per_page: perPage, page }, { preserveState: true });
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

    const stageAssign = (row: LazadaRow, pimCategory: CategoryOption) => {
        setPending((prev) => ({ ...prev, [pimCategory.id]: { lazadaId: row.id, pimName: pimCategory.name } }));
        setAssigningFor(null);
    };

    const saveChanges = () => {
        const mappings = Object.entries(pending).map(([pimId, assignment]) => ({
            category_id: Number(pimId),
            lazada_category_id: assignment ? assignment.lazadaId : null,
        }));

        if (mappings.length === 0) {
            return;
        }

        setSaving(true);
        router.post('/catalog/categories/lazada-mapping', { mappings }, { preserveScroll: true, onFinish: () => setSaving(false) });
    };

    // แถวหนึ่งจะถูกนับเป็น "pending" (ไฮไลต์ด้วยเส้นประ) ได้ทั้งสองทาง: กำลังจะล้าง/
    // ย้าย mapping PIM เดิมของมันออกไป หรือกำลังจะมีการจับคู่ใหม่จาก PIM category
    // อื่นเข้ามาลงตรงนี้
    const rowHasPendingChange = (row: LazadaRow) =>
        row.mapped_categories.some((pc) => pc.id in pending) || Object.values(pending).some((assignment) => assignment?.lazadaId === row.id);

    const columns: FioriResponsiveColumn<LazadaRow>[] = [
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

                // ทุกอย่างที่ mapping กับ Lazada node นี้อยู่ตอนนี้ รวมเข้ากับการแก้ไข
                // ที่ยังค้างอยู่ของ PIM category เดียวกัน — รวมถึงกรณีที่ย้ายไปที่อื่น
                // ด้วย ซึ่งต้อง render ตรงนี้เป็น "will clear" เหมือนกัน
                const existingChips = row.mapped_categories.map((pc) => {
                    const staged = pending[pc.id];
                    if (staged === undefined) {
                        return (
                            <MappingChip key={pc.id} label={pc.name} variant="mapped" onDelete={() => stageClear(pc.id)} deleteLabel={t('delete')} />
                        );
                    }

                    const label = staged && staged.lazadaId === row.id ? `${t('willMapTo')}: ${pc.name}` : `${t('willClearMapping')}: ${pc.name}`;
                    return <MappingChip key={pc.id} label={label} variant="pending" onDelete={() => undoPending(pc.id)} deleteLabel={t('cancel')} />;
                });

                // PIM category ที่ยังไม่อยู่ในลิสต์นี้ แต่ถูกเตรียมไว้ (จากแถวของมันเองที่
                // อื่นในหน้านี้) ให้ย้ายมาอยู่ตรงนี้
                const newlyAssigned = Object.entries(pending)
                    .filter((entry): entry is [string, PendingAssignment] => {
                        const [pimId, assignment] = entry;
                        return assignment !== null && assignment.lazadaId === row.id && !existingIds.has(Number(pimId));
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

    const lazadaBrandColumns: FioriResponsiveColumn<LazadaBrandRow>[] = [
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
                <MappingPickerCell saving={savingLazadaBrandId === brand.id}>
                    <PimBrandPicker
                        value={brand.mapped}
                        disabled={savingLazadaBrandId === brand.id}
                        onChange={(val) => {
                            if (val) {
                                assignLazadaBrand(brand.id, val);
                            } else if (brand.mapped) {
                                clearLazadaBrand(brand.id, brand.mapped.id);
                            }
                        }}
                        placeholder={t('searchPimBrandPlaceholder')}
                    />
                </MappingPickerCell>
            ),
        },
    ];

    const lazadaAttributeColumns: FioriResponsiveColumn<LazadaAttributeRow>[] = [
        {
            key: 'name',
            header: t('nameColumn'),
            priority: 'always',
            minWidth: 200,
            render: (attribute) => (
                <div className={mappingStyles.stack}>
                    <span className={mappingStyles.primary}>{attribute.label}</span>
                    {attribute.mandatory && <MandatoryTag label={t('mandatoryLabel')} />}
                </div>
            ),
        },
        {
            key: 'type',
            header: t('typeColumn'),
            priority: 'medium',
            render: (attribute) => <span className={mappingStyles.caption}>{attribute.input_type ?? '-'}</span>,
        },
        {
            key: 'mapping',
            header: t('attributeMappingColumn'),
            priority: 'high',
            minWidth: 260,
            render: (attribute) => {
                if (!attribute.input_type || !MAPPABLE_LAZADA_INPUT_TYPES.includes(attribute.input_type)) {
                    return <span className={mappingStyles.mutedBody}>{t('notMappableLazadaAttribute')}</span>;
                }

                return (
                    <MappingPickerCell saving={savingLazadaAttributeName === attribute.name}>
                        <PimAttributePicker
                            value={attribute.mapped}
                            disabled={savingLazadaAttributeName === attribute.name}
                            onChange={(val) => {
                                if (val) {
                                    assignLazadaAttribute(attribute.name, val);
                                } else if (attribute.mapped) {
                                    clearLazadaAttribute(attribute.name, attribute.mapped.id);
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
            <Head title={t('lazadaMappingTitle')} />
            <MappingPage>
                <MappingPageHeader
                    backLabel="Lazada"
                    onBack={() => router.visit('/catalog/marketplace/product-master?platform=lazada')}
                    title={t('lazadaMappingTitle')}
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
                        <MappingFilterToggle<LazadaFilter>
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
                    getRowKey={(row: LazadaRow) => row.id}
                    onRowClick={(row: LazadaRow) => row.leaf && setSelectedCategory(row)}
                    rowClassName={(row: LazadaRow) =>
                        cx(
                            rowHasPendingChange(row) && mappingStyles.pendingRow,
                            row.id === selectedCategory?.id && mappingStyles.selectedRow,
                            !row.leaf && mappingStyles.notClickable,
                        )
                    }
                    emptyMessage={t('noCategoriesFound')}
                />

                {canEditBrands && (
                    <>
                        <MappingSectionHeader
                            title={t('lazadaBrandsSectionTitle')}
                            message={lazadaBrandSyncMessage}
                            actions={
                                <>
                                    <MappingSyncButton busy={lazadaBrandSyncing} onClick={triggerLazadaBrandSync}>
                                        {lazadaBrandSyncing ? t('syncingBrands') : t('syncBrands')}
                                    </MappingSyncButton>
                                    {lazadaBrandSyncing && activeLazadaBrandJobTrackerId && (
                                        <Button design="Negative" icon="sys-cancel" onClick={cancelLazadaBrandSync}>
                                            {t('cancel')}
                                        </Button>
                                    )}
                                </>
                            }
                        />

                        <MappingToolbar compact>
                            <MappingSearchInput value={lazadaBrandSearch} onChange={setLazadaBrandSearch} placeholder={t('searchBrands')} />
                            <MappingPager
                                loading={loadingLazadaBrands}
                                perPage={lazadaBrandPerPage}
                                onPerPageChange={handleLazadaBrandPerPageChange}
                                currentPage={lazadaBrands?.current_page ?? 1}
                                lastPage={lazadaBrands?.last_page ?? 1}
                                onGoToPage={goToLazadaBrandPage}
                            />
                        </MappingToolbar>

                        <FioriResponsiveTable
                            columns={lazadaBrandColumns}
                            rows={lazadaBrands?.data ?? []}
                            getRowKey={(brand: LazadaBrandRow) => brand.id}
                            emptyMessage={loadingLazadaBrands ? <MappingLoading /> : t('noBrandsFound')}
                        />
                    </>
                )}

                {canEditAttributes && (
                    <>
                        <MappingSectionHeader
                            title={
                                selectedCategory
                                    ? t('lazadaAttributesForCategory', { name: selectedCategory.name })
                                    : t('lazadaAttributesSectionTitle')
                            }
                            message={selectedCategory ? lazadaAttributeSyncMessage : undefined}
                            actions={
                                selectedCategory && (
                                    <MappingSyncButton busy={lazadaAttributeSyncing} onClick={triggerLazadaAttributeSync}>
                                        {lazadaAttributeSyncing ? t('syncingAttributes') : t('syncAttributesForCategory')}
                                    </MappingSyncButton>
                                )
                            }
                        />

                        {!selectedCategory ? (
                            <MappingEmptyPrompt>{t('selectCategoryPrompt')}</MappingEmptyPrompt>
                        ) : (
                            <FioriResponsiveTable
                                columns={lazadaAttributeColumns}
                                rows={lazadaAttributes ?? []}
                                getRowKey={(attribute: LazadaAttributeRow) => attribute.name}
                                emptyMessage={loadingLazadaAttributes ? <MappingLoading /> : t('noAttributesInCategory')}
                            />
                        )}
                    </>
                )}
            </MappingPage>
        </AppLayout>
    );
}
