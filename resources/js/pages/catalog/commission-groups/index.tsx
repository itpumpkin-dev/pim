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
import { formatDateRange } from '@/lib/format';

interface CommissionGroupItem {
    id: number;
    code: string;
    p_group_name: string | null;
    divisor_start: string | number;
    divisor_secondary: string | number;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    remark: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    commissionGroups: PaginatedData<CommissionGroupItem>;
    filters: { search?: string; sort?: string; dir?: string };
}

const fmt = (v: string | number) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CommissionGroupIndex({ commissionGroups, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('commission_groups.edit_commission_groups');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('commissionGroups'), href: '/catalog/commission-groups' },
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
            router.get('/catalog/commission-groups', { search, sort: sortField, dir: sortDir }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = commissionGroups.current_page ?? 1;
    const lastPage = commissionGroups.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/commission-groups', { search, page, sort: sortField, dir: sortDir }, { preserveState: true });

    const handleSort = (field: string) => {
        const nextDir: 'asc' | 'desc' = sortField === field && sortDir === 'asc' ? 'desc' : 'asc';
        setSortField(field);
        setSortDir(nextDir);
        router.get('/catalog/commission-groups', { search, sort: field, dir: nextDir }, { preserveState: true });
    };

    const sortHeader = (field: string, label: string) => (
        <TableSortLabel active={sortField === field} direction={sortField === field ? sortDir : 'asc'} onClick={() => handleSort(field)}>
            {label}
        </TableSortLabel>
    );

    const columns: FioriResponsiveColumn<CommissionGroupItem>[] = [
        {
            key: 'code',
            header: sortHeader('code', t('commissionGroupCode')),
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 600 }}>{row.code}</Typography>,
        },
        {
            key: 'p_group_name',
            header: sortHeader('p_group_name', t('commissionGroupName')),
            priority: 'high',
            render: (row) => (
                <Typography sx={{ color: FIORI.textSecondary }}>
                    {row.p_group_name || <Typography component="span" color="text.disabled">—</Typography>}
                </Typography>
            ),
        },
        {
            key: 'divisor_start',
            header: sortHeader('divisor_start', t('divisorStart')),
            priority: 'high',
            align: 'right',
            render: (row) => <Typography sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(row.divisor_start)}</Typography>,
        },
        {
            key: 'divisor_secondary',
            header: sortHeader('divisor_secondary', t('divisorSecondary')),
            priority: 'high',
            align: 'right',
            render: (row) => <Typography sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(row.divisor_secondary)}</Typography>,
        },
        {
            key: 'period',
            header: t('pointPeriod'),
            priority: 'medium',
            render: (row) => {
                const period = formatDateRange(row.start_date, row.end_date);
                return period ? (
                    <Typography variant="body2">{period}</Typography>
                ) : (
                    <Typography component="span" color="text.disabled">—</Typography>
                );
            },
        },
        {
            key: 'is_active',
            header: t('status'),
            priority: 'high',
            render: (row) => <FioriStatus label={row.is_active ? t('active') : t('nonActive')} tone={row.is_active ? 'success' : 'neutral'} />,
        },
        {
            key: 'remark',
            header: t('remark'),
            priority: 'medium',
            render: (row) => (
                <Typography sx={{ color: FIORI.textSecondary, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.remark || <Typography component="span" color="text.disabled">—</Typography>}
                </Typography>
            ),
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: CommissionGroupItem) => (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/commission-groups/${row.id}/edit`)}>
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
            <Head title={tNav('commissionGroups')} />
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
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('commissionGroups')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: commissionGroups.total })}</Typography>
                    </Box>
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/commission-groups/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('createCommissionGroup')}
                        </Button>
                    )}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="flex-end" sx={{ mb: 2 }}>
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('searchCommissionGroups')}
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

                <FioriResponsiveTable columns={columns} rows={commissionGroups.data} getRowKey={(row) => row.id} emptyMessage={t('noCommissionGroupsFound')} />

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
                    <DialogContentText>{t('confirmDeleteCommissionGroup')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} sx={fioriGhostSx} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/commission-groups/${deleteId}`, {
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
