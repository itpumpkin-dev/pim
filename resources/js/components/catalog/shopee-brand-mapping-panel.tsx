import {
    MappingLoading,
    MappingPager,
    MappingPickerCell,
    MappingSearchInput,
    MappingSectionHeader,
    mappingStyles,
    MappingSyncButton,
    MappingToolbar,
} from '@/components/catalog/marketplace-mapping-ui';
import { PimBrandPicker, type PimBrandOption } from '@/components/catalog/pim-brand-picker';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import { xsrfToken } from '@/lib/csrf';
import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ShopeeBrandRow {
    id: number;
    name: string;
    mapped: { id: number; name: string } | null;
}

export interface ShopeeBrandMappingPanelProps {
    /** Shopee's own category id (activeProduct.shopee_category.id) — every endpoint here is scoped by this alone, no PIM category involved. */
    shopeeCategoryId: number;
    shopeeCategoryName: string;
}

/**
 * Extracted from categories/shopee-mapping.tsx's "Shopee Brands" section
 * (moved wholesale, not duplicated — that page no longer renders one) so it
 * shows up right where an admin is already looking when a product's push
 * fails on a missing/invalid brand: this product's own Object Page
 * (shopee-products.tsx, Section 2). The old page required picking a PIM
 * category first just to reach this table, with no link back from the
 * product page that actually needs it.
 *
 * Every endpoint here (list/sync/save) is scoped purely by Shopee's own
 * category id — never the PIM category — so lifting it out just meant
 * swapping `selectedCategory.id` (a `ShopeeRow` from that page's own table)
 * for this prop.
 */
export function ShopeeBrandMappingPanel({ shopeeCategoryId, shopeeCategoryName }: ShopeeBrandMappingPanelProps) {
    const { t } = useTranslation('catalog');

    const [brands, setBrands] = useState<ShopeeBrandRow[] | null>(null);
    const [brandsMeta, setBrandsMeta] = useState<{ currentPage: number; lastPage: number; total: number } | null>(null);
    const [brandSearch, setBrandSearch] = useState('');
    const [brandPerPage, setBrandPerPage] = useState(25);
    const [loadingBrands, setLoadingBrands] = useState(false);
    const [brandSyncing, setBrandSyncing] = useState(false);
    const [brandSyncMessage, setBrandSyncMessage] = useState('');
    const [savingBrandId, setSavingBrandId] = useState<number | null>(null);
    const brandPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstSearchRender = useRef(true);
    // ตั้งค่าไว้ก่อนที่การสลับหมวดหมู่จะรีเซ็ต brandSearch เป็น '' — ไม่งั้นการเปลี่ยน
    // state ตรงนี้จะไปทริกเกอร์ effect ค้นหาแบบ debounced ด้านล่างด้วย ทำให้ยิง fetch
    // ซ้ำซ้อนอีกรอบหลังจากที่ effect ตอนสลับหมวดหมู่ยิงไปแล้วรอบหนึ่ง
    const skipNextSearchDebounce = useRef(false);

    useEffect(() => {
        return () => {
            if (brandPollTimer.current) clearTimeout(brandPollTimer.current);
        };
    }, []);

    // รายการแบรนด์ของหมวดหมู่หนึ่งอาจมีได้เป็นหลักหมื่น (เจอจริงมาแล้ว: 12,102 รายการ
    // ในหมวดหมู่จริงหมวดเดียว) เลยต้องทำ pagination + search
    const loadBrands = (opts: { search?: string; page?: number; perPage?: number } = {}) => {
        const search = opts.search ?? brandSearch;
        const page = opts.page ?? 1;
        const perPage = opts.perPage ?? brandPerPage;

        setLoadingBrands(true);
        const params = new URLSearchParams({ search, page: String(page), per_page: String(perPage) });

        fetch(`/catalog/categories/${shopeeCategoryId}/shopee-brands?${params.toString()}`, { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : { data: [], current_page: 1, last_page: 1, total: 0 }))
            .then((body: { data: ShopeeBrandRow[]; current_page: number; last_page: number; total: number }) => {
                setBrands(body.data);
                setBrandsMeta({ currentPage: body.current_page, lastPage: body.last_page, total: body.total });
            })
            .finally(() => setLoadingBrands(false));
    };

    // พอเปลี่ยนหมวดหมู่ Shopee ของสินค้านี้ ให้ล้างรายการแบรนด์/สถานะ sync เดิมทิ้งไปเลย
    useEffect(() => {
        setBrands(null);
        setBrandsMeta(null);
        setBrandSyncMessage('');
        if (brandPollTimer.current) clearTimeout(brandPollTimer.current);
        skipNextSearchDebounce.current = true;
        setBrandSearch('');
        loadBrands({ search: '', page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shopeeCategoryId]);

    useEffect(() => {
        if (firstSearchRender.current) {
            firstSearchRender.current = false;
            return;
        }
        if (skipNextSearchDebounce.current) {
            skipNextSearchDebounce.current = false;
            return;
        }

        const timeout = setTimeout(() => loadBrands({ search: brandSearch, page: 1 }), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brandSearch]);

    const handlePerPageChange = (value: number) => {
        setBrandPerPage(value);
        loadBrands({ search: brandSearch, page: 1, perPage: value });
    };

    const goToPage = (page: number) => {
        loadBrands({ search: brandSearch, page });
    };

    const pollBrandSync = (jobTrackerId: number) => {
        fetch(`/catalog/brands/sync-jobs/${jobTrackerId}/status`, { headers: { Accept: 'application/json' } })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok) {
                    setBrandSyncing(false);
                    setBrandSyncMessage(body.message ?? 'Could not check sync status.');
                    return;
                }

                if (body.status === 'completed') {
                    setBrandSyncing(false);
                    setBrandSyncMessage(t('brandsSyncedCount', { count: body.total_records_created ?? 0 }));
                    loadBrands({ search: brandSearch, page: 1 });
                    router.reload({ only: ['categories'] });
                    return;
                }

                if (body.status === 'failed' || body.status === 'cancelled') {
                    setBrandSyncing(false);
                    setBrandSyncMessage(body.error_log?.[0]?.message ?? 'Sync failed.');
                    return;
                }

                brandPollTimer.current = setTimeout(() => pollBrandSync(jobTrackerId), 2000);
            })
            .catch(() => {
                setBrandSyncing(false);
                setBrandSyncMessage('Network error while checking sync status.');
            });
    };

    const triggerBrandSync = () => {
        setBrandSyncing(true);
        setBrandSyncMessage('');

        fetch('/catalog/categories/shopee-mapping/sync-brands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ shopee_category_id: shopeeCategoryId }),
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_tracker_id) {
                    setBrandSyncing(false);
                    setBrandSyncMessage(body.message ?? 'Could not start sync.');
                    return;
                }

                pollBrandSync(body.job_tracker_id);
            })
            .catch(() => {
                setBrandSyncing(false);
                setBrandSyncMessage('Network error while starting sync.');
            });
    };

    // `optionId` คือแถว PIM AttributeOption ที่จะถูกเขียนค่าลงไปจริงๆ
    // (attribute_options.shopee_brand_id) — ถ้าเป็นการจับคู่ใหม่ ก็คือ id ของแบรนด์ PIM
    // ที่เพิ่งเลือก แต่ถ้าเป็นการล้าง mapping เดิม ก็คือ PIM id ของ mapping เดิมนั้น
    // ไม่ใช่อะไรที่คำนวณมาจาก `shopeeBrandId` ส่วน `display` คือสิ่งที่จะโชว์ในแถวหลังจากนั้น
    const persistBrand = (shopeeBrandId: number, optionId: number, newShopeeId: number | null, display: { id: number; name: string } | null) => {
        setSavingBrandId(shopeeBrandId);
        fetch('/catalog/brands/shopee-mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ mappings: [{ option_id: optionId, marketplace_brand_id: newShopeeId }] }),
        })
            .then((res) => {
                if (!res.ok) return;
                setBrands((prev) => (prev ? prev.map((b) => (b.id === shopeeBrandId ? { ...b, mapped: display } : b)) : prev));
            })
            .finally(() => setSavingBrandId(null));
    };

    const assignBrand = (shopeeBrandId: number, pimBrand: PimBrandOption) => {
        persistBrand(shopeeBrandId, pimBrand.id, shopeeBrandId, { id: pimBrand.id, name: pimBrand.name });
    };

    const clearBrand = (shopeeBrandId: number, currentPimOptionId: number) => {
        persistBrand(shopeeBrandId, currentPimOptionId, null, null);
    };

    const brandColumns: FioriResponsiveColumn<ShopeeBrandRow>[] = [
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
                <MappingPickerCell saving={savingBrandId === brand.id}>
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
                </MappingPickerCell>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <MappingSectionHeader
                small
                title={t('brandsForCategory', { name: shopeeCategoryName })}
                message={brandSyncMessage}
                actions={
                    <MappingSyncButton busy={brandSyncing} onClick={triggerBrandSync}>
                        {brandSyncing ? t('syncingBrands') : t('syncBrandsForCategory')}
                    </MappingSyncButton>
                }
            />

            <MappingToolbar compact>
                <MappingSearchInput value={brandSearch} onChange={setBrandSearch} placeholder={t('searchBrands')} />
                <MappingPager
                    loading={loadingBrands}
                    perPage={brandPerPage}
                    onPerPageChange={handlePerPageChange}
                    currentPage={brandsMeta?.currentPage ?? 1}
                    lastPage={brandsMeta?.lastPage ?? 1}
                    onGoToPage={goToPage}
                />
            </MappingToolbar>

            <FioriResponsiveTable
                columns={brandColumns}
                rows={brands ?? []}
                getRowKey={(brand: ShopeeBrandRow) => brand.id}
                emptyMessage={loadingBrands ? <MappingLoading /> : t('noBrandsInCategory')}
            />
        </div>
    );
}
