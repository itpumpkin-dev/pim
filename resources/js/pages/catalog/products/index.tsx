import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
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
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
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
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    TextField,
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
    attribute_values?: Record<string, unknown>;
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
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string; filters?: ProductFilters; attribute_filters?: AttributeFilterRow[] };
    attributes: AttributeMeta[];
    families: ProductFamilyOption[];
}

const PRODUCT_COLUMNS_STORAGE_KEY = 'pim.products.columns';
const DEFAULT_SELECTED_COLUMNS = ['sku', 'image', 'name', 'family', 'status', 'type', 'complete', 'created_at', 'updated_at'];

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
    const canCreate = permissions.includes('products.create_products') || true;
    const canEdit = permissions.includes('products.edit_products') || true;
    const canDelete = permissions.includes('products.delete_products') || true;

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(gridData.per_page ?? 10);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [deleteProductId, setDeleteProductId] = useState<number | null>(null);
    const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
    const [quickExportOpen, setQuickExportOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState<ProductFilters>(filters.filters ?? {});
    const [activeAttributeFilters, setActiveAttributeFilters] = useState<AttributeFilterRow[]>(filters.attribute_filters ?? []);
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
                render: () => (
                    <Chip
                        label={t('notApplicable')}
                        size="small"
                        sx={{ bgcolor: '#cbd5e1', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                    />
                ),
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
    }, [attributes, t]);

    const columnsCatalog: ManageColumnOption[] = useMemo(
        () => allColumns.map((col) => ({ key: col.key, label: col.label })),
        [allColumns],
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
                { search, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters },
                { preserveState: true, replace: true },
            );
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const goToPage = (page: number) => {
        router.get(
            '/catalog/products',
            { search, page, per_page: perPage, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters },
            { preserveState: true },
        );
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get(
            '/catalog/products',
            { search, page: 1, per_page: value, sort: sortField, dir: sortDir, filters: activeFilters, attribute_filters: activeAttributeFilters },
            { preserveState: true },
        );
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get(
            '/catalog/products',
            { search, sort: field, dir: nextDir, filters: activeFilters, attribute_filters: activeAttributeFilters },
            { preserveState: true },
        );
    };

    const applyFilters = (next: ProductFilters, nextAttributeFilters: AttributeFilterRow[]) => {
        setActiveFilters(next);
        setActiveAttributeFilters(nextAttributeFilters);
        router.get(
            '/catalog/products',
            { search, sort: sortField, dir: sortDir, filters: next, attribute_filters: nextAttributeFilters },
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
        if (selectedIds.length > 0) {
            selectedIds.forEach((id) => params.append('ids[]', String(id)));
        } else if (search) {
            params.set('search', search);
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
                                                <IconButton size="small" sx={{ color: '#64748b' }}>
                                                    <ContentCopyIcon fontSize="small" />
                                                </IconButton>
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
            <Dialog open={quickExportOpen} onClose={() => setQuickExportOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                    {t('download')}
                    <IconButton size="small" onClick={() => setQuickExportOpen(false)}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </DialogTitle>
                <Divider />
                <DialogContent sx={{ pt: 3 }}>
                    <Autocomplete
                        disableClearable
                        options={['CSV', 'XLS', 'XLSX'] as const}
                        value={exportFormat}
                        onChange={(_e, value) => value && setExportFormat(value)}
                        renderInput={(params) => (
                            <TextField {...params} label={t('selectOption')} size="small" />
                        )}
                    />
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
                    <Button onClick={() => setDeleteProductId(null)} color="inherit">
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteProductId !== null) {
                                router.delete(`/catalog/products/${deleteProductId}`, {
                                    onSuccess: () => setDeleteProductId(null),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                    >
                        {t('delete')}
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
        </AppLayout>
    );
}
