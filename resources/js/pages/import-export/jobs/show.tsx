import { FioriMessageStrip } from '@/components/fiori-form';
import { FioriMessageBox } from '@/components/fiori-message-box';
import { FioriResponsiveColumn, FioriResponsiveTable } from '@/components/fiori-responsive-table';
import { followLink } from '@/components/import-export/follow-link';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus, type FioriTone } from '@/lib/fiori-style';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/sys-cancel.js';
import { BusyIndicator, Button, Label, ProgressIndicator, Title } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../import-export.module.css';

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
    /** มี queue:work รายงานตัวภายใน ~90 วิ — JobTrackerController (show + status poll) */
    queue_worker_alive?: boolean | null;
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
    const canViewQueue = (usePage<SharedData>().props.auth.permissions || []).includes('queue_jobs.list_queue_jobs');
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

    // key จาก index ตรงๆ — เดิมใช้ error_log.indexOf(entry) ต่อแถว ซึ่งเป็น
    // O(n²) ทุกครั้งที่ render (ทุก 2 วินาทีตอน poll) ทำให้หน้าค้างเมื่อ log ยาว
    const errorLogRows = useMemo(() => (job.error_log ?? []).map((entry, key) => ({ ...entry, key })), [job.error_log]);

    // Column pop-in priority (SAP Fiori responsive table): the row number
    // identifies which record the error belongs to and always stays; the
    // level chip is the primary indicator and follows next; the message
    // text reflows into the pop-in area first since it's the most verbose.
    const errorLogColumns: FioriResponsiveColumn<ErrorLogEntry & { key: number }>[] = [
        {
            key: 'row',
            header: t('row'),
            priority: 'always',
            render: (entry) => entry.row || '-',
        },
        {
            key: 'level',
            header: t('level'),
            priority: 'high',
            render: (entry) => (
                <FioriStatus
                    label={entry.level === 'warning' ? t('levelWarning') : t('levelError')}
                    tone={entry.level === 'warning' ? 'warning' : 'error'}
                />
            ),
        },
        {
            key: 'message',
            header: t('message'),
            priority: 'medium',
            render: (entry) => entry.message,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`${t('jobTrackerTitle')}: ${job.config_code}`} />
            <div className={styles.page}>
                <div className={styles.header}>
                    <div className={styles.row} style={{ gap: '0.75rem' }}>
                        <Title level="H3" size="H3" wrappingType="Normal">
                            {job.config_code}
                        </Title>
                        <FioriStatus
                            label={t('status' + job.status.charAt(0).toUpperCase() + job.status.slice(1))}
                            tone={STATUS_TONES[job.status] ?? 'neutral'}
                        />
                        {isActive && cancelRequested && <FioriStatus label={t('cancelRequested')} tone="warning" />}
                    </div>
                    <div className={styles.actions}>
                        <Button icon="nav-back" onClick={() => router.visit('/import-export/jobs')}>
                            {t('backToJobs')}
                        </Button>
                        {isActive && !cancelRequested && (
                            <Button design="Negative" icon="sys-cancel" onClick={() => setCancelDialogOpen(true)}>
                                {t('cancelJob')}
                            </Button>
                        )}
                        {canDownload && (
                            <Button design="Emphasized" icon="download" onClick={() => followLink(`/import-export/jobs/${job.id}/download`)}>
                                {t('download')}
                            </Button>
                        )}
                    </div>
                </div>

                {/* งานยังไม่จบ — บอกให้ชัดว่ากำลังรอคิว/กำลังทำ เพราะตัวเลขด้านล่างอาจค้างที่ 0
                    จนจบ (เช่น ส่งออกด่วนอัปเดตจำนวนแถวตอนเขียนไฟล์เสร็จทีเดียว) */}
                {isActive && (
                    <div
                        className={styles.cardPadded}
                        style={{ padding: '1.25rem', marginBottom: '1.5rem', overflow: 'hidden', position: 'relative' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <BusyIndicator active delay={0} size="M" style={{ flexShrink: 0 }} />
                            <div>
                                <span className={styles.subHeading} style={{ marginBottom: 0 }}>
                                    {job.status === 'pending' ? t('jobWaitingInQueue') : t('jobRunning')}
                                </span>
                                <span className={styles.secondaryText}>{t('jobAutoRefreshHint')}</span>
                            </div>
                        </div>
                        <div className={styles.indeterminateTrack} />
                    </div>
                )}

                {/* รอคิวอยู่แต่ไม่มี queue:work รันเลย — งานจะไม่เริ่มเอง (QueueWorkerHeartbeat) */}
                {job.status === 'pending' && job.queue_worker_alive === false && (
                    <FioriMessageStrip severity="error" style={{ marginBottom: '1.5rem' }}>
                        ไม่มี queue worker ทำงานอยู่ — งานนี้จะไม่เริ่มจนกว่าจะเปิด <code>php artisan queue:work</code>{' '}
                        {canViewQueue && <Link href="/system/queue">ดูสถานะคิวงาน</Link>}
                    </FioriMessageStrip>
                )}

                <div className={styles.statGrid}>
                    <div className={styles.cardPadded} style={{ padding: '1.25rem', textAlign: 'center' }}>
                        <span className={styles.statValue}>{job.total_records_created}</span>
                        <span className={styles.secondaryText}>{t('totalRecordsCreated')}</span>
                    </div>
                    <div className={styles.cardPadded} style={{ padding: '1.25rem', textAlign: 'center' }}>
                        <span className={styles.statValue}>{job.total_records_skipped}</span>
                        <span className={styles.secondaryText}>{t('totalRecordsSkipped')}</span>
                    </div>
                    <div className={styles.cardPadded} style={{ padding: '1.25rem', textAlign: 'center' }}>
                        <span className={styles.statValue}>{job.total_rows_processed}</span>
                        <span className={styles.secondaryText}>{t('totalRowsProcessed')}</span>
                    </div>
                </div>

                {job.total_translations_queued > 0 && (
                    <div className={styles.cardPadded} style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                            <Title level="H4" size="H5" wrappingType="Normal">
                                {t('aiTranslationProgress')}
                            </Title>
                            <FioriStatus
                                label={translationsPending ? t('aiTranslationInProgress') : t('aiTranslationDone')}
                                tone={translationsPending ? 'information' : 'success'}
                            />
                        </div>
                        <ProgressIndicator
                            value={Math.min(100, (job.total_translations_completed / job.total_translations_queued) * 100)}
                            hideValue
                            style={{ width: '100%', marginBottom: '0.5rem' }}
                        />
                        <span className={styles.secondaryText}>
                            {t('aiTranslationCount', {
                                completed: job.total_translations_completed,
                                total: job.total_translations_queued,
                            })}
                        </span>
                    </div>
                )}

                <div className={styles.cardPadded} style={{ marginBottom: '1.5rem' }}>
                    <Title level="H4" size="H5" wrappingType="Normal" style={{ marginBottom: '1rem' }}>
                        {t('summary')}
                    </Title>
                    <div className={styles.summaryGrid}>
                        <div>
                            <Label showColon={false} style={{ display: 'block' }}>
                                {t('jobType')}
                            </Label>
                            <span className={styles.summaryValue}>{job.job_type === 'import' ? t('jobTypeImport') : t('jobTypeExport')}</span>
                        </div>
                        <div>
                            <Label showColon={false} style={{ display: 'block' }}>
                                {t('typeLabel')}
                            </Label>
                            <span className={styles.summaryValue}>{typeLabel(job.entity_type)}</span>
                        </div>
                        <div>
                            <Label showColon={false} style={{ display: 'block' }}>
                                {t('user')}
                            </Label>
                            <span className={styles.summaryValue}>{userLabel(job.user)}</span>
                        </div>
                        <div>
                            <Label showColon={false} style={{ display: 'block' }}>
                                {t('startedAt')}
                            </Label>
                            <span className={styles.summaryValue}>{formatLocalDateTime(job.started_at)}</span>
                        </div>
                        <div>
                            <Label showColon={false} style={{ display: 'block' }}>
                                {t('completedAt')}
                            </Label>
                            <span className={styles.summaryValue}>{formatLocalDateTime(job.completed_at)}</span>
                        </div>
                    </div>
                </div>

                <div className={styles.cardPadded}>
                    <Title level="H4" size="H5" wrappingType="Normal" style={{ marginBottom: '1rem' }}>
                        {t('errorLog')}
                    </Title>
                    {job.error_log && job.error_log.length > 0 ? (
                        <FioriResponsiveTable
                            variant="plain"
                            size="small"
                            columns={errorLogColumns}
                            rows={errorLogRows}
                            getRowKey={(entry) => entry.key}
                        />
                    ) : (
                        <span className={styles.secondaryText}>{t('noErrors')}</span>
                    )}
                </div>
            </div>

            <FioriMessageBox
                open={cancelDialogOpen}
                onCancel={() => setCancelDialogOpen(false)}
                onConfirm={handleCancel}
                title={t('cancelJob')}
                severity="warning"
                destructive
                confirmLabel={t('cancelJob')}
                cancelLabel={tGrid('cancel')}
                confirmLoading={cancelling}
            >
                {t('cancelJobConfirm')}
            </FioriMessageBox>
        </AppLayout>
    );
}
