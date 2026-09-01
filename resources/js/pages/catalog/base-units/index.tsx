import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    TableSortLabel,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import {
    FIORI,
    FioriStatus,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriNegativeSx,
    fioriSearchFieldSx,
} from '@/lib/fiori-style';

interface BaseUnitItem {
    id: number;
    code: string;
    admin_label: string | null;
    slug: string | null;
    description: string | null;
    products_count: number;
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
    baseUnits: PaginatedData<BaseUnitItem>;
    attributeId: number;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function BaseUnitIndex({ baseUnits, attributeId, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    // เหมือน Brands — แถวพวกนี้คือ AttributeOption ของ attribute `pbaseunit` แต่แยกเป็น
    // permission resource ของตัวเอง (`base_units`) การเพิ่ม/แก้ไข/ลบ ทั้งหมดผ่าน route ที่
    // เช็ค base_units.edit_base_units อยู่แล้ว เช็คตัวเดียวก็ครอบคลุมการเขียนทั้งหน้า
    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('base_units.edit_base_units');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('baseUnits'), href: '/catalog/base-units' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? '');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(filters.dir === 'desc' ? 'desc' : 'asc');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/base-units', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = baseUnits.current_page ?? 1;
    const lastPage = baseUnits.last_page ?? 1;

    const goToPage = (page: number) => {
        router.get('/catalog/base-units', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });
    };

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/base-units', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const goToProducts = (row: BaseUnitItem) => {
        const url = `/catalog/products?attribute_filters[0][attribute_id]=${attributeId}&attribute_filters[0][value]=${encodeURIComponent(row.code)}`;
        router.visit(url);
    };

    const columns: FioriResponsiveColumn<BaseUnitItem>[] = [
        {
            key: 'name',
            header: (
                <TableSortLabel active={sortField === 'admin_label'} direction={sortField === 'admin_label' ? sortDir : 'asc'} onClick={() => handleSort('admin_label')}>
                    {t('name')}
                </TableSortLabel>
            ),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.admin_label || row.code}</Typography>,
        },
        {
            key: 'slug',
            header: (
                <TableSortLabel active={sortField === 'slug'} direction={sortField === 'slug' ? sortDir : 'asc'} onClick={() => handleSort('slug')}>
                    {t('baseUnitAbbrev')}
                </TableSortLabel>
            ),
            priority: 'high',
            render: (row) => (
                <Typography sx={{ color: FIORI.textSecondary }}>
                    {row.slug || <Typography component="span" color="text.disabled">—</Typography>}
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
                <Typography sx={{ color: FIORI.textSecondary, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.description || <Typography component="span" color="text.disabled">—</Typography>}
                </Typography>
            ),
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
                    <Tooltip title={t('viewBaseUnitProducts')}>
                        <Chip
                            label={row.products_count}
                            size="small"
                            onClick={() => goToProducts(row)}
                            sx={{
                                bgcolor: 'rgba(0,112,242,0.08)',
                                color: FIORI.brand,
                                fontWeight: 700,
                                cursor: 'pointer',
                                '&:hover': { bgcolor: 'rgba(0,112,242,0.16)' },
                            }}
                        />
                    </Tooltip>
                ) : (
                    <Typography color="text.disabled">0</Typography>
                ),
        },
        {
            key: 'is_active',
            header: (
                <TableSortLabel active={sortField === 'is_active'} direction={sortField === 'is_active' ? sortDir : 'asc'} onClick={() => handleSort('is_active')}>
                    {t('status')}
                </TableSortLabel>
            ),
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
                      render: (row: BaseUnitItem) => (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/base-units/${row.id}/edit`)}>
                                  <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteId(row.id)}>
                                  <DeleteIcon fontSize="small" />
                              </IconButton>
                          </Stack>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('baseUnitsTitle')} />
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
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('baseUnitsTitle')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25, maxWidth: 720 }}>{t('baseUnitsIntro')}</Typography>
                    </Box>
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/base-units/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('addNewBaseUnit')}
                        </Button>
                    )}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2} sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                        {tGrid('results', { count: baseUnits.total })}
                    </Typography>
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('searchBaseUnits')}
                        size="small"
                        sx={{ ...fioriSearchFieldSx, width: { xs: '100%', md: 'auto' }, minWidth: { xs: 0, md: 280 } }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Stack>

                <FioriResponsiveTable
                    columns={columns}
                    rows={baseUnits.data}
                    getRowKey={(row) => row.id}
                    emptyMessage={t('noBaseUnitsFound')}
                />

                <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1.5} sx={{ mt: 2 }}>
                    <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>{tGrid('pageOf', { lastPage })}</Typography>
                    <Stack direction="row" spacing={0.2}>
                        <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(1)}>
                            <FirstPageIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
                            <ChevronLeftIcon fontSize="small" />
                        </IconButton>
                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                        </Paper>
                        <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)}>
                            <ChevronRightIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage} onClick={() => goToPage(lastPage)}>
                            <LastPageIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                </Stack>
            </Box>

            <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
                <DialogTitle>{tGrid('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('confirmDeleteBaseUnit')}</DialogContentText>
                    {(() => {
                        const target = baseUnits.data.find((b) => b.id === deleteId);
                        const count = target?.products_count ?? 0;
                        if (count === 0) return null;
                        return (
                            <Alert severity="warning" sx={{ mt: 1.5 }}>
                                {t('deleteBaseUnitProductWarning', { count })}
                            </Alert>
                        );
                    })()}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} sx={fioriGhostSx} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/base-units/${deleteId}`, {
                                    preserveScroll: true,
                                    onSuccess: () => setDeleteId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        variant="outlined"
                        disabled={deleting}
                        sx={fioriNegativeSx}
                    >
                        {deleting ? <CircularProgress size={16} color="inherit" /> : tGrid('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
