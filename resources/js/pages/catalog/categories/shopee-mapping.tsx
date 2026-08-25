import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
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

type ShopeeFilter = 'all' | 'leaf' | 'parent' | 'flagged';

interface MappedCategory {
    id: number;
    name: string;
}

interface ShopeeRow {
    id: number;
    name: string;
    path: string;
    leaf: boolean;
    mapped_categories: MappedCategory[];
    brand_count: number;
}

interface ShopeeBrandRow {
    id: number;
    name: string;
    mapped: { id: number; name: string } | null;
}

interface ShopeeAttributeRow {
    id: number;
    name: string;
    input_type: number | null;
    mandatory: boolean;
    mapped: { id: number; name: string } | null;
}

const MAPPABLE_ATTRIBUTE_INPUT_TYPE = 3; // FREE_TEXT_FILED — must match ShopeeAttributeMappingController::MAPPABLE_INPUT_TYPE

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

/** What a pending edit stages for one PIM category id: `null` clears its Shopee mapping; an object points it at a (possibly different) Shopee node. Keyed by PIM category id, not Shopee id — that's what bulkMapShopee() actually persists. */
interface PendingAssignment {
    shopeeId: number;
    pimName: string;
}

export default function ShopeeCategoryMapping({ categories, stats, lastSyncedAt, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    // The Shopee Brands table below (sync + PIM mapping for whichever
    // category is selected) writes brand data, not category data — gated on
    // brands.edit_brands same as the old dedicated brand mapping page was,
    // even though both now live on this categories.edit_categories-gated
    // page.
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEditBrands = permissions.includes('brands.edit_brands');
    const canEditAttributes = permissions.includes('attributes.edit_attributes');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('management'), href: '/catalog/management' },
        { title: t('manageEcommerceMarketplaceTab'), href: '/catalog/management/marketplace' },
        { title: t('marketplaceSyncTitle'), href: '/catalog/categories/marketplace-sync' },
        { title: t('shopeeMappingTitle'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [filter, setFilter] = useState<ShopeeFilter>(filters.filter ?? 'all');
    const [perPage, setPerPage] = useState<number>(categories.per_page ?? 25);
    const [pending, setPending] = useState<Record<number, PendingAssignment | null>>({});
    const [assigningFor, setAssigningFor] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [syncingCategories, setSyncingCategories] = useState(false);

    // The dedicated Shopee Brands table below the categories table — driven
    // by whichever leaf category row was last clicked, not a per-row
    // expander anymore (get_brand_list's own category scoping means only
    // one category's brands are ever relevant at a time, so a full-width
    // "detail" table reads better than squeezing a picker into every row).
    const [selectedCategory, setSelectedCategory] = useState<ShopeeRow | null>(null);
    const [brands, setBrands] = useState<ShopeeBrandRow[] | null>(null);
    const [brandsMeta, setBrandsMeta] = useState<{ currentPage: number; lastPage: number; total: number } | null>(null);
    const [brandSearch, setBrandSearch] = useState('');
    const [brandPerPage, setBrandPerPage] = useState(25);
    const [loadingBrands, setLoadingBrands] = useState(false);
    const [brandSyncing, setBrandSyncing] = useState(false);
    const [brandSyncMessage, setBrandSyncMessage] = useState('');
    const [savingBrandId, setSavingBrandId] = useState<number | null>(null);
    const brandPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRender = useRef(true);
    const firstBrandSearchRender = useRef(true);
    // Set right before a category switch resets brandSearch to '' — that
    // state change would otherwise also trigger the debounced search effect
    // below, firing a second, redundant fetch a moment after the immediate
    // one the category-switch effect already made.
    const skipNextSearchDebounce = useRef(false);

    useEffect(() => {
        return () => {
            if (brandPollTimer.current) clearTimeout(brandPollTimer.current);
        };
    }, []);

    // A category's brand list can run into five figures (confirmed live:
    // 12,102 for one real category), so this is paginated + searched the
    // same way the categories table above it is — fetching and rendering
    // every row at once is what made this table slow to open.
    const loadBrands = (shopeeCategoryId: number, opts: { search?: string; page?: number; perPage?: number } = {}) => {
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

    // Selecting a different category drops whatever brand list/sync state
    // belonged to the previous one — they're unrelated categories, nothing
    // here should carry over.
    useEffect(() => {
        setBrands(null);
        setBrandsMeta(null);
        setBrandSyncMessage('');
        if (brandPollTimer.current) clearTimeout(brandPollTimer.current);
        skipNextSearchDebounce.current = true;
        setBrandSearch('');
        if (selectedCategory) loadBrands(selectedCategory.id, { search: '', page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCategory?.id]);

    useEffect(() => {
        if (firstBrandSearchRender.current) {
            firstBrandSearchRender.current = false;
            return;
        }
        if (skipNextSearchDebounce.current) {
            skipNextSearchDebounce.current = false;
            return;
        }
        if (!selectedCategory) return;

        const timeout = setTimeout(() => loadBrands(selectedCategory.id, { search: brandSearch, page: 1 }), 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brandSearch]);

    const handleBrandPerPageChange = (value: number) => {
        setBrandPerPage(value);
        if (selectedCategory) loadBrands(selectedCategory.id, { search: brandSearch, page: 1, perPage: value });
    };

    const goToBrandPage = (page: number) => {
        if (selectedCategory) loadBrands(selectedCategory.id, { search: brandSearch, page });
    };

    const pollBrandSync = (shopeeCategoryId: number, jobTrackerId: number) => {
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
                    loadBrands(shopeeCategoryId, { search: brandSearch, page: 1 });
                    router.reload({ only: ['categories'] });
                    return;
                }

                if (body.status === 'failed' || body.status === 'cancelled') {
                    setBrandSyncing(false);
                    setBrandSyncMessage(body.error_log?.[0]?.message ?? 'Sync failed.');
                    return;
                }

                brandPollTimer.current = setTimeout(() => pollBrandSync(shopeeCategoryId, jobTrackerId), 2000);
            })
            .catch(() => {
                setBrandSyncing(false);
                setBrandSyncMessage('Network error while checking sync status.');
            });
    };

    const triggerBrandSync = () => {
        if (!selectedCategory) return;
        setBrandSyncing(true);
        setBrandSyncMessage('');

        fetch('/catalog/categories/shopee-mapping/sync-brands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrfToken() },
            body: JSON.stringify({ shopee_category_id: selectedCategory.id }),
        })
            .then(async (res) => {
                const body = await res.json();

                if (!res.ok || !body.job_tracker_id) {
                    setBrandSyncing(false);
                    setBrandSyncMessage(body.message ?? 'Could not start sync.');
                    return;
                }

                pollBrandSync(selectedCategory.id, body.job_tracker_id);
            })
            .catch(() => {
                setBrandSyncing(false);
                setBrandSyncMessage('Network error while starting sync.');
            });
    };

    // `optionId` is which PIM AttributeOption row actually gets written to
    // (attribute_options.shopee_brand_id) — for a fresh assignment that's
    // the newly-picked PIM brand's own id; for clearing an existing one it's
    // that existing mapping's PIM id, not anything derived from
    // `shopeeBrandId`. `display` is what the row should show afterward.
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

    // The Shopee Attributes table — same "select a leaf category above"
    // detail-table pattern as the Brands table, but synchronous (no
    // JobTracker/polling): get_attribute_tree has no pagination and a
    // category's schema is small, so ShopeeAttributeMappingController::
    // syncShopeeAttributesForCategory() just returns the result directly.
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

    // `pimAttributeId` is which PIM Attribute row actually gets written to
    // (a shopee_attribute_mappings row keyed by attribute_id) — for a fresh
    // assignment that's the newly-picked PIM attribute's own id; for
    // clearing an existing one it's that existing mapping's PIM id.
    // `targetField` null clears the mapping (ShopeeAttributeMappingController::
    // update() deletes the row); 'shopee_attribute' sets it.
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

    // Any navigation (page/filter/search change, or a completed save) hands
    // us a fresh `categories` prop — pending picks made against the previous
    // set of rows no longer apply, so drop them rather than let them leak
    // into a future save.
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

    // A row counts as "pending" (for the dashed row highlight) in either
    // direction: one of its existing PIM mappings is being cleared/moved
    // away, or a fresh assignment is landing on it from a different PIM
    // category.
    const rowHasPendingChange = (row: ShopeeRow) =>
        row.mapped_categories.some((pc) => pc.id in pending) || Object.values(pending).some((assignment) => assignment?.shopeeId === row.id);

    const columns: FioriResponsiveColumn<ShopeeRow>[] = [
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
                <Stack spacing={0.25} alignItems="flex-start">
                    <Chip
                        label={row.leaf ? t('leafLabel') : t('parentLabel')}
                        size="small"
                        sx={{
                            bgcolor: row.leaf ? FIORI.successBg : FIORI.neutralBg,
                            color: row.leaf ? FIORI.success : FIORI.textSecondary,
                            fontWeight: 600,
                        }}
                    />
                    {row.leaf && row.brand_count > 0 && (
                        <Typography variant="caption" color="text.secondary">
                            {t('brandsInCategory', { count: row.brand_count })}
                        </Typography>
                    )}
                </Stack>
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

                // Everything currently mapped to this Shopee node, folded
                // together with any pending edit against that same PIM
                // category — including one that moves it elsewhere, which
                // has to render here as "will clear" too.
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

                    const label = staged && staged.shopeeId === row.id ? `${t('willMapTo')}: ${pc.name}` : `${t('willClearMapping')}: ${pc.name}`;
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

                // A PIM category not currently listed here, but staged (from
                // its own row elsewhere on this page) to move onto this one.
                const newlyAssigned = Object.entries(pending)
                    .filter((entry): entry is [string, PendingAssignment] => {
                        const [pimId, assignment] = entry;
                        return assignment !== null && assignment.shopeeId === row.id && !existingIds.has(Number(pimId));
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

    const brandColumns: FioriResponsiveColumn<ShopeeBrandRow>[] = [
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

    const attributeColumns: FioriResponsiveColumn<ShopeeAttributeRow>[] = [
        {
            key: 'id',
            header: t('idColumn'),
            priority: 'high',
            align: 'right',
            width: 120,
            render: (attribute) => (
                <Typography variant="body2" sx={{ fontFamily: 'monospace', color: FIORI.textSecondary }}>
                    {attribute.id}
                </Typography>
            ),
        },
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
            key: 'type',
            header: t('typeColumn'),
            priority: 'medium',
            render: (attribute) => (
                <Typography variant="caption" color="text.secondary">
                    {attribute.input_type != null && ATTRIBUTE_INPUT_TYPE_LABEL_KEYS[attribute.input_type]
                        ? t(ATTRIBUTE_INPUT_TYPE_LABEL_KEYS[attribute.input_type])
                        : t('inputTypeUnknown')}
                </Typography>
            ),
        },
        {
            key: 'mapping',
            header: t('attributeMappingColumn'),
            priority: 'high',
            minWidth: 260,
            render: (attribute) => {
                if (attribute.input_type !== MAPPABLE_ATTRIBUTE_INPUT_TYPE) {
                    return (
                        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                            {t('notMappableAttribute')}
                        </Typography>
                    );
                }

                return (
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ flex: 1, minWidth: 200 }}>
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
                        </Box>
                        {savingAttributeId === attribute.id && <CircularProgress size={14} />}
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
            <Head title={t('shopeeMappingTitle')} />
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
                        <Typography variant="h4" fontWeight={700}>{t('shopeeMappingTitle')}</Typography>
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
                            onChange={(_event, value: ShopeeFilter | null) => value && applyFilter(value)}
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
                            <Typography variant="h6" fontWeight={700}>
                                {selectedCategory ? t('brandsForCategory', { name: selectedCategory.name }) : t('shopeeBrandsSectionTitle')}
                            </Typography>

                            {selectedCategory && (
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
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {brandSyncing ? t('syncingBrands') : t('syncBrandsForCategory')}
                                    </Button>
                                </Stack>
                            )}
                        </Stack>

                        {!selectedCategory ? (
                            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                                <Typography color="text.secondary">{t('selectCategoryPrompt')}</Typography>
                            </Paper>
                        ) : (
                            <>
                                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
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

                                        <Select value={brandPerPage} onChange={(e) => handleBrandPerPageChange(Number(e.target.value))} size="small" sx={{ minWidth: 60, height: 36 }}>
                                            <MenuItem value={10}>10</MenuItem>
                                            <MenuItem value={25}>25</MenuItem>
                                            <MenuItem value={50}>50</MenuItem>
                                            <MenuItem value={100}>100</MenuItem>
                                        </Select>
                                        <Typography variant="body2" color="text.secondary">{tGrid('perPage')}</Typography>

                                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center' }}>
                                            <Typography variant="body2">{brandsMeta?.currentPage ?? 1}</Typography>
                                        </Paper>
                                        <Typography variant="body2" color="text.secondary">{tGrid('pageOf', { lastPage: brandsMeta?.lastPage ?? 1 })}</Typography>

                                        <Stack direction="row" spacing={0.2}>
                                            <IconButton size="small" disabled={(brandsMeta?.currentPage ?? 1) <= 1} onClick={() => goToBrandPage(1)}><FirstPageIcon fontSize="small" /></IconButton>
                                            <IconButton size="small" disabled={(brandsMeta?.currentPage ?? 1) <= 1} onClick={() => goToBrandPage((brandsMeta?.currentPage ?? 1) - 1)}><ChevronLeftIcon fontSize="small" /></IconButton>
                                            <IconButton size="small" disabled={(brandsMeta?.currentPage ?? 1) >= (brandsMeta?.lastPage ?? 1)} onClick={() => goToBrandPage((brandsMeta?.currentPage ?? 1) + 1)}><ChevronRightIcon fontSize="small" /></IconButton>
                                            <IconButton size="small" disabled={(brandsMeta?.currentPage ?? 1) >= (brandsMeta?.lastPage ?? 1)} onClick={() => goToBrandPage(brandsMeta?.lastPage ?? 1)}><LastPageIcon fontSize="small" /></IconButton>
                                        </Stack>
                                    </Stack>
                                </Stack>

                                <FioriResponsiveTable
                                    columns={brandColumns}
                                    rows={brands ?? []}
                                    getRowKey={(brand) => brand.id}
                                    emptyMessage={loadingBrands ? <CircularProgress size={20} /> : t('noBrandsInCategory')}
                                />
                            </>
                        )}
                    </>
                )}

                {canEditAttributes && (
                    <>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 5, mb: 2 }}>
                            <Typography variant="h6" fontWeight={700}>
                                {selectedCategory ? t('attributesForCategory', { name: selectedCategory.name }) : t('shopeeAttributesSectionTitle')}
                            </Typography>

                            {selectedCategory && (
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    {attributeSyncMessage && (
                                        <Typography variant="caption" color="text.secondary">
                                            {attributeSyncMessage}
                                        </Typography>
                                    )}
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        disabled={attributeSyncing}
                                        startIcon={attributeSyncing ? <CircularProgress size={14} /> : <SyncIcon fontSize="small" />}
                                        onClick={triggerAttributeSync}
                                        sx={{ textTransform: 'none' }}
                                    >
                                        {attributeSyncing ? t('syncingAttributes') : t('syncAttributesForCategory')}
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
                                columns={attributeColumns}
                                rows={attributes ?? []}
                                getRowKey={(attribute) => attribute.id}
                                emptyMessage={loadingAttributes ? <CircularProgress size={20} /> : t('noAttributesInCategory')}
                            />
                        )}
                    </>
                )}
            </Box>
        </AppLayout>
    );
}
