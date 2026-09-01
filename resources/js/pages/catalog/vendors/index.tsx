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
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FIORI, FioriStatus, fioriEmphasizedSx, fioriGhostSx, fioriIconButtonSx, fioriNegativeSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface VendorItem {
    id: number;
    code: string;
    name: string;
    name_en: string | null;
    vendor_group: 'domestic' | 'foreign' | null;
    default_price_term: string | null;
    currency_code?: string | null;
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
    vendors: PaginatedData<VendorItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function VendorIndex({ vendors, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('vendors.edit_vendors');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('vendors'), href: '/catalog/vendors' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? 'name');
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
            router.get('/catalog/vendors', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = vendors.current_page ?? 1;
    const lastPage = vendors.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/vendors', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/vendors', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const vendorGroupLabel = (group: VendorItem['vendor_group']) =>
        group === 'domestic' ? t('vendorGroupDomestic') : group === 'foreign' ? t('vendorGroupForeign') : null;

    const columns: FioriResponsiveColumn<VendorItem>[] = [
        {
            key: 'code',
            header: (
                <TableSortLabel active={sortField === 'code'} direction={sortField === 'code' ? sortDir : 'asc'} onClick={() => handleSort('code')}>
                    {t('vendorCode')}
                </TableSortLabel>
            ),
            priority: 'high',
            render: (row) => <Typography sx={{ color: FIORI.textSecondary }}>{row.code}</Typography>,
        },
        {
            key: 'name',
            header: (
                <TableSortLabel active={sortField === 'name'} direction={sortField === 'name' ? sortDir : 'asc'} onClick={() => handleSort('name')}>
                    {t('vendorName')}
                </TableSortLabel>
            ),
            priority: 'always',
            render: (row) => (
                <Box>
                    <Typography sx={{ fontWeight: 600 }}>{row.name}</Typography>
                    {row.name_en && row.name_en !== row.name && (
                        <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>{row.name_en}</Typography>
                    )}
                </Box>
            ),
        },
        {
            key: 'vendor_group',
            header: (
                <TableSortLabel active={sortField === 'vendor_group'} direction={sortField === 'vendor_group' ? sortDir : 'asc'} onClick={() => handleSort('vendor_group')}>
                    {t('vendorGroup')}
                </TableSortLabel>
            ),
            priority: 'medium',
            render: (row) => {
                const label = vendorGroupLabel(row.vendor_group);
                return label ? (
                    <Typography variant="body2">{label}</Typography>
                ) : (
                    <Typography component="span" color="text.disabled">—</Typography>
                );
            },
        },
        {
            key: 'currency',
            header: t('mainCurrency'),
            priority: 'medium',
            render: (row) => (
                <Typography variant="body2">{row.currency_code || <Typography component="span" color="text.disabled">—</Typography>}</Typography>
            ),
        },
        {
            key: 'default_price_term',
            header: t('defaultPriceTerm'),
            priority: 'low',
            render: (row) => (
                <Typography variant="body2">{row.default_price_term || <Typography component="span" color="text.disabled">—</Typography>}</Typography>
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
                      render: (row: VendorItem) => (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/vendors/${row.id}/edit`)}>
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
            <Head title={tNav('vendors')} />
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
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('vendors')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: vendors.total })}</Typography>
                    </Box>
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/vendors/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('createVendor')}
                        </Button>
                    )}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="flex-end" sx={{ mb: 2 }}>
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('searchVendors')}
                        size="small"
                        sx={{ ...fioriSearchFieldSx, width: { xs: '100%', md: 'auto' }, minWidth: { xs: 0, md: 260 } }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" sx={{ color: FIORI.textSecondary }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Stack>

                <FioriResponsiveTable columns={columns} rows={vendors.data} getRowKey={(row) => row.id} emptyMessage={t('noVendorsFound')} />

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
                    <DialogContentText>{t('confirmDeleteVendor')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} sx={fioriGhostSx} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/vendors/${deleteId}`, {
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
