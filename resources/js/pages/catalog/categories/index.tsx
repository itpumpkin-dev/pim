import AppLayout from '@/layouts/app-layout';
import { PALETTE } from '@/theme';
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
import { Box, Button, Chip, CircularProgress, InputAdornment, MenuItem, Paper, Select, Stack, TableSortLabel, TextField, Typography, IconButton, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { GridFilterDrawer, type FilterValue, type GridColumn } from '@/components/grid-filter-drawer';
import {
    FIORI,
    FioriStatus,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

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
    mapped_platforms?: string[];
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
    filters: { search?: string; filters?: Record<string, FilterValue>; sort?: string; dir?: string; platform?: string };
    filterColumns: Record<string, GridColumn>;
}

// ใช้ชุดสี 4 สีเรียงลำดับเดียวกับ PLATFORM_ACCENT_COLORS / CATEGORY_SYNC_PLATFORMS
// ใน marketplace-sync.tsx (Lazada, Shopee, TikTok, WooCommerce) — ที่นี่ทำเป็น
// map label+color ธรรมดาไปเลย เพราะคอลัมน์นี้แค่ต้องการบอกว่าแถวนี้ผูกกับแพลตฟอร์มไหนบ้าง
// ไม่ได้ต้องการลิงก์ไปหน้า sync ของแต่ละแพลตฟอร์ม
const MAPPED_PLATFORMS: { value: string; label: string; color: string }[] = [
    { value: 'lazada', label: 'Lazada', color: PALETTE.accent },
    { value: 'shopee', label: 'Shopee', color: PALETTE.highlight },
    { value: 'tiktok', label: 'TikTok', color: PALETTE.primary },
    { value: 'woocommerce', label: 'WooCommerce', color: PALETTE.secondary },
];

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
    const [platformFilter, setPlatformFilter] = useState(filters.platform ?? '');
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/catalog/categories', { search, per_page: perPage, filters: activeFilters, sort: sortField, dir: sortDir, platform: platformFilter }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = categories.current_page ?? 1;
    const lastPage = categories.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/categories', { search, page, per_page: perPage, filters: activeFilters, sort: sortField, dir: sortDir, platform: platformFilter }, { preserveState: true });
    };

    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/categories', { search, page: 1, per_page: value, filters: activeFilters, sort: sortField, dir: sortDir, platform: platformFilter }, { preserveState: true });
    };

    const applyFilters = (next: Record<string, FilterValue>) => {
        setActiveFilters(next);
        router.get('/catalog/categories', { search, per_page: perPage, filters: next, sort: sortField, dir: sortDir, platform: platformFilter }, { preserveState: true });
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/categories', { search, per_page: perPage, filters: activeFilters, sort: field, dir: nextDir, platform: platformFilter }, { preserveState: true });
    };

    const applyPlatformFilter = (value: string) => {
        setPlatformFilter(value);
        router.get('/catalog/categories', { search, per_page: perPage, filters: activeFilters, sort: sortField, dir: sortDir, platform: value }, { preserveState: true });
    };

    // ลำดับความสำคัญคอลัมน์ตอนย่อจอ (SAP Fiori responsive table): ชื่อหมวดหมู่
    // เป็นตัวบ่งบอกแถวและปุ่ม action ต้องโชว์ตลอดแม้จอมือถือ; ลิงก์จำนวนสินค้ากับ
    // สถานะ active เป็นสิ่งที่ต้องกดดู/สแกนรองลงมา ตามด้วย parent/description/
    // แพลตฟอร์มที่ผูกไว้ ส่วนรูปตัวอย่างที่เป็นแค่ของตกแต่งกับ slug ที่ไม่ค่อยสำคัญ
    // จะถูกซ่อนก่อนเพื่อน (รูปตัวอย่างไม่มีข้อมูลที่คุ้มค่าจะโชว์เป็น label/value เลยตัดออก
    // จากการ pop-in ไปเลย)
    const columns: FioriResponsiveColumn<CategoryItem>[] = [
        {
            key: 'thumbnail',
            header: t('thumbnail'),
            priority: 'low',
            hideInPopin: true,
            render: (row) =>
                row.thumbnail_url ? (
                    <Box component="img" src={row.thumbnail_url} alt="" sx={{ height: 36, width: 36, objectFit: 'cover', borderRadius: 1, border: `1px solid ${FIORI.border}` }} />
                ) : (
                    <Box sx={{ height: 36, width: 36, borderRadius: 1, bgcolor: 'grey.100', border: `1px solid ${FIORI.border}` }} />
                ),
        },
        {
            key: 'name',
            header: (
                <TableSortLabel active={sortField === 'name'} direction={sortField === 'name' ? sortDir : 'asc'} onClick={() => handleSort('name')}>
                    {t('name')}
                </TableSortLabel>
            ),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.name}</Typography>,
        },
        {
            key: 'parent',
            header: t('parent'),
            priority: 'medium',
            render: (row) =>
                row.parent ? (
                    <Typography variant="body2" sx={{ color: FIORI.brand, fontWeight: 500 }}>
                        {row.parent.name}
                    </Typography>
                ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                        {t('rootCategory')}
                    </Typography>
                ),
        },
        {
            key: 'description',
            header: (
                <TableSortLabel active={sortField === 'description'} direction={sortField === 'description' ? sortDir : 'asc'} onClick={() => handleSort('description')}>
                    {t('description')}
                </TableSortLabel>
            ),
            priority: 'medium',
            render: (row) => (
                <Typography sx={{ color: FIORI.textSecondary, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.description || '-'}
                </Typography>
            ),
        },
        {
            key: 'slug',
            header: (
                <TableSortLabel active={sortField === 'slug'} direction={sortField === 'slug' ? sortDir : 'asc'} onClick={() => handleSort('slug')}>
                    {t('slug')}
                </TableSortLabel>
            ),
            priority: 'low',
            render: (row) => <Typography sx={{ color: FIORI.textSecondary }}>{row.slug || '-'}</Typography>,
        },
        {
            key: 'products_count',
            header: (
                <TableSortLabel active={sortField === 'products_count'} direction={sortField === 'products_count' ? sortDir : 'asc'} onClick={() => handleSort('products_count')}>
                    {t('productsCount')}
                </TableSortLabel>
            ),
            priority: 'high',
            align: 'right',
            render: (row) =>
                row.products_count ? (
                    <Typography
                        component="a"
                        href={`/catalog/products?category_id=${row.id}&category_name=${encodeURIComponent(row.name)}`}
                        onClick={(e) => {
                            e.preventDefault();
                            router.visit(`/catalog/products?category_id=${row.id}&category_name=${encodeURIComponent(row.name)}`);
                        }}
                        sx={{ color: FIORI.brand, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                        {row.products_count}
                    </Typography>
                ) : (
                    <Typography color="text.disabled">0</Typography>
                ),
        },
        {
            key: 'mappedPlatforms',
            header: t('mappedPlatforms'),
            priority: 'medium',
            render: (row) =>
                row.mapped_platforms && row.mapped_platforms.length > 0 ? (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {MAPPED_PLATFORMS.filter((platform) => row.mapped_platforms!.includes(platform.value)).map((platform) => (
                            <Chip
                                key={platform.value}
                                label={platform.label}
                                size="small"
                                sx={{ bgcolor: platform.color, color: '#fff', fontWeight: 600 }}
                            />
                        ))}
                    </Box>
                ) : (
                    <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                        {t('notMapped')}
                    </Typography>
                ),
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'high',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        ...((canEdit || canDelete)
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CategoryItem) => (
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                              {canEdit && (
                                  <IconButton
                                      size="small"
                                      sx={fioriIconButtonSx}
                                      onClick={() => router.visit(`/catalog/categories/${row.id}/edit`)}
                                  >
                                      <EditIcon fontSize="small" />
                                  </IconButton>
                              )}
                              {canDelete && (
                                  <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteCategoryId(row.id)}>
                                      <DeleteIcon fontSize="small" />
                                  </IconButton>
                              )}
                          </Box>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('categories')} />
            <Box sx={{ p: 4, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('categories')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: categories.total })}</Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            component="a"
                            href="/catalog/categories/export"
                            sx={fioriDefaultSx}
                        >
                            {t('exportCategoriesCsv')}
                        </Button>
                        {canCreate && (
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => router.visit('/catalog/categories/create')}
                                sx={fioriEmphasizedSx}
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
                        sx={{ ...fioriSearchFieldSx, minWidth: 280 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: FIORI.textSecondary }} />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Select
                            value={platformFilter}
                            onChange={(e) => applyPlatformFilter(e.target.value)}
                            displayEmpty
                            size="small"
                            sx={{ ...fioriSearchFieldSx, minWidth: 180 }}
                        >
                            <MenuItem value="">{t('allPlatforms')}</MenuItem>
                            {MAPPED_PLATFORMS.map((platform) => (
                                <MenuItem key={platform.value} value={platform.value}>{platform.label}</MenuItem>
                            ))}
                            <MenuItem value="mapped">{t('mappedToAny')}</MenuItem>
                            <MenuItem value="unmapped">{t('notMapped')}</MenuItem>
                        </Select>
                        <Button
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                            onClick={() => setFilterDrawerOpen(true)}
                            sx={fioriDefaultSx}
                        >
                            {tGrid('filter')}
                            {Object.keys(activeFilters).length > 0 && ` (${Object.keys(activeFilters).length})`}
                        </Button>
                        <Select
                            value={perPage}
                            onChange={(e) => handlePerPageChange(Number(e.target.value))}
                            size="small"
                            sx={{
                                bgcolor: FIORI.surface,
                                borderRadius: '8px',
                                minWidth: 60,
                                height: 34,
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: FIORI.border },
                            }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={15}>15</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                        </Select>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {tGrid('perPage')}
                        </Typography>

                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                        </Paper>

                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {tGrid('pageOf', { lastPage })}
                        </Typography>

                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                                <FirstPageIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                <LastPageIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                <FioriResponsiveTable
                    columns={columns}
                    rows={categories.data}
                    getRowKey={(row) => row.id}
                    emptyMessage={t('noCategoriesFound')}
                />
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
                    <Button onClick={() => setDeleteCategoryId(null)} sx={fioriGhostSx} disabled={deleting}>
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
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 700 }}
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
