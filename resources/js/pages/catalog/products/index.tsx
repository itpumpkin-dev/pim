import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import FilterListIcon from '@mui/icons-material/FilterList';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import CloseIcon from '@mui/icons-material/Close';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ManageColumnsDialog, type ManageColumnOption } from '@/components/manage-columns-dialog';
import {
    ProductFilterDrawer,
    type AttributeFilterRow,
    type ProductFamilyOption,
    type ProductFilters,
} from '@/components/product-filter-drawer';

interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
    filterable?: boolean;
}
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
interface ProductRow {
    id: number;
    sku: string;
    type: string;
    enabled: boolean;
    parent_id?: number | null;
    parent_sku?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    family_code?: string;
    family?: { id: number; code: string };
    name?: string | null;
    image_url?: string | null;
    completeness?: number | null;
    translation_completeness?: number | null;
    attribute_values?: Record<string, unknown>;
    sales_channels?: { total: number; platforms: Record<string, number> };
    [key: string]: unknown;
}
interface GridData {
    data: ProductRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface AttributeMeta {
    id: number;
    code: string;
    label: string;
    type: string;
    is_filterable?: boolean;
}
interface ExportColumnOption {
    code: string;
    label: string;
}
interface ExportCategoryOption {
    id: number;
    label: string;
}
interface CategoryTreeNode {
    id: number;
    code: string;
    name: string;
    children: CategoryTreeNode[];
}

function flattenCategoryTree(nodes: CategoryTreeNode[], depth = 0): ExportCategoryOption[] {
    return nodes.flatMap((node) => [
        { id: node.id, label: `${'— '.repeat(depth)}${node.name}` },
        ...flattenCategoryTree(node.children, depth + 1),
    ]);
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: {
        search?: string;
        sort?: string;
        dir?: string;
        filters?: ProductFilters;
        attribute_filters?: AttributeFilterRow[];
        category_id?: string | number;
        category_name?: string;
    };
    attributes: AttributeMeta[];
    families: ProductFamilyOption[];
}

const PRODUCT_COLUMNS_STORAGE_KEY = 'pim.products.columns';
const DEFAULT_SELECTED_COLUMNS = ['sku', 'image', 'name', 'family', 'status', 'type', 'complete', 'translation_complete', 'created_at', 'updated_at'];

/** UI column key -> real, sortable `products` column (per resources/grids/product_grid.yml). */
const SORTABLE_FIELDS: Record<string, string> = {
    sku: 'sku',
    status: 'enabled',
    type: 'type',
    created_at: 'created_at',
    updated_at: 'updated_at',
};

function formatAttributeCellValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

function AttributeThumbnail({ src, alt }: { src: string; alt: string }) {
    return (
        <Box
            sx={{
                width: 38,
                height: 38,
                bgcolor: '#f5f3ff',
                borderRadius: 2,
                border: '1px solid #ede9fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            <Box component="img" src={src} alt={alt} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </Box>
    );
}

function renderAttributeCellValue(attrType: string, value: unknown, alt: string): ReactNode {
    if (attrType === 'image') {
        return typeof value === 'string' && value ? (
            <AttributeThumbnail src={value} alt={alt} />
        ) : (
            <Typography variant="body2" color="text.disabled">-</Typography>
        );
    }

    if (attrType === 'gallery') {
        const urls = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        if (urls.length === 0) return <Typography variant="body2" color="text.disabled">-</Typography>;
        return (
            <Stack direction="row" alignItems="center" spacing={0.5}>
                <AttributeThumbnail src={urls[0]} alt={alt} />
                {urls.length > 1 && (
                    <Typography variant="caption" color="text.secondary">+{urls.length - 1}</Typography>
                )}
            </Stack>
        );
    }

    return formatAttributeCellValue(value);
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

interface ColumnDef {
    key: string;
    label: string;
    render: (row: ProductRow) => ReactNode;
    headerRender?: () => ReactNode;
}

export default function ProductIndex({ gridData, filters, attributes, families }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tNav } = useTranslation('nav');
    const { auth } = usePage<SharedData>().props;

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog').toUpperCase(), href: '#' },
        { title: tNav('products').toUpperCase(), href: '/catalog/products' },
    ];
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('products.create_products');
    const canEdit = permissions.includes('products.edit_products');
    const canDelete = permissions.includes('products.delete_products');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? 10);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    // Confirm-then-act, same shape as deleteProductId/deleting above — the
    // dialog being modal means only one duplicate can ever be in flight at a
    // time, so a single id (not a Set) is enough here.
    const [duplicateProductId, setDuplicateProductId] = useState<number | null>(null);
    const [duplicating, setDuplicating] = useState(false);

    const duplicateProduct = () => {
        if (duplicateProductId === null) return;
        setDuplicating(true);
        router.post(
            `/catalog/products/${duplicateProductId}/duplicate`,
            {},
            {
                onSuccess: () => setDuplicateProductId(null),
                onFinish: () => setDuplicating(false),
            },
        );
    };

    // "Check Live Status" — asks each marketplace directly (real API calls via
    // ProductController::checkLiveStatus()), not router.post(), since that
    // endpoint returns plain JSON rather than an Inertia response. Same
    // per-row Set(...) pattern as duplicatingIds above, for the same reason:
    // multiple rows can be checking concurrently without clobbering each
    // other's spinner/disabled state. Results are kept in a local override
    // map rather than triggering a full grid reload, so the rest of the
    // list (scroll position, other rows) is undisturbed.
    const [checkingLiveIds, setCheckingLiveIds] = useState<Set<number>>(new Set());
    const [liveStatusOverrides, setLiveStatusOverrides] = useState<Record<number, { total: number; platforms: Record<string, number> }>>({});
    const [liveStatusError, setLiveStatusError] = useState<string | null>(null);

    const checkLiveStatus = (productId: number) => {
        setCheckingLiveIds((prev) => new Set(prev).add(productId));

        // This app has no <meta name="csrf-token">; Laravel's VerifyCsrfToken
        // also accepts the XSRF-TOKEN cookie it already sets on every
        // response (mirrored back as a header), so read that instead.
        const xsrfToken = decodeURIComponent(
            document.cookie
                .split('; ')
                .find((row) => row.startsWith('XSRF-TOKEN='))
                ?.split('=')[1] ?? '',
        );

        fetch(`/catalog/products/${productId}/check-live-status`, {
            method: 'POST',
            headers: { 'X-XSRF-TOKEN': xsrfToken, Accept: 'application/json' },
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok) {
                    setLiveStatusError(body.message ?? t('checkLiveStatusFailed'));
                    return;
                }
                setLiveStatusOverrides((prev) => ({ ...prev, [productId]: body.sales_channels }));
                if (Array.isArray(body.errors) && body.errors.length > 0) {
                    setLiveStatusError(body.errors.join('; '));
                }
            })
            .catch(() => setLiveStatusError(t('checkLiveStatusFailed')))
            .finally(() =>
                setCheckingLiveIds((prev) => {
                    const next = new Set(prev);
                    next.delete(productId);
                    return next;
                }),
            );
    };
    const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
    const [quickExportOpen, setQuickExportOpen] = useState(false);
    const [exportColumns, setExportColumns] = useState<ExportColumnOption[]>([]);
    const [exportTypes, setExportTypes] = useState<('simple' | 'configurable')[]>([]);
    const [exportCategory, setExportCategory] = useState<ExportCategoryOption | null>(null);
    const [exportCategoryOptions, setExportCategoryOptions] = useState<ExportCategoryOption[]>([]);
    const [activeFilters, setActiveFilters] = useState<ProductFilters>(filters.filters ?? {});
    const [activeAttributeFilters, setActiveAttributeFilters] = useState<AttributeFilterRow[]>(filters.attribute_filters ?? []);
    // Arrived via the Categories list's clickable product count (see
    // resources/js/pages/catalog/categories/index.tsx) — not part of
    // activeFilters/ProductFilterDrawer since it's a one-off link-in, not a
    // filter a user builds through that drawer's UI.
    const [categoryId, setCategoryId] = useState(filters.category_id ? String(filters.category_id) : '');
    const [categoryName] = useState(filters.category_name ?? '');
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [sortField, setSortField] = useState(typeof filters.sort === 'string' ? filters.sort : '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const [exportFormat, setExportFormat] = useState<'CSV' | 'XLS' | 'XLSX'>('CSV');
    const firstRender = useRef(true);

    const allColumns: ColumnDef[] = useMemo(() => {
        const systemColumns: ColumnDef[] = [
            { key: 'id', label: t('id'), render: (row) => row.id },
            { key: 'parent', label: t('parent'), render: (row) => row.parent_sku || '-' },
            { key: 'sku', label: t('sku'), render: (row) => row.sku },
            {
                key: 'image',
                label: t('image'),
                render: (row) => (
                    <Box
                        sx={{
                            width: 38,
                            height: 38,
                            bgcolor: '#f5f3ff',
                            borderRadius: 2,
                            border: '1px solid #ede9fe',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                        }}
                    >
                        {row.image_url ? (
                            <Box
                                component="img"
                                src={row.image_url}
                                alt={row.name || row.sku}
                                sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            <CategoryOutlinedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
                        )}
                    </Box>
                ),
            },
            { key: 'name', label: t('name'), render: (row) => (typeof row.name === 'string' && row.name ? row.name : '-') },
            {
                key: 'family',
                label: t('attributeFamily'),
                render: (row) => row.family_code || row.family?.code || t('defaultFamily'),
                headerRender: () => (
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>{t('attributeFamily')}</span>
                        <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                    </Stack>
                ),
            },
            {
                key: 'status',
                label: t('status'),
                render: (row) => (
                    <Chip
                        label={row.enabled ? t('enabled') : t('disabled')}
                        size="small"
                        sx={{ bgcolor: row.enabled ? '#22c55e' : '#94a3b8', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                    />
                ),
            },
            {
                key: 'type',
                label: t('type'),
                render: (row) => (row.type === 'configurable' ? t('configurable') : t('simple')),
            },
            {
                key: 'complete',
                label: t('complete'),
                render: (row) => {
                    const completeness = row.completeness;
                    if (completeness === null || completeness === undefined) {
                        return (
                            <Chip
                                label={t('notApplicable')}
                                size="small"
                                sx={{ bgcolor: '#cbd5e1', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                            />
                        );
                    }
                    const color = completeness >= 80 ? '#22c55e' : completeness >= 50 ? '#f59e0b' : '#ef4444';
                    return (
                        <Chip
                            label={`${completeness}%`}
                            size="small"
                            sx={{ bgcolor: color, color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                        />
                    );
                },
            },
            {
                key: 'translation_complete',
                label: t('translationComplete'),
                render: (row) => {
                    const completeness = row.translation_completeness;
                    if (completeness === null || completeness === undefined) {
                        return (
                            <Chip
                                label={t('notApplicable')}
                                size="small"
                                sx={{ bgcolor: '#cbd5e1', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                            />
                        );
                    }
                    const color = completeness >= 80 ? '#22c55e' : completeness >= 50 ? '#f59e0b' : '#ef4444';
                    return (
                        <Chip
                            label={`${completeness}%`}
                            size="small"
                            sx={{ bgcolor: color, color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                        />
                    );
                },
            },
            {
                key: 'sales_channels',
                label: t('salesChannels'),
                render: (row) => {
                    const channels = liveStatusOverrides[row.id] ?? row.sales_channels;
                    const total = channels?.total ?? 0;
                    if (total === 0) {
                        return (
                            <Chip
                                label={t('notLive')}
                                size="small"
                                sx={{ bgcolor: '#cbd5e1', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                            />
                        );
                    }
                    const platforms = channels?.platforms ?? {};
                    const tooltip = Object.entries(platforms)
                        .map(([platform, count]) => `${platform}: ${count}`)
                        .join(', ');
                    return (
                        <Chip
                            label={t('liveOnCount', { count: total })}
                            title={tooltip}
                            size="small"
                            sx={{ bgcolor: '#22c55e', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                        />
                    );
                },
            },
            { key: 'created_at', label: t('createdAt'), render: (row) => formatDateTime(row.created_at) },
            { key: 'updated_at', label: t('updatedAt'), render: (row) => formatDateTime(row.updated_at) },
        ];

        const attributeColumns: ColumnDef[] = attributes
            .filter((attr) => attr.code !== 'name')
            .map((attr) => ({
                key: `attr_${attr.id}`,
                label: attr.label,
                render: (row) => renderAttributeCellValue(attr.type, row.attribute_values?.[attr.id], row.name || row.sku),
            }));

        return [...systemColumns, ...attributeColumns];
    }, [attributes, t, liveStatusOverrides]);

    const columnsCatalog: ManageColumnOption[] = useMemo(
        () => allColumns.map((col) => ({ key: col.key, label: col.label })),
        [allColumns],
    );

    // Matches ProductRowExporter::columns() (sku, family_code, type, enabled,
    // then every viewable attribute) — the export CSV's actual column set,
    // distinct from the grid's own display columnsCatalog above.
    const exportColumnCatalog: ExportColumnOption[] = useMemo(
        () => [
            { code: 'sku', label: t('sku') },
            { code: 'family_code', label: t('attributeFamily') },
            { code: 'type', label: t('type') },
            { code: 'enabled', label: t('status') },
            ...attributes.map((a) => ({ code: a.code, label: a.label || a.code })),
        ],
        [attributes, t],
    );

    const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>(() => {
        if (typeof window === 'undefined') return DEFAULT_SELECTED_COLUMNS;
        try {
            const stored = window.localStorage.getItem(PRODUCT_COLUMNS_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) return parsed;
            }
        } catch {
            // ignore malformed storage
        }
        return DEFAULT_SELECTED_COLUMNS;
    });

    useEffect(() => {
        const validKeys = new Set(allColumns.map((c) => c.key));
        const filtered = selectedColumnKeys.filter((k) => validKeys.has(k));
        if (filtered.length !== selectedColumnKeys.length) {
            setSelectedColumnKeys(filtered.length > 0 ? filtered : DEFAULT_SELECTED_COLUMNS);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allColumns]);

    useEffect(() => {
        if (!quickExportOpen || exportCategoryOptions.length > 0) {
            return;
        }
        fetch('/catalog/categories/tree', { headers: { Accept: 'application/json' } })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: CategoryTreeNode[]) => setExportCategoryOptions(flattenCategoryTree(data)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quickExportOpen]);

    const handleApplyColumns = (keys: string[]) => {
        setSelectedColumnKeys(keys);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(PRODUCT_COLUMNS_STORAGE_KEY, JSON.stringify(keys));
        }
    };

    const columnsByKey = new Map(allColumns.map((col) => [col.key, col]));
    const visibleColumns = selectedColumnKeys.map((key) => columnsByKey.get(key)).filter((c): c is ColumnDef => !!c);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get(
                '/catalog/products',
                { search, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
                { preserveState: true, replace: true },
            );
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const goToPage = (page: number) => {
        router.get(
            '/catalog/products',
            { search, page, per_page: perPage, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
            { preserveState: true },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get(
            '/catalog/products',
            { search, page: 1, per_page: value, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
            { preserveState: true },
        );
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get(
            '/catalog/products',
            { search, sort: field, dir: nextDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: categoryId },
            { preserveState: true },
        );
    };

    const applyFilters = (next: ProductFilters, nextAttributeFilters: AttributeFilterRow[]) => {
        setActiveFilters(next);
        setActiveAttributeFilters(nextAttributeFilters);
        router.get(
            '/catalog/products',
            { search, sort: sortField, dir: sortDir, filters: next, attribute_filters: nextAttributeFilters, category_id: categoryId },
            { preserveState: true },
        );
    };

    const clearCategoryFilter = () => {
        setCategoryId('');
        router.get(
            '/catalog/products',
            { search, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters, category_id: '' },
            { preserveState: true },
        );
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(gridData.data.map((row) => row.id));
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelectOne = (id: number, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((item) => item !== id));
        }
    };

    const handleQuickExport = () => {
        const params = new URLSearchParams();
        params.set('format', exportFormat.toLowerCase());
        exportColumns.forEach((col) => params.append('columns[]', col.code));
        if (selectedIds.length > 0) {
            // Explicit row selection means exactly these products — the
            // type/category pickers below are disabled in this state (see
            // the Autocomplete `disabled` props), so don't send them even if
            // stale values are still sitting in state from before selection.
            selectedIds.forEach((id) => params.append('ids[]', String(id)));
        } else {
            if (search) {
                params.set('search', search);
            }
            exportTypes.forEach((type) => params.append('types[]', type));
            if (exportCategory) {
                params.set('category_id', String(exportCategory.id));
            }
        }
        window.location.href = `/catalog/products/quick-export?${params.toString()}`;
        setQuickExportOpen(false);
    };

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('products')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: 'background.default', minHeight: '100%' }}>
                {/* Header Title & Actions */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        {t('products')}
                    </Typography>

                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="text"
                            startIcon={<FileUploadOutlinedIcon />}
                            onClick={() => setQuickExportOpen(true)}
                            sx={{
                                color: 'primary.main',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2,
                                '&:hover': { bgcolor: '#f5f3ff' },
                            }}
                        >
                            {t('quickExport')}
                        </Button>
                        {canCreate && (
                            <Button
                                variant="contained"
                                onClick={() => router.visit('/catalog/products/create')}
                                sx={{
                                    bgcolor: 'primary.main',
                                    color: '#fff',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    px: 2.5,
                                    py: 1,
                                    borderRadius: 1.5,
                                    '&:hover': { bgcolor: 'primary.dark' },
                                }}
                            >
                                {t('createProduct')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                {/* Search & Controls Row */}
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('search')}
                            size="small"
                            sx={{
                                bgcolor: '#fff',
                                borderRadius: 5,
                                '& .MuiOutlinedInput-root': { borderRadius: 5 },
                                minWidth: 240,
                            }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                        {categoryId && (
                            <Chip
                                label={t('filteredByCategory', { name: categoryName || categoryId })}
                                size="small"
                                onDelete={clearCategoryFilter}
                                color="primary"
                                variant="outlined"
                            />
                        )}
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                        <Button
                            variant="outlined"
                            startIcon={<ViewColumnOutlinedIcon />}
                            onClick={() => setColumnsDialogOpen(true)}
                            sx={{
                                color: '#64748b',
                                borderColor: '#cbd5e1',
                                textTransform: 'none',
                                borderRadius: 1.5,
                                bgcolor: '#fff',
                            }}
                        >
                            {t('columns')}
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                            onClick={() => setFilterDrawerOpen(true)}
                            sx={{
                                color: '#64748b',
                                borderColor: '#cbd5e1',
                                textTransform: 'none',
                                borderRadius: 1.5,
                                bgcolor: '#fff',
                            }}
                        >
                            {t('filter')}
                            {Object.keys(activeFilters).length + activeAttributeFilters.length > 0 &&
                                ` (${Object.keys(activeFilters).length + activeAttributeFilters.length})`}
                        </Button>

                        <Select
                            value={perPage}
                            onChange={(e) => handlePerPageChange(Number(e.target.value))}
                            size="small"
                            sx={{ bgcolor: '#fff', borderRadius: 1.5, minWidth: 60, height: 36 }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                        </Select>

                        <Typography variant="body2" color="text.secondary">
                            {t('perPage')}
                        </Typography>

                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderRadius: 1, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2">{currentPage}</Typography>
                        </Paper>

                        <Typography variant="body2" color="text.secondary">
                            {t('pageOf', { lastPage })}
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

                {/* Table */}
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <Table sx={{ minWidth: 800 }}>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        indeterminate={selectedIds.length > 0 && selectedIds.length < gridData.data.length}
                                        checked={gridData.data.length > 0 && selectedIds.length === gridData.data.length}
                                        onChange={(e) => handleSelectAll(e.target.checked)}
                                    />
                                </TableCell>
                                {visibleColumns.map((col) => {
                                    const sortKey = SORTABLE_FIELDS[col.key];

                                    return (
                                        <TableCell key={col.key} sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>
                                            {col.headerRender ? (
                                                col.headerRender()
                                            ) : sortKey ? (
                                                <TableSortLabel
                                                    active={sortField === sortKey}
                                                    direction={sortField === sortKey ? sortDir : 'asc'}
                                                    onClick={() => handleSort(sortKey)}
                                                >
                                                    {col.label}
                                                </TableSortLabel>
                                            ) : (
                                                col.label
                                            )}
                                        </TableCell>
                                    );
                                })}
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{t('actions')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {gridData.data.map((row) => {
                                const isSelected = selectedIds.includes(row.id);
                                return (
                                    <TableRow key={row.id} hover selected={isSelected}>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                checked={isSelected}
                                                onChange={(e) => handleSelectOne(row.id, e.target.checked)}
                                            />
                                        </TableCell>
                                        {visibleColumns.map((col) => (
                                            <TableCell key={col.key} sx={{ color: '#334155' }}>
                                                {col.render(row)}
                                            </TableCell>
                                        ))}
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                {canEdit && (
                                                    <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => router.visit(`/catalog/products/${row.id}/edit`)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                {canCreate && (
                                                    <Tooltip title={t('duplicateProduct')}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                sx={{ color: '#64748b' }}
                                                                onClick={() => setDuplicateProductId(row.id)}
                                                            >
                                                                <ContentCopyIcon fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                                {canEdit && (
                                                    <Tooltip title={t('checkLiveStatus')}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                sx={{ color: '#64748b' }}
                                                                disabled={checkingLiveIds.has(row.id)}
                                                                onClick={() => checkLiveStatus(row.id)}
                                                            >
                                                                {checkingLiveIds.has(row.id) ? (
                                                                    <CircularProgress size={16} color="inherit" />
                                                                ) : (
                                                                    <FactCheckOutlinedIcon fontSize="small" />
                                                                )}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                )}
                                                {canDelete && (
                                                    <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => setDeleteProductId(row.id)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                            {gridData.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={visibleColumns.length + 2} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                        {t('noProductsFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            {/* Quick Export Dialog */}
            <Dialog open={quickExportOpen} onClose={() => setQuickExportOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                    {t('quickExport')}
                    <IconButton size="small" onClick={() => setQuickExportOpen(false)}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <Divider />
                <DialogContent sx={{ pt: 3 }}>
                    <Stack spacing={2.5}>
                        <Autocomplete
                            disableClearable
                            options={['CSV', 'XLS', 'XLSX'] as const}
                            value={exportFormat}
                            onChange={(_e, value) => value && setExportFormat(value)}
                            renderInput={(params) => (
                                <TextField {...params} label={t('selectOption')} size="small" />
                            )}
                        />
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            options={exportColumnCatalog}
                            getOptionLabel={(opt) => opt.label}
                            isOptionEqualToValue={(a, b) => a.code === b.code}
                            value={exportColumns}
                            onChange={(_e, value) => setExportColumns(value)}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('exportColumns')}
                                    placeholder={exportColumns.length === 0 ? t('exportAllColumns') : undefined}
                                    size="small"
                                />
                            )}
                        />
                        <Autocomplete
                            multiple
                            disableCloseOnSelect
                            disabled={selectedIds.length > 0}
                            options={['simple', 'configurable'] as const}
                            getOptionLabel={(opt) => t(opt)}
                            value={exportTypes}
                            onChange={(_e, value) => setExportTypes(value)}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('exportProductTypes')}
                                    placeholder={exportTypes.length === 0 ? t('exportAllProductTypes') : undefined}
                                    helperText={selectedIds.length > 0 ? t('exportFiltersDisabledForSelection') : undefined}
                                    size="small"
                                />
                            )}
                        />
                        <Autocomplete
                            disabled={selectedIds.length > 0}
                            options={exportCategoryOptions}
                            getOptionLabel={(opt) => opt.label}
                            isOptionEqualToValue={(a, b) => a.id === b.id}
                            value={exportCategory}
                            onChange={(_e, value) => setExportCategory(value)}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label={t('exportCategory')}
                                    placeholder={!exportCategory ? t('exportAllCategories') : undefined}
                                    helperText={selectedIds.length > 0 ? t('exportFiltersDisabledForSelection') : undefined}
                                    size="small"
                                />
                            )}
                        />
                    </Stack>
                </DialogContent>
                <Divider />
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button onClick={() => setQuickExportOpen(false)} color="inherit" sx={{ textTransform: 'none' }}>
                        {t('cancel')}
                    </Button>
                    <Button onClick={handleQuickExport} variant="contained" sx={{ textTransform: 'none', fontWeight: 700, px: 3 }}>
                        {t('download')}
                    </Button>
                </DialogActions>
            </Dialog>

            <ManageColumnsDialog
                open={columnsDialogOpen}
                onClose={() => setColumnsDialogOpen(false)}
                columns={columnsCatalog}
                selected={selectedColumnKeys}
                onApply={handleApplyColumns}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteProductId !== null} onClose={() => setDeleteProductId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDeleteMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteProductId(null)} color="inherit" disabled={deleting}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteProductId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/products/${deleteProductId}`, {
                                    onSuccess: () => setDeleteProductId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Duplicate Confirmation Dialog */}
            <Dialog open={duplicateProductId !== null} onClose={() => setDuplicateProductId(null)}>
                <DialogTitle>{t('confirmDuplication')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDuplicateMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDuplicateProductId(null)} color="inherit" disabled={duplicating}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={duplicateProduct}
                        variant="contained"
                        disabled={duplicating}
                        startIcon={duplicating ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {t('duplicateProduct')}
                    </Button>
                </DialogActions>
            </Dialog>
            <ProductFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                families={families}
                attributes={attributes}
                filters={activeFilters}
                attributeFilters={activeAttributeFilters}
                onApply={applyFilters}
            />

            <Snackbar open={!!liveStatusError} autoHideDuration={8000} onClose={() => setLiveStatusError(null)}>
                <Alert severity="error" variant="filled" onClose={() => setLiveStatusError(null)} sx={{ maxWidth: 480 }}>
                    {liveStatusError}
                </Alert>
            </Snackbar>
        </AppLayout>
    );
}
