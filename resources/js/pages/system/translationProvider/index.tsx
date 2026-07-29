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
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
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
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: 'background.default', minHeight: '100%' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        {tSystem('translationProvidersTitle')}
                    </Typography>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/system/translationProviders/create')}
                            sx={{
                                bgcolor: 'primary.main',
                                color: '#fff',
                                textTransform: 'none',
                                fontWeight: 700,
                                px: 2.5,
                                py: 1,
                                borderRadius: 1.5,
                                '&:hover': { bgcolor: 'primary.dark' },
                            }}
                        >
                            {tSystem('createTranslationProvider')}
                        </Button>
                    )}
                </Stack>

                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tSystem('searchByName')}
                            size="small"
                            sx={{
                                bgcolor: '#fff',
                                borderRadius: 5,
                                '& .MuiOutlinedInput-root': { borderRadius: 5 },
                                minWidth: 240,
                            }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                        <Button
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                            sx={{ color: '#64748b', borderColor: '#cbd5e1', textTransform: 'none', borderRadius: 1.5, bgcolor: '#fff' }}
                        >
                            {t('filter')}
                        </Button>
                        <Paper variant="outlined" sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderRadius: 1, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2">{currentPage}</Typography>
                        </Paper>
                        <Typography variant="body2" color="text.secondary">
                            {t('pageOf', { lastPage })}
                        </Typography>
                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" disabled={currentPage <= 1}>
                                <FirstPageIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage <= 1}>
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage}>
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage}>
                                <LastPageIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{tSystem('translationProviderName')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{tSystem('translationProviderType')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{t('fields.status')}</TableCell>
                                <TableCell sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{tSystem('isDefaultProvider')}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary', py: 1.5 }}>{t('actionsHeader')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {gridData.data.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell sx={{ color: '#334155', fontWeight: 500 }}>{row.name}</TableCell>
                                    <TableCell sx={{ color: '#334155' }}>{row.type}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={row.enabled ? t('enabled') : t('disabled')}
                                            size="small"
                                            sx={{ bgcolor: row.enabled ? '#22c55e' : '#94a3b8', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {row.is_default && (
                                            <Chip
                                                label={tSystem('defaultProvider')}
                                                size="small"
                                                sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 600, height: 22, fontSize: '0.75rem' }}
                                            />
                                        )}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                                            <Tooltip title={tSystem('testProvider')}>
                                                <IconButton
                                                    size="small"
                                                    sx={{ color: '#64748b' }}
                                                    onClick={() => router.post(`/system/translationProviders/${row.id}/test`, {}, { preserveScroll: true })}
                                                >
                                                    <TranslateIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            {canEdit && (
                                                <IconButton
                                                    size="small"
                                                    sx={{ color: '#64748b' }}
                                                    onClick={() => router.visit(`/system/translationProviders/${row.id}/edit`)}
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            {canDelete && (
                                                <IconButton size="small" sx={{ color: '#64748b' }} onClick={() => setDeleteId(row.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {gridData.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                        {tSystem('noTranslationProvidersFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            <Dialog open={deleteId !== null} onClose={() => setDeleteId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{tSystem('confirmDeleteTranslationProviderMessage')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteId(null)} color="inherit">
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteId !== null) {
                                router.delete(`/system/translationProviders/${deleteId}`, { onSuccess: () => setDeleteId(null) });
                            }
                        }}
                        color="error"
                        variant="contained"
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
