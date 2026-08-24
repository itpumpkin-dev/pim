import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import TranslateIcon from '@mui/icons-material/Translate';
import FilterListIcon from '@mui/icons-material/FilterList';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import LastPageIcon from '@mui/icons-material/LastPage';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    InputAdornment,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    FIORI,
    FioriStatus,
    fioriBodyCellSx,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
    fioriTableHeadCellSx,
    fioriTableHeadSx,
    fioriTableRowSx,
} from '@/lib/fiori-style';

interface ProviderRow {
    id: number;
    name: string;
    type: string;
    enabled: boolean;
    is_default: boolean;
    [key: string]: unknown;
}
interface GridData {
    data: ProviderRow[];
    total: number;
    current_page?: number;
    last_page?: number;
}
interface Props {
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
}

export default function TranslationProviderIndex({ gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('translationProviders'), href: '/system/translationProviders' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('translation_providers.create_translation_providers') || true;
    const canEdit = permissions.includes('translation_providers.edit_translation_providers') || true;
    const canDelete = permissions.includes('translation_providers.delete_translation_providers') || true;

    const [search, setSearch] = useState(filters.search ?? '');
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [testingId, setTestingId] = useState<number | null>(null);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/system/translationProviders', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('translationProvidersTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>
                            {tSystem('translationProvidersTitle')}
                        </Typography>
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, mt: 0.25 }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Box>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/system/translationProviders/create')}
                            sx={{ ...fioriEmphasizedSx, px: 2.5, py: 1 }}
                        >
                            {tSystem('createTranslationProvider')}
                        </Button>
                    )}
                </Stack>

                <Paper elevation={0} sx={fioriCardSx}>
                    <Stack
                        direction={{ xs: 'column', md: 'row' }}
                        justifyContent="space-between"
                        alignItems="center"
                        spacing={2}
                        sx={{ p: 2 }}
                    >
                        <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                            <TextField
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={tSystem('searchByName')}
                                size="small"
                                sx={{ ...fioriSearchFieldSx, minWidth: 240 }}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <SearchIcon sx={{ color: FIORI.textSecondary, fontSize: 20 }} />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Stack>

                        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                            <Button
                                variant="outlined"
                                startIcon={<FilterListIcon />}
                                sx={fioriDefaultSx}
                            >
                                {t('filter')}
                            </Button>
                            <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', borderColor: FIORI.border, display: 'flex', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                            </Paper>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                                {t('pageOf', { lastPage })}
                            </Typography>
                            <Stack direction="row" spacing={0.2}>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1}>
                                    <FirstPageIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage <= 1}>
                                    <ChevronLeftIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage}>
                                    <ChevronRightIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" sx={fioriIconButtonSx} disabled={currentPage >= lastPage}>
                                    <LastPageIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider sx={{ borderColor: FIORI.border }} />

                    <TableContainer>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead sx={fioriTableHeadSx}>
                                <TableRow>
                                    <TableCell sx={fioriTableHeadCellSx}>{tSystem('translationProviderName')}</TableCell>
                                    <TableCell sx={fioriTableHeadCellSx}>{tSystem('translationProviderType')}</TableCell>
                                    <TableCell sx={fioriTableHeadCellSx}>{t('fields.status')}</TableCell>
                                    <TableCell sx={fioriTableHeadCellSx}>{tSystem('isDefaultProvider')}</TableCell>
                                    <TableCell align="right" sx={fioriTableHeadCellSx}>{t('actionsHeader')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {gridData.data.map((row) => (
                                    <TableRow key={row.id} sx={fioriTableRowSx(false)}>
                                        <TableCell sx={{ ...fioriBodyCellSx, fontWeight: 600 }}>{row.name}</TableCell>
                                        <TableCell sx={fioriBodyCellSx}>{row.type}</TableCell>
                                        <TableCell sx={fioriBodyCellSx}>
                                            <FioriStatus label={row.enabled ? t('enabled') : t('disabled')} tone={row.enabled ? 'success' : 'neutral'} />
                                        </TableCell>
                                        <TableCell sx={fioriBodyCellSx}>
                                            {row.is_default && (
                                                <FioriStatus label={tSystem('defaultProvider')} tone="information" />
                                            )}
                                        </TableCell>
                                        <TableCell align="right" sx={fioriBodyCellSx}>
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Tooltip title={tSystem('testProvider')}>
                                                    <IconButton
                                                        size="small"
                                                        sx={fioriIconButtonSx}
                                                        disabled={testingId === row.id}
                                                        onClick={() => {
                                                            setTestingId(row.id);
                                                            router.post(`/system/translationProviders/${row.id}/test`, {}, {
                                                                preserveScroll: true,
                                                                onFinish: () => setTestingId(null),
                                                            });
                                                        }}
                                                    >
                                                        {testingId === row.id ? <CircularProgress size={18} color="inherit" /> : <TranslateIcon fontSize="small" />}
                                                    </IconButton>
                                                </Tooltip>
                                                {canEdit && (
                                                    <IconButton
                                                        size="small"
                                                        sx={fioriIconButtonSx}
                                                        onClick={() => router.visit(`/system/translationProviders/${row.id}/edit`)}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                {canDelete && (
                                                    <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteId(row.id)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {gridData.data.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4, color: FIORI.textSecondary }}>
                                            {tSystem('noTranslationProvidersFound')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </Box>

            <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{tSystem('confirmDeleteTranslationProviderMessage')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} color="inherit" disabled={deleting} sx={fioriDefaultSx}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                setDeleting(true);
                                router.delete(`/system/translationProviders/${deleteId}`, {
                                    onSuccess: () => setDeleteId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ textTransform: 'none', borderRadius: '8px' }}
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
