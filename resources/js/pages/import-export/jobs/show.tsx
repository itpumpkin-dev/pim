import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link, router } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CancelIcon from '@mui/icons-material/Cancel';
import DownloadIcon from '@mui/icons-material/Download';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Grid,
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

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
    pending: 'default',
    processing: 'primary',
    completed: 'success',
    failed: 'error',
    cancelled: 'warning',
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

    useEffect(() => {
        if (job.status !== 'pending' && job.status !== 'processing') {
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
    }, [job.id, job.status]);

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
            <Box sx={{ p: { xs: 2, md: 4 } }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Typography variant="h4" fontWeight={700}>{job.config_code}</Typography>
                        <Chip
                            label={t('status' + job.status.charAt(0).toUpperCase() + job.status.slice(1))}
                            color={STATUS_COLORS[job.status] ?? 'default'}
                        />
                        {isActive && cancelRequested && (
                            <Chip label={t('cancelRequested')} color="warning" variant="outlined" size="small" />
                        )}
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <Button component={Link} href="/import-export/jobs" variant="outlined" color="inherit" startIcon={<ArrowBackIcon />}>
                            {t('backToJobs')}
                        </Button>
                        {isActive && !cancelRequested && (
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<CancelIcon />}
                                onClick={() => setCancelDialogOpen(true)}
                            >
                                {t('cancelJob')}
                            </Button>
                        )}
                        {canDownload && (
                            <Button
                                sx={{ color: 'white' }}
                                variant="contained"
                                startIcon={<DownloadIcon />}
                                href={`/import-export/jobs/${job.id}/download`}
                            >
                                {t('download')}
                            </Button>
                        )}
                    </Stack>
                </Stack>

                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={4}>
                        <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center' }}>
                            <Typography variant="h4" fontWeight={700}>{job.total_records_created}</Typography>
                            <Typography variant="body2" color="text.secondary">{t('totalRecordsCreated')}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center' }}>
                            <Typography variant="h4" fontWeight={700}>{job.total_records_skipped}</Typography>
                            <Typography variant="body2" color="text.secondary">{t('totalRecordsSkipped')}</Typography>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center' }}>
                            <Typography variant="h4" fontWeight={700}>{job.total_rows_processed}</Typography>
                            <Typography variant="body2" color="text.secondary">{t('totalRowsProcessed')}</Typography>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('summary')}</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary" display="block">{t('jobType')}</Typography>
                            <Typography>{job.job_type === 'import' ? t('jobTypeImport') : t('jobTypeExport')}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary" display="block">{t('typeLabel')}</Typography>
                            <Typography>{typeLabel(job.entity_type)}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary" display="block">{t('user')}</Typography>
                            <Typography>{userLabel(job.user)}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary" display="block">{t('startedAt')}</Typography>
                            <Typography>{formatLocalDateTime(job.started_at)}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary" display="block">{t('completedAt')}</Typography>
                            <Typography>{formatLocalDateTime(job.completed_at)}</Typography>
                        </Grid>
                    </Grid>
                </Paper>

                <Paper variant="outlined" sx={{ p: 3 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>{t('errorLog')}</Typography>
                    {job.error_log && job.error_log.length > 0 ? (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>{t('row')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>{t('level')}</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>{t('message')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {job.error_log.map((entry, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{entry.row}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={entry.level === 'warning' ? t('levelWarning') : t('levelError')}
                                                    color={entry.level === 'warning' ? 'warning' : 'error'}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>{entry.message}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Typography variant="body2" color="text.secondary">{t('noErrors')}</Typography>
                    )}
                </Paper>
            </Box>

            <Dialog open={cancelDialogOpen} onClose={() => (cancelling ? null : setCancelDialogOpen(false))}>
                <DialogTitle>{t('cancelJob')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>{t('cancelJobConfirm')}</DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCancelDialogOpen(false)} color="inherit" sx={{ fontWeight: 'bold' }} disabled={cancelling}>
                        {tGrid('cancel')}
                    </Button>
                    <Button
                        onClick={handleCancel}
                        color="error"
                        variant="contained"
                        sx={{ fontWeight: 'bold' }}
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
