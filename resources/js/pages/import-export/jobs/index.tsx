import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Box, Chip, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Pagination, Stack } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UserSummary {
    id: number;
    username: string;
    first_name: string | null;
    last_name: string | null;
}

interface JobItem {
    id: number;
    job_type: string;
    entity_type: string;
    config_code: string;
    status: string;
    user: UserSummary | null;
    started_at: string | null;
    completed_at: string | null;
}

interface PaginatedData<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

interface Props {
    jobs: PaginatedData<JobItem>;
    filters: { status?: string; job_type?: string };
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error'> = {
    pending: 'default',
    processing: 'primary',
    completed: 'success',
    failed: 'error',
};

export default function JobTrackerIndex({ jobs, filters }: Props) {
    const { t } = useTranslation('import_export');
    const { t: tGrid } = useTranslation('grid');
    const { t: tNav } = useTranslation('nav');

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('importExport'), href: '#' },
        { title: t('jobTrackerTitle'), href: '/import-export/jobs' },
    ];

    const [status, setStatus] = useState(filters.status ?? '');
    const [jobType, setJobType] = useState(filters.job_type ?? '');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const applyFilters = (nextStatus: string, nextJobType: string) => {
        router.get('/import-export/jobs', { status: nextStatus || undefined, job_type: nextJobType || undefined }, { preserveState: true, replace: true });
    };

    const hasActiveJobs = jobs.data.some((j) => j.status === 'pending' || j.status === 'processing');

    useEffect(() => {
        if (!hasActiveJobs) {
            return;
        }

        pollRef.current = setInterval(() => {
            router.reload({ only: ['jobs'], preserveScroll: true, preserveState: true });
        }, 3000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [hasActiveJobs]);

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

    const handlePageChange = (_: unknown, page: number) => {
        router.get('/import-export/jobs', { status: status || undefined, job_type: jobType || undefined, page }, { preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('jobTrackerTitle')} />
            <Box sx={{ p: 4 }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={700}>{t('jobTrackerTitle')}</Typography>
                    <Typography color="text.secondary">{tGrid('results', { count: jobs.total })}</Typography>
                </Box>

                <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel id="job-status-filter">{t('statusLabel')}</InputLabel>
                        <Select
                            labelId="job-status-filter"
                            label={t('statusLabel')}
                            value={status}
                            onChange={(e) => {
                                setStatus(e.target.value);
                                applyFilters(e.target.value, jobType);
                            }}
                        >
                            <MenuItem value="">{t('allStatuses')}</MenuItem>
                            <MenuItem value="pending">{t('statusPending')}</MenuItem>
                            <MenuItem value="processing">{t('statusProcessing')}</MenuItem>
                            <MenuItem value="completed">{t('statusCompleted')}</MenuItem>
                            <MenuItem value="failed">{t('statusFailed')}</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel id="job-type-filter">{t('jobType')}</InputLabel>
                        <Select
                            labelId="job-type-filter"
                            label={t('jobType')}
                            value={jobType}
                            onChange={(e) => {
                                setJobType(e.target.value);
                                applyFilters(status, e.target.value);
                            }}
                        >
                            <MenuItem value="">{t('allJobTypes')}</MenuItem>
                            <MenuItem value="import">{t('jobTypeImport')}</MenuItem>
                            <MenuItem value="export">{t('jobTypeExport')}</MenuItem>
                        </Select>
                    </FormControl>
                </Stack>

                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>ID</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('job')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('typeLabel')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('jobType')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('statusLabel')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('user')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('startedAt')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('completedAt')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">{tGrid('actionsHeader')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {jobs.data.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{row.config_code}</TableCell>
                                    <TableCell>{typeLabel(row.entity_type)}</TableCell>
                                    <TableCell>{row.job_type === 'import' ? t('jobTypeImport') : t('jobTypeExport')}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={t('status' + row.status.charAt(0).toUpperCase() + row.status.slice(1))}
                                            color={STATUS_COLORS[row.status] ?? 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>{userLabel(row.user)}</TableCell>
                                    <TableCell>{row.started_at ?? '-'}</TableCell>
                                    <TableCell>{row.completed_at ?? '-'}</TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" onClick={() => router.visit(`/import-export/jobs/${row.id}`)}>
                                            <VisibilityIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {jobs.data.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} align="center">{t('noJobsFound')}</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {jobs.last_page > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination count={jobs.last_page} page={jobs.current_page} onChange={handlePageChange} color="primary" />
                    </Box>
                )}
            </Box>
        </AppLayout>
    );
}
