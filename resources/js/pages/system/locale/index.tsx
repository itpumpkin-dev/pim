import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import EditNoteIcon from '@mui/icons-material/EditNote';
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
    IconButton,
    InputAdornment,
    LinearProgress,
    MenuItem,
    Paper,
    Select,
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
    type FioriTone,
    fioriBodyCellSx,
    fioriCardSx,
    fioriDefaultSx,
    fioriEmphasizedSx,
    fioriGhostSx,
    fioriIconButtonSx,
    fioriSearchFieldSx,
    fioriTableHeadCellSx,
    fioriTableHeadSx,
    fioriTableRowSx,
} from '@/lib/fiori-style';

interface GridColumn {
    label: string;
    type: string;
    sortable?: boolean;
}
interface GridAction {
    icon: string;
    label: string;
}
interface GridConfig {
    columns: Record<string, GridColumn>;
    actions?: Record<string, GridAction>;
}
type TranslationStatus = 'not_started' | 'queued' | 'translating' | 'completed' | 'partial' | 'failed';

interface LocaleRow {
    id: number;
    code: string;
    display_name?: string | null;
    enabled: boolean;
    translation_status: TranslationStatus;
    translation_total: number;
    translation_translated: number;
    [key: string]: unknown;
}

function translationPercent(row: LocaleRow): number {
    if (!row.translation_total) {
        return 0;
    }

    return Math.round((row.translation_translated / row.translation_total) * 100);
}

const TRANSLATION_STATUS_TONE: Record<TranslationStatus, FioriTone> = {
    not_started: 'neutral',
    queued: 'information',
    translating: 'information',
    completed: 'success',
    partial: 'warning',
    failed: 'error',
};

const TRANSLATION_STATUS_LABEL_KEY: Record<TranslationStatus, string> = {
    not_started: 'translationNotStarted',
    queued: 'translationQueued',
    translating: 'translationTranslating',
    completed: 'translationCompleted',
    partial: 'translationPartial',
    failed: 'translationFailed',
};
interface GridData {
    data: LocaleRow[];
    total: number;
    current_page?: number;
    last_page?: number;
    per_page?: number;
}
interface Props {
    gridConfig: GridConfig;
    gridData: GridData;
    filters: { search?: string; sort?: string; dir?: string };
}

const ACTIVE_TRANSLATION_STATUSES: TranslationStatus[] = ['queued', 'translating'];

export default function LocaleIndex({ gridData, filters }: Props) {
    const { t } = useTranslation('grid');
    const { t: tSystem } = useTranslation('system');
    const { t: tNav } = useTranslation('nav');
    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('locales'), href: '/system/locales' },
    ];

    const { auth } = usePage<SharedData>().props;
    const permissions = auth.permissions || [];
    const canCreate = permissions.includes('locales.create_locales') || true;
    const canEdit = permissions.includes('locales.edit_locales') || true;
    const canDelete = permissions.includes('locales.delete_locales') || true;

    const [search, setSearch] = useState(filters.search ?? '');
    const [perPage, setPerPage] = useState<number>(10);
    const [deleteLocaleId, setDeleteLocaleId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const firstRender = useRef(true);

    useEffect(() => {
        if (firstRender.current) {
            firstRender.current = false;
            return;
        }

        const timeout = setTimeout(() => {
            router.get('/system/locales', { search }, { preserveState: true, replace: true });
        }, 300);

        return () => clearTimeout(timeout);
    }, [search]);

    // Auto-refresh while any locale is mid-translation so progress/status
    // updates without the admin having to reload the page manually.
    useEffect(() => {
        const hasActiveTranslation = gridData.data.some((row) =>
            ACTIVE_TRANSLATION_STATUSES.includes(row.translation_status),
        );

        if (!hasActiveTranslation) {
            return;
        }

        const interval = setInterval(() => {
            router.reload({ only: ['gridData'] });
        }, 3000);

        return () => clearInterval(interval);
    }, [gridData]);

    const startTranslation = (localeId: number) => {
        router.post(
            `/system/locales/${localeId}/translate`,
            {},
            { preserveScroll: true, preserveState: true },
        );
    };

    const currentPage = gridData.current_page ?? 1;
    const lastPage = gridData.last_page ?? 1;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tSystem('localesTitle')} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                {/* Header Title & Create Button */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600, color: FIORI.textPrimary }}>
                        {tSystem('localesTitle')}
                    </Typography>
                    {canCreate && (
                        <Button
                            variant="contained"
                            onClick={() => router.visit('/system/locales/create')}
                            sx={fioriEmphasizedSx}
                        >
                            {tSystem('createLocale')}
                        </Button>
                    )}
                </Stack>

                {/* Search & Controls Row */}
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ width: { xs: '100%', md: 'auto' } }}>
                        <TextField
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={tSystem('searchByCode')}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, minWidth: 240 }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <SearchIcon sx={{ color: FIORI.textSecondary }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary, whiteSpace: 'nowrap' }}>
                            {t('results', { count: gridData.total })}
                        </Typography>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: { xs: '100%', md: 'auto' }, justifyContent: 'flex-end' }}>
                        <Button
                            variant="outlined"
                            startIcon={<FilterListIcon />}
                            sx={fioriDefaultSx}
                        >
                            {t('filter')}
                        </Button>

                        <Select
                            value={perPage}
                            onChange={(e) => setPerPage(Number(e.target.value))}
                            size="small"
                            sx={{ ...fioriSearchFieldSx, minWidth: 60, height: 36 }}
                        >
                            <MenuItem value={10}>10</MenuItem>
                            <MenuItem value={25}>25</MenuItem>
                            <MenuItem value={50}>50</MenuItem>
                        </Select>

                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {t('perPage')}
                        </Typography>

                        <Paper elevation={0} sx={{ px: 1.5, py: 0.5, bgcolor: FIORI.surface, borderRadius: '8px', border: `1px solid ${FIORI.border}`, display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ color: FIORI.textPrimary }}>{currentPage}</Typography>
                        </Paper>

                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {t('pageOf', { lastPage })}
                        </Typography>

                        <Stack direction="row" spacing={0.2}>
                            <IconButton size="small" disabled={currentPage <= 1} sx={fioriIconButtonSx}>
                                <FirstPageIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage <= 1} sx={fioriIconButtonSx}>
                                <ChevronLeftIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage} sx={fioriIconButtonSx}>
                                <ChevronRightIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" disabled={currentPage >= lastPage} sx={fioriIconButtonSx}>
                                <LastPageIcon fontSize="small" />
                            </IconButton>
                        </Stack>
                    </Stack>
                </Stack>

                {/* Table */}
                <TableContainer component={Paper} elevation={0} sx={fioriCardSx}>
                    <Table sx={{ minWidth: 650 }}>
                        <TableHead sx={fioriTableHeadSx}>
                            <TableRow>
                                <TableCell sx={fioriTableHeadCellSx}>{t('fields.id')}</TableCell>
                                <TableCell sx={fioriTableHeadCellSx}>{t('fields.code')}</TableCell>
                                <TableCell sx={fioriTableHeadCellSx}>{t('fields.displayName')}</TableCell>
                                <TableCell sx={fioriTableHeadCellSx}>{t('fields.status')}</TableCell>
                                <TableCell sx={{ ...fioriTableHeadCellSx, minWidth: 220 }}>{tSystem('translationColumn')}</TableCell>
                                <TableCell align="right" sx={fioriTableHeadCellSx}>{t('actionsHeader')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {gridData.data.map((row) => (
                                <TableRow key={row.id} sx={fioriTableRowSx(false)}>
                                    <TableCell sx={fioriBodyCellSx}>{row.id}</TableCell>
                                    <TableCell sx={{ ...fioriBodyCellSx, fontWeight: 500 }}>{row.code}</TableCell>
                                    <TableCell sx={fioriBodyCellSx}>{row.display_name || '-'}</TableCell>
                                    <TableCell sx={fioriBodyCellSx}>
                                        <FioriStatus label={row.enabled ? t('enabled') : t('disabled')} tone={row.enabled ? 'success' : 'neutral'} />
                                    </TableCell>
                                    <TableCell sx={fioriBodyCellSx}>
                                        {row.code === 'en' ? (
                                            <Typography variant="caption" sx={{ color: FIORI.textSecondary }}>
                                                —
                                            </Typography>
                                        ) : (
                                            <Stack spacing={0.5}>
                                                <Stack direction="row" alignItems="center" spacing={1}>
                                                    <FioriStatus
                                                        label={`${translationPercent(row)}% · ${tSystem(TRANSLATION_STATUS_LABEL_KEY[row.translation_status])}`}
                                                        tone={TRANSLATION_STATUS_TONE[row.translation_status]}
                                                    />
                                                    <Tooltip title={`${row.translation_translated} / ${row.translation_total}`}>
                                                        <Box sx={{ flex: 1, minWidth: 60 }}>
                                                            <LinearProgress
                                                                variant="determinate"
                                                                value={translationPercent(row)}
                                                                sx={{
                                                                    height: 6,
                                                                    borderRadius: 3,
                                                                    bgcolor: FIORI.border,
                                                                    '& .MuiLinearProgress-bar': {
                                                                        bgcolor: FIORI[TRANSLATION_STATUS_TONE[row.translation_status]],
                                                                    },
                                                                }}
                                                            />
                                                        </Box>
                                                    </Tooltip>
                                                </Stack>
                                                {canEdit && (
                                                    <Button
                                                        size="small"
                                                        startIcon={<TranslateIcon fontSize="small" />}
                                                        disabled={ACTIVE_TRANSLATION_STATUSES.includes(row.translation_status)}
                                                        onClick={() => startTranslation(row.id)}
                                                        sx={{ ...fioriGhostSx, alignSelf: 'flex-start', fontSize: '0.75rem', py: 0.25, minWidth: 0 }}
                                                    >
                                                        {row.translation_status === 'not_started'
                                                            ? tSystem('startTranslation')
                                                            : tSystem('retryTranslation')}
                                                    </Button>
                                                )}
                                            </Stack>
                                        )}
                                    </TableCell>
                                    <TableCell align="right" sx={fioriBodyCellSx}>
                                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                            {canEdit && (
                                                <Tooltip title={tSystem('editTranslations')}>
                                                    <IconButton
                                                        size="small"
                                                        sx={fioriIconButtonSx}
                                                        onClick={() => router.visit(`/system/locales/${row.id}/translations`)}
                                                    >
                                                        <EditNoteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            {canEdit && (
                                                <IconButton size="small" sx={fioriIconButtonSx} onClick={() => router.visit(`/system/locales/${row.id}/edit`)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            {canDelete && (
                                                <IconButton size="small" sx={fioriIconButtonSx} onClick={() => setDeleteLocaleId(row.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {gridData.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: FIORI.textSecondary }}>
                                        {tSystem('noLocalesFound')}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            {/* Delete Dialog */}
            <Dialog open={deleteLocaleId !== null} onClose={() => setDeleteLocaleId(null)}>
                <DialogTitle>{t('confirmDeletion')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {tSystem('confirmDeleteLocaleMessage')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteLocaleId(null)} disabled={deleting} sx={fioriGhostSx}>
                        {t('cancel')}
                    </Button>
                    <Button
                        onClick={() => {
                            if (deleteLocaleId !== null) {
                                setDeleting(true);
                                router.delete(`/system/locales/${deleteLocaleId}`, {
                                    onSuccess: () => setDeleteLocaleId(null),
                                    onFinish: () => setDeleting(false),
                                });
                            }
                        }}
                        color="error"
                        variant="contained"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
                    >
                        {t('delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
