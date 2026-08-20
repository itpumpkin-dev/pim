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
import DownloadIcon from '@mui/icons-material/Download';
import { Box, Button, Chip, CircularProgress, InputAdornment, MenuItem, Paper, Select, Stack, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';

interface CategoryItem {
    id: number;
    code: string;
    name: string;
    slug: string | null;
    thumbnail_url: string | null;
    description: string | null;
    parent_id: number | null;
    parent?: CategoryItem | null;
    children_count?: number;
    products_count?: number;
    is_active: boolean;
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
    filters: { search?: string; filters?: Record<string, FilterValue>; sort?: string; dir?: string };
    filterColumns: Record<string, GridColumn>;
}

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
    const [activeFilters, setActiveFilters] = useState<Record<string, FilterValue>>(filters.filters ?? {});
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const [sortField, setSortField] = useState(filters.sort ?? '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/categories', { search, per_page: perPage, filters: activeFilters, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = categories.current_page ?? 1;
    const lastPage = categories.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/categories', { search, page, per_page: perPage, filters: activeFilters, sort: sortField, dir: sortDir }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categories', { search, page: 1, per_page: value, filters: activeFilters, sort: sortField, dir: sortDir }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/categories', { search, per_page: perPage, filters: next, sort: sortField, dir: sortDir }, { preserveState: true });
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/categories', { search, per_page: perPage, filters: activeFilters, sort: field, dir: nextDir }, { preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('categories')} />
            <Box sx={{ p: 4 }}>
                <Tabs
                    value="categories"
                    onChange={(_, val) => router.visit(val === 'marketplace-sync' ? '/catalog/categories/marketplace-sync' : '/catalog/categories')}
                    sx={{ mb: 3 }}
                >
                    <Tab value="categories" label={tNav('categories')} />
                    <Tab value="marketplace-sync" label={t('marketplaceSyncTab')} />
                </Tabs>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h4" fontWeight={700}>{tNav('categories')}</Typography>
                        <Typography color="text.secondary">{tGrid('results', { count: categories.total })}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            component="a"
                            href="/catalog/categories/export"
                        >
                            {t('exportCategoriesCsv')}
                        </Button>
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
                                <TableCell sx={{ fontWeight: 700 }}>{t('thumbnail')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortField === 'name'} direction={sortField === 'name' ? sortDir : 'asc'} onClick={() => handleSort('name')}>
                                        {t('name')}
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('parent')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortField === 'description'} direction={sortField === 'description' ? sortDir : 'asc'} onClick={() => handleSort('description')}>
                                        {t('description')}
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortField === 'slug'} direction={sortField === 'slug' ? sortDir : 'asc'} onClick={() => handleSort('slug')}>
                                        {t('slug')}
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">
                                    <TableSortLabel active={sortField === 'products_count'} direction={sortField === 'products_count' ? sortDir : 'asc'} onClick={() => handleSort('products_count')}>
                                        {t('productsCount')}
                                    </TableSortLabel>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('status')}</TableCell>
                                {(canEdit || canDelete) && <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {categories.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        {row.thumbnail_url ? (
                                            <Box component="img" src={row.thumbnail_url} alt="" sx={{ height: 36, width: 36, objectFit: 'cover', borderRadius: 1 }} />
                                        ) : (
                                            <Box sx={{ height: 36, width: 36, borderRadius: 1, bgcolor: 'action.hover' }} />
                                        )}
                                    </TableCell>
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
                                        {row.description || '-'}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>{row.slug || '-'}</TableCell>
                                    <TableCell align="right">
                                        {row.products_count ? (
                                            <Typography
                                                component="a"
                                                href={`/catalog/products?category_id=${row.id}&category_name=${encodeURIComponent(row.name)}`}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    router.visit(`/catalog/products?category_id=${row.id}&category_name=${encodeURIComponent(row.name)}`);
                                                }}
                                                sx={{ color: 'primary.main', fontWeight: 600, cursor: 'pointer', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                            >
                                                {row.products_count}
                                            </Typography>
                                        ) : (
                                            <Typography color="text.disabled">0</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={row.is_active ? t('active') : t('nonActive')}
                                            size="small"
                                            color={row.is_active ? 'success' : 'default'}
                                            variant={row.is_active ? 'filled' : 'outlined'}
                                        />
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
                                    <TableCell colSpan={(canEdit || canDelete) ? 8 : 7} align="center">
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
