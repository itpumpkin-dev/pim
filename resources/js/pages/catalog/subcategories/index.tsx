import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EditIcon from '@mui/icons-material/Edit';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import SearchIcon from '@mui/icons-material/Search';
import {
    Box,
    Button,
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
import { FIORI, FioriStatus, fioriEmphasizedSx, fioriIconButtonSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface SubcategoryItem {
    id: number;
    code: string;
    name: string;
    category_name: string | null;
    thumbnail_url: string | null;
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
}

interface Props {
    subcategories: PaginatedData<SubcategoryItem>;
    categories: { id: number; name: string }[];
    filters: { search?: string; category?: number | '' };
}

export default function SubcategoryIndex({ subcategories, categories, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('subcategories.create_subcategories');
    const canEdit = permissions.includes('subcategories.edit_subcategories');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('subCategories'), href: '/catalog/subcategories' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [category, setCategory] = useState<string>(filters.category ? String(filters.category) : '');
    const [perPage, setPerPage] = useState<number>(subcategories.per_page ?? 15);
    const firstRender = useRef(true);

    const query = (extra: Record<string, unknown>) => ({ search, category, per_page: perPage, ...extra });

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/subcategories', query({}), { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = subcategories.current_page ?? 1;
    const lastPage = subcategories.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/subcategories', query({ page }), { preserveState: true });

    const applyCategory = (value: string) => {
        setCategory(value);
        router.get('/catalog/subcategories', query({ category: value }), { preserveState: true });
    };
    const handlePerPageChange = (value: number) => {
        setPerPage(value);
        router.get('/catalog/subcategories', query({ page: 1, per_page: value }), { preserveState: true });
    };

    const columns: FioriResponsiveColumn<SubcategoryItem>[] = [
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
            header: t('subcategoryName'),
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
            key: 'groups_count',
            header: tNav('productGroups'),
            priority: 'medium',
            align: 'right',
            render: (row) =>
                row.children_count ? (
                    <Typography
                        component="a"
                        href={`/catalog/product-groups?subcategory=${row.id}`}
                        onClick={(e) => {
                            e.preventDefault();
                            router.visit(`/catalog/product-groups?subcategory=${row.id}`);
                        }}
                        sx={{ color: FIORI.brand, fontWeight: 600, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                        {row.children_count}
                    </Typography>
                ) : (
                    <Typography color="text.disabled">0</Typography>
                ),
        },
        {
            key: 'products_count',
            header: t('productsCount'),
            priority: 'medium',
            align: 'right',
            render: (row) =>
                row.products_count ? (
                    <Typography sx={{ fontWeight: 600 }}>{row.products_count}</Typography>
                ) : (
                    <Typography color="text.disabled">0</Typography>
                ),
        },
        {
            key: 'status',
            header: t('status'),
            priority: 'high',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: SubcategoryItem) => (
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/subcategories/${row.id}/edit`)}>
                                  <EditIcon fontSize="small" />
                              </IconButton>
                          </Box>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <ImagePreviewProvider>
            <AppLayout breadcrumbs={breadcrumbs}>
                <Head title={tNav('subCategories')} />
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
                                {tNav('subCategories')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                                {tGrid('results', { count: subcategories.total })}
                            </Typography>
                        </Box>
                        {canCreate && (
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={() => router.visit('/catalog/subcategories/create')}
                                sx={fioriEmphasizedSx}
                            >
                                {t('createSubcategory')}
                            </Button>
                        )}
                    </Box>

                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('searchSubcategories')}
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
                            <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border }}>
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
                        rows={subcategories.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noSubcategoriesFound')}
                    />
                </Box>
            </AppLayout>
        </ImagePreviewProvider>
    );
}
