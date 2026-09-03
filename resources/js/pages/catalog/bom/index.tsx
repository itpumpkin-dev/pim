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
    TextField,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { FIORI, fioriEmphasizedSx, fioriGhostSx, fioriIconButtonSx, fioriNegativeSx, fioriSearchFieldSx } from '@/lib/fiori-style';

interface BomItem {
    id: number;
    product_id: number;
    sku: string;
    name: string;
    components_count: number;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    boms: PaginatedData<BomItem>;
    filters: { search?: string };
}

export default function BomIndex({ boms, filters }: Props) {
    const { t } = useTranslation('catalog');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canEdit = permissions.includes('bom.edit_bom');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('catalog'), href: '#' },
        { title: tNav('master'), href: '#' },
        { title: tNav('bom'), href: '#' },
    ];

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }
        const timeout = setTimeout(() => {
            router.get('/catalog/bom', { search }, { preserveState: true, replace: true });
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const currentPage = boms.current_page ?? 1;
    const lastPage = boms.last_page ?? 1;
    const goToPage = (page: number) => router.get('/catalog/bom', { search, page }, { preserveState: true });

    const columns: FioriResponsiveColumn<BomItem>[] = [
        {
            key: 'sku',
            header: 'SKU',
            priority: 'always',
            render: (row) => <Typography sx={{ fontWeight: 700 }}>{row.sku}</Typography>,
        },
        {
            key: 'name',
            header: t('rawMaterialNameColumn'),
            priority: 'always',
            render: (row) => <Typography sx={{ color: FIORI.textSecondary }}>{row.name}</Typography>,
        },
        {
            key: 'components_count',
            header: t('bomComponentsCount'),
            priority: 'medium',
            align: 'right',
            render: (row) => (row.components_count ? <Typography>{row.components_count}</Typography> : <Typography color="text.disabled">0</Typography>),
        },
        ...(canEdit
            ? [
                  {
                      key: 'actions',
                      header: tGrid('actionsHeader'),
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (row: BomItem) => (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                              <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/catalog/bom/${row.id}/edit`)}>
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
            <Head title={tNav('bom')} />
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
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{tNav('bom')}</Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>{tGrid('results', { count: boms.total })}</Typography>
                    </Box>
                    {canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => router.visit('/catalog/bom/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {t('createBom')}
                        </Button>
                    )}
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="flex-end" sx={{ mb: 2 }}>
                    <TextField
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('rawMaterialSearchPlaceholder')}
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

                <FioriResponsiveTable columns={columns} rows={boms.data} getRowKey={(row) => row.id} emptyMessage={t('noBomFound')} />

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
                    <DialogContentText>{t('confirmDeleteBom')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} sx={fioriGhostSx} disabled={deleting}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                setDeleting(true);
                                router.delete(`/catalog/bom/${deleteId}`, {
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
