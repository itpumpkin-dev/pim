import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CancelIcon from '@mui/icons-material/Cancel';
import DownloadIcon from '@mui/icons-material/Download';
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Grid,
    LinearProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
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
    fioriTableHeadCellSx,
    fioriTableHeadSx,
    fioriTableRowSx,
} from '@/lib/fiori-style';

interface UserSummary {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
}

interface ErrorLogEntry {
    row: number;
    message: string;
    level?: 'error' | 'warning';
}

interface JobDetail {
    id: number;
    job_type: string;
    entity_type: string;
    config_code: string;
    status: string;
    user: UserSummary | null;
    started_at: string | null;
    completed_at: string | null;
    cancel_requested_at: string | null;
    total_records_created: number;
    total_records_skipped: number;
    total_rows_processed: number;
    total_translations_queued: number;
    total_translations_completed: number;
    result_file_path: string | null;
    error_log: ErrorLogEntry[] | null;
}

interface Props {
    job: JobDetail;
}

// `started_at`/`completed_at` are ISO 8601 with an explicit UTC offset
// (model cast on initial load, JobTrackerController::status() on poll);
// this localizes them to the viewer's own timezone.
function formatLocalDateTime(value: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const STATUS_TONES: Record<string, FioriTone> = {
    pending: 'warning',
    processing: 'information',
    completed: 'success',
    failed: 'error',
    cancelled: 'neutral',
};

export default function JobTrackerShow({ job: initialJob }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tNav } = useTranslation('nav');
    const { t: tGrid } = useTranslation('grid');

    const [job, setJob] = useState(initialJob);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('jobTrackerTitle'), href: '/import-export/jobs' },
        { title: job.config_code, href: '#' },
    ];

    // AI-translate dispatches (see ProductRowImporter) are separate queued
    // jobs that keep running after this import job itself finishes and
    // flips to 'completed' — so polling has to keep going until those catch
    // up too, not just while the main job is still pending/processing,
    // otherwise the counters freeze mid-translation the moment the import
    // loop itself ends.
    const translationsPending = job.total_translations_completed < job.total_translations_queued;

    useEffect(() => {
        if (job.status !== 'pending' && job.status !== 'processing' && !translationsPending) {
            return;
        }

        pollRef.current = setInterval(() => {
            fetch(`/import-export/jobs/${job.id}/status`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    if (!data) return;
                    setJob((prev) => ({ ...prev, ...data }));
                })
                .catch(() => {
                    // best-effort polling; keep last known state on transient failure
                });
        }, 2000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [job.id, job.status, translationsPending]);

    const userLabel = (user: UserSummary | null) => {
        if (!user) return '-';
        const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
        return fullName || user.username;
    };

    const typeLabel = (type: string) => {
        const key = 'type' + type.replace(/(^|_)([a-z])/g, (_m, _p, c) => c.toUpperCase());
        const translated = t(key);
        return translated === key ? type : translated;
    };

    const canDownload = job.job_type === 'export' && job.status === 'completed' && job.result_file_path;
    const isActive = job.status === 'pending' || job.status === 'processing';
    const cancelRequested = Boolean(job.cancel_requested_at);

    const handleCancel = () => {
        setCancelling(true);
        router.post(
            `/import-export/jobs/${job.id}/cancel`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => setJob((prev) => ({ ...prev, cancel_requested_at: new Date().toISOString() })),
                onFinish: () => {
                    setCancelling(false);
                    setCancelDialogOpen(false);
                },
            },
        );
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('jobTrackerTitle')}: ${job.config_code}`} />
            <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: FIORI.pageBg, minHeight: '100%' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Typography variant="h5" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{job.config_code}</Typography>
                        <FioriStatus
                            label={t('status' + job.status.charAt(0).toUpperCase() + job.status.slice(1))}
                            tone={STATUS_TONES[job.status] ?? 'neutral'}
                        />
                        {isActive && cancelRequested && (
                            <FioriStatus label={t('cancelRequested')} tone="warning" />
                        )}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/import-export/jobs" variant="outlined" startIcon={<ArrowBackIcon />} sx={fioriDefaultSx}>
                            {t('backToJobs')}
                        </Button>
                        {isActive && !cancelRequested && (
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<CancelIcon />}
                                onClick={() => setCancelDialogOpen(true)}
                                sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
                            >
                                {t('cancelJob')}
                            </Button>
                        )}
                        {canDownload && (
                            <Button
                                variant="contained"
                                startIcon={<DownloadIcon />}
                                href={`/import-export/jobs/${job.id}/download`}
                                sx={fioriEmphasizedSx}
                            >
                                {t('download')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={4}>
                        <Paper elevation={0} sx={{ ...fioriCardSx, p: 2.5, textAlign: 'center' }}>
                            <Typography variant="h4" fontWeight={700} sx={{ color: FIORI.textPrimary }}>{job.total_records_created}</Typography>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>{t('totalRecordsCreated')}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Paper elevation={0} sx={{ ...fioriCardSx, p: 2.5, textAlign: 'center' }}>
                            <Typography variant="h4" fontWeight={700} sx={{ color: FIORI.textPrimary }}>{job.total_records_skipped}</Typography>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>{t('totalRecordsSkipped')}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Paper elevation={0} sx={{ ...fioriCardSx, p: 2.5, textAlign: 'center' }}>
                            <Typography variant="h4" fontWeight={700} sx={{ color: FIORI.textPrimary }}>{job.total_rows_processed}</Typography>
                            <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>{t('totalRowsProcessed')}</Typography>
                        </Paper>
                    </Grid>
                </Grid>

                {job.total_translations_queued > 0 && (
                    <Paper elevation={0} sx={{ ...fioriCardSx, p: 3, mb: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                            <Typography variant="h6" fontWeight={600} sx={{ color: FIORI.textPrimary }}>{t('aiTranslationProgress')}</Typography>
                            <FioriStatus
                                label={translationsPending ? t('aiTranslationInProgress') : t('aiTranslationDone')}
                                tone={translationsPending ? 'information' : 'success'}
                            />
                        </Stack>
                        <LinearProgress
                            variant="determinate"
                            value={Math.min(100, (job.total_translations_completed / job.total_translations_queued) * 100)}
                            sx={{ height: 8, borderRadius: 4, mb: 1, bgcolor: FIORI.hover, '& .MuiLinearProgress-bar': { bgcolor: FIORI.brand } }}
                        />
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>
                            {t('aiTranslationCount', {
                                completed: job.total_translations_completed,
                                total: job.total_translations_queued,
                            })}
                        </Typography>
                    </Paper>
                )}

                <Paper elevation={0} sx={{ ...fioriCardSx, p: 3, mb: 3 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: FIORI.textPrimary }}>{t('summary')}</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>{t('jobType')}</Typography>
                            <Typography sx={{ color: FIORI.textPrimary }}>{job.job_type === 'import' ? t('jobTypeImport') : t('jobTypeExport')}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>{t('typeLabel')}</Typography>
                            <Typography sx={{ color: FIORI.textPrimary }}>{typeLabel(job.entity_type)}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>{t('user')}</Typography>
                            <Typography sx={{ color: FIORI.textPrimary }}>{userLabel(job.user)}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>{t('startedAt')}</Typography>
                            <Typography sx={{ color: FIORI.textPrimary }}>{formatLocalDateTime(job.started_at)}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" sx={{ color: FIORI.textSecondary, display: 'block' }}>{t('completedAt')}</Typography>
                            <Typography sx={{ color: FIORI.textPrimary }}>{formatLocalDateTime(job.completed_at)}</Typography>
                        </Grid>
                    </Grid>
                </Paper>

                <Paper elevation={0} sx={{ ...fioriCardSx, p: 3 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: FIORI.textPrimary }}>{t('errorLog')}</Typography>
                    {job.error_log && job.error_log.length > 0 ? (
                        <TableContainer>
                            <Table size="small">
                                <TableHead sx={fioriTableHeadSx}>
                                    <TableRow>
                                        <TableCell sx={fioriTableHeadCellSx}>{t('row')}</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>{t('level')}</TableCell>
                                        <TableCell sx={fioriTableHeadCellSx}>{t('message')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {job.error_log.map((entry, index) => (
                                        <TableRow key={index} sx={fioriTableRowSx(false)}>
                                            <TableCell sx={fioriBodyCellSx}>{entry.row}</TableCell>
                                            <TableCell sx={fioriBodyCellSx}>
                                                <FioriStatus
                                                    label={entry.level === 'warning' ? t('levelWarning') : t('levelError')}
                                                    tone={entry.level === 'warning' ? 'warning' : 'error'}
                                                />
                                            </TableCell>
                                            <TableCell sx={fioriBodyCellSx}>{entry.message}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Typography variant="body2" sx={{ color: FIORI.textSecondary }}>{t('noErrors')}</Typography>
                    )}
                </Paper>
            </Box>

            <Dialog open={cancelDialogOpen} onClose={() => (cancelling ? null : setCancelDialogOpen(false))}>
                <DialogTitle>{t('cancelJob')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('cancelJobConfirm')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelDialogOpen(false)} sx={fioriGhostSx} disabled={cancelling}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={handleCancel}
                        color="error"
                        variant="contained"
                        sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
                        disabled={cancelling}
                        startIcon={cancelling ? <CircularProgress size={16} color="inherit" /> : undefined}
                    >
                        {t('cancelJob')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AppLayout>
    );
}
