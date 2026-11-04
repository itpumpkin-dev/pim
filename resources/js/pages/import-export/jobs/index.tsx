import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import PagePagination from '@/components/import-export/page-pagination';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus, type FioriTone } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/show.js';
import '@ui5/webcomponents-icons/dist/sys-cancel.js';
import { Button, Label, Option, Select, Title } from '@ui5/webcomponents-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

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
    cancel_requested_at: string | null;
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

// `started_at`/`completed_at` are ISO 8601 with an explicit UTC offset
// (model cast); this localizes them to the viewer's own timezone.
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
    const [cancelId, setCancelId] = useState<number | null>(null);
    const [cancelling, setCancelling] = useState(false);

    const applyFilters = (nextStatus: string, nextJobType: string) => {
        router.get(
            '/import-export/jobs',
            { status: nextStatus || undefined, job_type: nextJobType || undefined },
            { preserveState: true, replace: true },
        );
    };

    const hasActiveJobs = jobs.data.some((j) => j.status === 'pending' || j.status === 'processing');

    useEffect(() => {
        if (!hasActiveJobs) {
            return;
        }

        pollRef.current = setInterval(() => {
            // reload() always preserves scroll/state/URL for a partial
            // reload — ReloadOptions deliberately omits those keys.
            router.reload({ only: ['jobs'] });
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

    const handlePageChange = (page: number) => {
        router.get('/import-export/jobs', { status: status || undefined, job_type: jobType || undefined, page }, { preserveState: true });
    };

    const handleCancelConfirm = () => {
        if (cancelId === null) return;
        setCancelling(true);
        router.post(
            `/import-export/jobs/${cancelId}/cancel`,
            {},
            {
                preserveScroll: true,
                onSuccess: () => setCancelId(null),
                onFinish: () => setCancelling(false),
            },
        );
    };

    // Column pop-in priority (SAP Fiori responsive table): the job code is
    // the identifying column and stays visible at every width; status is
    // the primary progress indicator so it follows next; type/user/dates are
    // secondary metadata that reflow into the pop-in area first, and the
    // numeric ID is the least useful on a phone. Row actions stay pinned
    // like the identifying column.
    const columns: FioriResponsiveColumn<JobItem>[] = [
        {
            key: 'id',
            header: 'ID',
            priority: 'low',
            render: (row) => row.id,
        },
        {
            key: 'job',
            header: t('job'),
            priority: 'always',
            render: (row) => <span className={styles.mono}>{row.config_code}</span>,
        },
        {
            key: 'entityType',
            header: t('typeLabel'),
            priority: 'medium',
            render: (row) => typeLabel(row.entity_type),
        },
        {
            key: 'jobType',
            header: t('jobType'),
            priority: 'medium',
            render: (row) => (row.job_type === 'import' ? t('jobTypeImport') : t('jobTypeExport')),
        },
        {
            key: 'status',
            header: t('statusLabel'),
            priority: 'high',
            render: (row) => (
                <FioriStatus
                    label={t('status' + row.status.charAt(0).toUpperCase() + row.status.slice(1))}
                    tone={STATUS_TONES[row.status] ?? 'neutral'}
                />
            ),
        },
        {
            key: 'user',
            header: t('user'),
            priority: 'medium',
            render: (row) => userLabel(row.user),
        },
        {
            key: 'startedAt',
            header: t('startedAt'),
            priority: 'medium',
            render: (row) => formatLocalDateTime(row.started_at),
        },
        {
            key: 'completedAt',
            header: t('completedAt'),
            priority: 'low',
            render: (row) => formatLocalDateTime(row.completed_at),
        },
        {
            key: 'actions',
            header: tGrid('actionsHeader'),
            priority: 'always',
            align: 'right',
            render: (row) => (
                <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                    {(row.status === 'pending' || row.status === 'processing') && !row.cancel_requested_at && (
                        <Button
                            design="Transparent"
                            icon="sys-cancel"
                            tooltip={t('cancelJob')}
                            accessibleName={t('cancelJob')}
                            onClick={() => setCancelId(row.id)}
                        />
                    )}
                    <Button
                        design="Transparent"
                        icon="show"
                        tooltip={t('viewJob')}
                        accessibleName={t('viewJob')}
                        onClick={() => router.visit(`/import-export/jobs/${row.id}`)}
                    />
                </div>
            ),
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('jobTrackerTitle')} />
            <div className={styles.page}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <Title level="H3" size="H3" wrappingType="Normal">
                        {t('jobTrackerTitle')}
                    </Title>
                    <div className={styles.secondaryText} style={{ marginTop: '0.125rem' }}>
                        {tGrid('results', { count: jobs.total })}
                    </div>
                </div>

                <div className={styles.card}>
                    <div className={styles.toolbar} style={{ gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <Label for="job-status-filter" showColon={false}>
                                {t('statusLabel')}
                            </Label>
                            <Select
                                id="job-status-filter"
                                style={{ minWidth: 180 }}
                                value={status}
                                onChange={(e) => {
                                    const value = e.detail.selectedOption.value ?? '';
                                    setStatus(value);
                                    applyFilters(value, jobType);
                                }}
                            >
                                <Option value="">{t('allStatuses')}</Option>
                                <Option value="pending">{t('statusPending')}</Option>
                                <Option value="processing">{t('statusProcessing')}</Option>
                                <Option value="completed">{t('statusCompleted')}</Option>
                                <Option value="failed">{t('statusFailed')}</Option>
                            </Select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <Label for="job-type-filter" showColon={false}>
                                {t('jobType')}
                            </Label>
                            <Select
                                id="job-type-filter"
                                style={{ minWidth: 180 }}
                                value={jobType}
                                onChange={(e) => {
                                    const value = e.detail.selectedOption.value ?? '';
                                    setJobType(value);
                                    applyFilters(status, value);
                                }}
                            >
                                <Option value="">{t('allJobTypes')}</Option>
                                <Option value="import">{t('jobTypeImport')}</Option>
                                <Option value="export">{t('jobTypeExport')}</Option>
                            </Select>
                        </div>
                    </div>

                    <FioriResponsiveTable
                        variant="plain"
                        columns={columns}
                        rows={jobs.data}
                        getRowKey={(row) => row.id}
                        emptyMessage={t('noJobsFound')}
                    />
                </div>

                {jobs.last_page > 1 && <PagePagination count={jobs.last_page} page={jobs.current_page} onChange={handlePageChange} />}
            </div>

            <FioriMessageBox
                open={cancelId !== null}
                title={t('cancelJob')}
                severity="warning"
                destructive
                confirmLabel={t('cancelJob')}
                cancelLabel={tGrid('cancel')}
                confirmLoading={cancelling}
                onConfirm={handleCancelConfirm}
                onCancel={() => setCancelId(null)}
            >
                {t('cancelJobConfirm')}
            </FioriMessageBox>
        </AppLayout>
    );
}
