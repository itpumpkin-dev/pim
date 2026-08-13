import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FilterListIcon from '@mui/icons-material/FilterList';
import SyncIcon from '@mui/icons-material/Sync';
import LinkIcon from '@mui/icons-material/Link';
import { Box, Button, CircularProgress, InputAdornment, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';

interface CategoryItem {
    id: number;
    code: string;
    name: string;
    description: string | null;
    parent_id: number | null;
    parent?: CategoryItem | null;
    children_count?: number;
    products_count?: number;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: { url: string | null; label: string; active: boolean }[];
}

interface Props {
    categories: PaginatedData<CategoryItem>;
    filters: { search?: string; filters?: Record<string, FilterValue> };
    filterColumns: Record<string, GridColumn>;
}

// One button + platform picker instead of one dedicated button per platform
// (which doesn't scale — was literally "Sync Lazada Categories" hardcoded).
// Only Lazada actually has a working category sync today; adding the next
// platform's is just one more entry here plus its own backend route, not a
// new button/layout change on this page.
const CATEGORY_SYNC_PLATFORMS = [
    { value: 'lazada', label: 'Lazada', route: '/catalog/categories/sync-lazada' },
] as const;

export default function CategoryIndex({ categories, filters, filterColumns }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('categories'), href: '/catalog/categories' }
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('categories.create_categories');
    const canEdit = permissions.includes('categories.edit_categories');
    const canDelete = permissions.includes('categories.delete_categories');

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(categories.per_page ?? 15);
    const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [syncingLazada, setSyncingLazada] = useState(false);
    const [syncPlatform, setSyncPlatform] = useState<string>(CATEGORY_SYNC_PLATFORMS[0].value);
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/categories', { search, per_page: perPage, filters: activeFilters }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = categories.current_page ?? 1;
    const lastPage = categories.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/categories', { search, page, per_page: perPage, filters: activeFilters }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categories', { search, page: 1, per_page: value, filters: activeFilters }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/categories', { search, per_page: perPage, filters: next }, { preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('categories')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{tNav('categories')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: categories.total })}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5}>
                        {canEdit && (
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <Select
                                    value={syncPlatform}
                                    onChange={(e) => setSyncPlatform(e.target.value)}
                                    size="small"
                                    disabled={syncingLazada}
                                    sx={{ minWidth: 120 }}
                                >
                                    {CATEGORY_SYNC_PLATFORMS.map((p) => (
                                        <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                                    ))}
                                </Select>
                                <Button
                                    variant="outlined"
                                    startIcon={syncingLazada ? <CircularProgress size={16} /> : <SyncIcon />}
                                    disabled={syncingLazada}
                                    onClick={() => {
                                        const platform = CATEGORY_SYNC_PLATFORMS.find((p) => p.value === syncPlatform);
                                        if (!platform) return;
                                        setSyncingLazada(true);
                                        router.post(platform.route, {}, { onFinish: () => setSyncingLazada(false) });
                                    }}
                                >
                                    {syncingLazada ? t('syncingLazada') : t('syncCategories')}
                                </Button>
                            </Stack>
                        )}
                        {canEdit && (
                            <Button
                                variant="outlined"
                                startIcon={<LinkIcon />}
                                onClick={() => router.visit('/catalog/categories/lazada-mapping')}
                            >
                                {t('mapToLazada')}
                            </Button>
                        )}
                        {canCreate && (
                            <Button
                                sx={{ color: "white" }}
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => router.visit('/catalog/categories/create')}
                            >
                                {t('createCategory')}
                            </Button>
                        )}
                    </Stack>
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                    <TextField
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder={t('searchCategories')}
                        size="small"
                        sx={{ minWidth: 280 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Stack direction="row" alignItems="center" spacing={1.5}>
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
                            {tGrid('filter')}
                            {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                        </Button>
                        <Select
                            value={perPage}
                            onChange={(e) => handlePerPageChange(Number(e.target.value))}
                            size="small"
                            sx={{ minWidth: 60, height: 36 }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={15}>15</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
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

                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('code')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('name')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('parent')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('description')}</TableCell>
                                {(canEdit || canDelete) && <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {categories.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell>{row.code}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                                    <TableCell>
                                        {row.parent ? (
                                            <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
                                                {row.parent.name}
                                            </Typography>
                                        ) : (
                                            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                                                {t('rootCategory')}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {row.description ?? '-'}
                                    </TableCell>
                                    {(canEdit || canDelete) && (
                                        <TableCell align="right">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                                {canEdit && (
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => router.visit(`/catalog/categories/${row.id}/edit`)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                {canDelete && (
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => setDeleteCategoryId(row.id)}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Box>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                            {categories.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        {t('noCategoriesFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            <Dialog open={deleteCategoryId !== null} onClose={() => setDeleteCategoryId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('confirmDeleteCategory')}
                    </DialogContentText>
                    {(() => {
                        const target = categories.data.find((c) => c.id === deleteCategoryId);
                        if (!target) return null;
                        const childCount = target.children_count ?? 0;
                        const productCount = target.products_count ?? 0;
                        if (childCount === 0 && productCount === 0) return null;

                        return (
                            <DialogContentText color="error" sx={{ mt: 1.5, fontWeight: 600 }}>
                                {childCount > 0 && t('deleteCategoryChildWarning', { count: childCount })}
                                {childCount > 0 && productCount > 0 && ' '}
                                {productCount > 0 && t('deleteCategoryProductWarning', { count: productCount })}
                            </DialogContentText>
                        );
                    })()}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteCategoryId(null)} color="inherit" sx={{ fontWeight: 'bold' }} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteCategoryId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/categories/${deleteCategoryId}`, {
                                    onSuccess: () => setDeleteCategoryId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        sx={{ fontWeight: 'bold' }}
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
            <GridFilterDrawer
                open={filterDrawerOpen}
                onClose={() => setFilterDrawerOpen(false)}
                columns={filterColumns}
                value={activeFilters}
                onApply={applyFilters}
                t={t}
            />
        </AppLayout>
    );
}
