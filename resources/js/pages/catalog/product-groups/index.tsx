import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { ClickableThumbnail, ImagePreviewProvider } from '@/components/image-preview';
import { FIORI, FioriStatus, fioriDefaultSx, fioriEmphasizedSx, fioriIconButtonSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface GroupItem {
    id: number;
    code: string;
    name: string;
    category_name: string | null;
    subcategory_name: string | null;
    thumbnail_url: string | null;
    products_count?: number;
    mapped_platforms?: string[];
    is_active: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
    lazada: 'Lazada',
    shopee: 'Shopee',
    tiktok: 'TikTok',
    woocommerce: 'WooCommerce',
};
const PLATFORM_VALUES = ['lazada', 'shopee', 'tiktok', 'woocommerce'] as const;

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    groups: PaginatedData<GroupItem>;
    categories: { id: number; name: string }[];
    filters: { search?: string; category?: number | ''; subcategory?: number | ''; platform?: string };
}

export default function ProductGroupIndex({ groups, categories, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('product_groups.create_product_groups');
    const canEdit = permissions.includes('product_groups.edit_product_groups');
    const canDelete = permissions.includes('product_groups.delete_product_groups');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('productGroups'), href: '/catalog/product-groups' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [category, setCategory] = useState<string>(filters.category ? String(filters.category) : '');
    const [platform, setPlatform] = useState<string>(filters.platform ?? '');
    const [perPage, setPerPage] = useState<number>(groups.per_page ?? 15);
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    const query = (extra: Record<string, unknown>) => ({
        search,
        category,
        platform,
        per_page: perPage,
        ...extra,
    });

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/product-groups', query({}), { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = groups.current_page ?? 1;
    const lastPage = groups.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/product-groups', query({ page }), { preserveState: true });

    const applyCategory = (value: string) => {
        setCategory(value);
        router.get('/catalog/product-groups', query({ category: value }), { preserveState: true });
    };
    const applyPlatform = (value: string) => {
        setPlatform(value);
        router.get('/catalog/product-groups', query({ platform: value }), { preserveState: true });
    };
    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/product-groups', query({ page: 1, per_page: value }), { preserveState: true });
    };

    const confirmDelete = () => {
        if (deleteId == null) return;
        setDeleting(true);
        router.delete(`/catalog/product-groups/${deleteId}`, {
            onFinish: () => {
                setDeleting(false);
                setDeleteId(null);
            },
        });
    };

    const columns: FioriResponsiveColumn<GroupItem>[] = [
        {
            key: 'thumbnail',
            header: t('thumbnail'),
            priority: 'low',
            hideInPopin: true,
            render: (row) => <ClickableThumbnail src={row.thumbnail_url} alt={row.name} size={36} radius={1} />,
        },
        {
            key: 'code',
            header: t('code'),
            priority: 'medium',
            render: (row) => <Typography sx={{ color: FIORI.textSecondary }}>{row.code}</Typography>,
        },
        {
            key: 'name',
            header: t('productGroupName'),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.name}</Typography>,
        },
        {
            key: 'category',
            header: t('category'),
            priority: 'high',
            render: (row) => <Typography variant="body2">{row.category_name || '-'}</Typography>,
        },
        {
            key: 'subcategory',
            header: t('subcategory'),
            priority: 'high',
            render: (row) => <Typography variant="body2">{row.subcategory_name || '-'}</Typography>,
        },
        {
            key: 'products_count',
            header: t('productsCount'),
            priority: 'medium',
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
                        sx={{ color: FIORI.brand, fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
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
                        {row.mapped_platforms.map((p) => (
                            <Chip key={p} label={PLATFORM_LABELS[p] ?? p} size="small" variant="outlined" sx={{ borderColor: FIORI.borderStrong }} />
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
        ...(canEdit || canDelete
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: GroupItem) => (
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                              {canEdit && (
                                  <IconButton
                                      size="small"
                                      sx={fioriIconButtonSx}
                                      onClick={() => router.visit(`/catalog/product-groups/${row.id}/edit`)}
                                  >
                                      <EditIcon fontSize="small" />
                                  </IconButton>
                              )}
                              {/* {canDelete && (
                                  <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteId(row.id)}>
                                      <DeleteIcon fontSize="small" />
                                  </IconButton>
                              )} */}
                          </Box>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <ImagePreviewProvider>
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={tNav('productGroups')} />
                <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            justifyContent: 'space-between',
                            alignItems: { xs: 'stretch', sm: 'flex-start' },
                            gap: 2,
                            mb: 3,
                        }}
                    >
                        <Box>
                            <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                                {tNav('productGroups')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                                {tGrid('results', { count: groups.total })}
                            </Typography>
                        </Box>
                        {canCreate && (
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => router.visit('/catalog/product-groups/create')}
                                sx={fioriEmphasizedSx}
                            >
                                {t('createProductGroup')}
                            </Button>
                        )}
                    </Box>

                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('searchProductGroups')}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, width: { xs: '100%', md: 'auto' }, minWidth: { xs: 0, md: 280 } }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ color: FIORI.textSecondary }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ rowGap: 1 }}>
                            <Select
                                value={category}
                                onChange={(e) => applyCategory(e.target.value)}
                                displayEmpty
                                size="small"
                                sx={{ ...fioriSearchFieldSx, minWidth: 200 }}
                            >
                                <MenuItem value="">{t('allCategories')}</MenuItem>
                                {categories.map((c) => (
                                    <MenuItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </MenuItem>
                                ))}
                            </Select>
                            <Select
                                value={platform}
                                onChange={(e) => applyPlatform(e.target.value)}
                                displayEmpty
                                size="small"
                                sx={{ ...fioriSearchFieldSx, minWidth: 180 }}
                            >
                                <MenuItem value="">{t('allPlatforms')}</MenuItem>
                                {PLATFORM_VALUES.map((p) => (
                                    <MenuItem key={p} value={p}>
                                        {PLATFORM_LABELS[p]}
                                    </MenuItem>
                                ))}
                                <MenuItem value="mapped">{t('mappedToAny')}</MenuItem>
                                <MenuItem value="unmapped">{t('notMapped')}</MenuItem>
                            </Select>
                            <Select
                                value={perPage}
                                onChange={(e) => handlePerPageChange(Number(e.target.value))}
                                size="small"
                                sx={{ bgcolor: FIORI.surface, borderRadius: '8px', minWidth: 60, height: 34 }}
                            >
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={15}>15</MenuItem>
                                <MenuItem value={25}>25</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                            </Select>
                            <Paper
                                variant="outlined"
                                sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border }}
                            >
                                <Typography variant="body2">{currentPage}</Typography>
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
                                <IconButton
                                    size="small"
                                    sx={fioriIconButtonSx}
                                    disabled={currentPage >= lastPage}
                                    onClick={() => goToPage(currentPage + 1)}
                                >
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                                    <LastPageIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
                    </Stack>

                    <FioriResponsiveTable columns={columns} rows={groups.data} getRowKey={(row) => row.id} emptyMessage={t('noProductGroupsFound')} />
                </Box>

                <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
                    <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                    <DialogContent>
                        <DialogContentText>{t('confirmDeleteProductGroup')}</DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDeleteId(null)} sx={fioriDefaultSx}>
                            {t('back')}
                        </Button>
                        <Button onClick={confirmDelete} disabled={deleting} color="error" variant="contained">
                            {tGrid('confirmDeletion')}
                        </Button>
                    </DialogActions>
                </Dialog>
            </AppLayout>
        </ImagePreviewProvider>
    );
}
