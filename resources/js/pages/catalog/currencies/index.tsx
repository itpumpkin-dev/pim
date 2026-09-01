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
    Alert,
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
import { FIORI, fioriEmphasizedSx, fioriGhostSx, fioriIconButtonSx, fioriNegativeSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface CurrencyItem {
    id: number;
    code: string;
    name: string;
    channels_count: number;
    vendors_count: number;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    currencies: PaginatedData<CurrencyItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function CurrencyIndex({ currencies, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('currencies.edit_currencies');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('currencies'), href: '/catalog/currencies' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [sortField, setSortField] = useState(filters.sort ?? 'code');
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
            router.get('/catalog/currencies', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = currencies.current_page ?? 1;
    const lastPage = currencies.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/currencies', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/currencies', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const columns: FioriResponsiveColumn<CurrencyItem>[] = [
        {
            key: 'code',
            header: (
                <TableSortLabel active={sortField === 'code'} direction={sortField === 'code' ? sortDir : 'asc'} onClick={() => handleSort('code')}>
                    {t('currencyCode')}
                </TableSortLabel>
            ),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.code}</Typography>,
        },
        {
            key: 'name',
            header: (
                <TableSortLabel active={sortField === 'name'} direction={sortField === 'name' ? sortDir : 'asc'} onClick={() => handleSort('name')}>
                    {t('currencyName')}
                </TableSortLabel>
            ),
            priority: 'always',
            render: (row) => <Typography sx={{ color: FIORI.textSecondary }}>{row.name}</Typography>,
        },
        {
            key: 'channels_count',
            header: tNav('channels'),
            priority: 'medium',
            align: 'right',
            render: (row) => (row.channels_count ? <Typography>{row.channels_count}</Typography> : <Typography color="text.disabled">0</Typography>),
        },
        {
            key: 'vendors_count',
            header: tNav('vendors'),
            priority: 'medium',
            align: 'right',
            render: (row) => (row.vendors_count ? <Typography>{row.vendors_count}</Typography> : <Typography color="text.disabled">0</Typography>),
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CurrencyItem) => (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/currencies/${row.id}/edit`)}>
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
            <Head title={tNav('currencies')} />
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
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('currencies')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: currencies.total })}</Typography>
                    </Box>
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/currencies/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('createCurrency')}
                        </Button>
                    )}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="flex-end" sx={{ mb: 2 }}>
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('searchCurrencies')}
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

                <FioriResponsiveTable columns={columns} rows={currencies.data} getRowKey={(row) => row.id} emptyMessage={t('noCurrenciesFound')} />

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
                    <DialogContentText>{t('confirmDeleteCurrency')}</DialogContentText>
                    {(() => {
                        const target = currencies.data.find((c) => c.id === deleteId);
                        const inUse = (target?.channels_count ?? 0) + (target?.vendors_count ?? 0);
                        if (!inUse) return null;
                        return (
                            <Alert severity="warning" sx={{ mt: 1.5 }}>
                                {t('currencyInUseWarning', { channels: target?.channels_count ?? 0, vendors: target?.vendors_count ?? 0 })}
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
                                router.delete(`/catalog/currencies/${deleteId}`, {
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
