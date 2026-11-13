import { FioriMessageStrip } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import '@ui5/webcomponents-icons/dist/redo.js';
import { Button, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../../import-export/import-export.module.css';

interface Worker {
    worker_id: string;
    host: string;
    pid: number;
    queue: string | null;
    current_job: string | null;
    current_job_started_at: string | null;
    jobs_processed: number;
    jobs_failed: number;
    started_at: string | null;
    last_seen_at: string | null;
    alive: boolean;
}

interface QueuedJob {
    id: number;
    queue: string;
    name: string;
    full_name: string | null;
    attempts: number;
    created_at: string;
    available_at: string;
    reserved_at: string | null;
    stuck: boolean;
    delayed: boolean;
}

interface FailedJob {
    id: number;
    uuid: string;
    queue: string;
    name: string;
    failed_at: string | null;
    error: string;
}

interface Props {
    workers: Worker[];
    jobs: QueuedJob[];
    jobsTotal: number;
    failed: FailedJob[];
    failedTotal: number;
    aliveWorkers: number;
    queueConnection: string;
    retryAfter: number;
    canManage: boolean;
}

const POLL_MS = 5000;

function when(value: string | null): string {
    return value ? new Date(value).toLocaleString() : '—';
}

/** "3 นาทีที่แล้ว" แบบหยาบๆ — พอให้เห็นว่างานค้างมานานแค่ไหน */
function ago(value: string | null, now: number): string {
    if (!value) return '—';
    const sec = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
    if (sec < 60) return `${sec} วินาที`;
    if (sec < 3600) return `${Math.floor(sec / 60)} นาที`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} ชั่วโมง`;
    return `${Math.floor(sec / 86400)} วัน`;
}

/**
 * สถานะคิวงาน (QueueMonitorController) — มี queue worker ทำงานอยู่ไหม, งานไหนค้างในคิว, งานไหนล้มเหลว
 * รีเฟรชเองทุก 5 วินาที (partial reload) เพื่อเห็น worker หยิบงานไปทำแบบสดๆ
 */
export default function QueueMonitor({ workers, jobs, jobsTotal, failed, failedTotal, aliveWorkers, queueConnection, retryAfter, canManage }: Props) {
    const { t: tNav } = useTranslation('nav');
    const { confirm, confirmElement } = useFioriConfirm();
    const [now, setNow] = useState(() => Date.now());
    const [busy, setBusy] = useState<string | null>(null);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: tNav('system'), href: '#' },
        { title: tNav('queueMonitor'), href: '/system/queue' },
    ];

    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
            router.reload({ only: ['workers', 'jobs', 'jobsTotal', 'failed', 'failedTotal', 'aliveWorkers'] });
        }, POLL_MS);
        return () => clearInterval(timer);
    }, []);

    const act = async (key: string, opts: { title: string; message: string; label: string; destructive?: boolean }, run: (done: () => void) => void) => {
        if (!(await confirm({ title: opts.title, message: opts.message, confirmLabel: opts.label, destructive: opts.destructive }))) return;
        setBusy(key);
        run(() => setBusy(null));
    };

    const stuckCount = jobs.filter((j) => j.stuck).length;
    const waitingCount = jobs.filter((j) => !j.reserved_at && !j.delayed).length;

    const workerColumns: FioriResponsiveColumn<Worker>[] = [
        {
            key: 'status',
            header: 'สถานะ',
            priority: 'always',
            minWidth: 110,
            render: (w) => <FioriStatus label={w.alive ? 'ทำงานอยู่' : 'หยุดแล้ว'} tone={w.alive ? 'success' : 'neutral'} showIcon />,
        },
        { key: 'worker', header: 'Worker', priority: 'always', minWidth: 180, render: (w) => <span className={styles.mono}>{w.worker_id}</span> },
        {
            key: 'current',
            header: 'กำลังทำ',
            priority: 'high',
            minWidth: 180,
            render: (w) =>
                w.alive && w.current_job ? (
                    <span>
                        {w.current_job} <span className={styles.secondaryText}>({ago(w.current_job_started_at, now)})</span>
                    </span>
                ) : (
                    <span className={styles.secondaryText}>{w.alive ? 'ว่าง — รองาน' : '—'}</span>
                ),
        },
        { key: 'done', header: 'ทำแล้ว / ล้มเหลว', priority: 'medium', render: (w) => `${w.jobs_processed} / ${w.jobs_failed}` },
        { key: 'seen', header: 'รายงานตัวล่าสุด', priority: 'medium', minWidth: 150, render: (w) => `${ago(w.last_seen_at, now)}ที่แล้ว` },
        { key: 'started', header: 'เริ่มเมื่อ', priority: 'low', minWidth: 160, render: (w) => when(w.started_at) },
    ];

    const jobColumns: FioriResponsiveColumn<QueuedJob>[] = [
        { key: 'id', header: 'ID', priority: 'low', render: (j) => j.id },
        {
            key: 'name',
            header: 'งาน',
            priority: 'always',
            minWidth: 200,
            render: (j) => (
                <span title={j.full_name ?? undefined}>
                    {j.name} <span className={styles.secondaryText}>· {j.queue}</span>
                </span>
            ),
        },
        {
            key: 'state',
            header: 'สถานะ',
            priority: 'high',
            minWidth: 140,
            render: (j) =>
                j.stuck ? (
                    <FioriStatus label="ค้าง (worker หยุดกลางทาง)" tone="error" showIcon title={`ถูกหยิบไปเกิน ${retryAfter} วินาทีแล้วยังไม่จบ`} />
                ) : j.reserved_at ? (
                    <FioriStatus label="กำลังทำ" tone="information" />
                ) : j.delayed ? (
                    <FioriStatus label={`ตั้งเวลาไว้ ${when(j.available_at)}`} tone="neutral" />
                ) : (
                    <FioriStatus label="รอคิว" tone="warning" />
                ),
        },
        { key: 'waiting', header: 'อยู่ในคิวมา', priority: 'medium', render: (j) => ago(j.created_at, now) },
        { key: 'attempts', header: 'ลองแล้ว', priority: 'medium', render: (j) => `${j.attempts} ครั้ง` },
        ...(canManage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (j: QueuedJob) => {
                          const running = Boolean(j.reserved_at) && !j.stuck;
                          return (
                              <Button
                                  design="Transparent"
                                  icon="delete"
                                  tooltip={running ? 'กำลังทำอยู่ — ลบไม่ได้' : 'ลบออกจากคิว'}
                                  accessibleName="ลบออกจากคิว"
                                  disabled={running || busy !== null}
                                  loading={busy === `job:${j.id}`}
                                  onClick={() =>
                                      act(
                                          `job:${j.id}`,
                                          {
                                              title: 'ลบงานออกจากคิว?',
                                              message: `${j.name} (#${j.id}) จะถูกลบและไม่ทำอีก — ถ้ายังต้องการผลของงานนี้ ต้องสั่งใหม่จากหน้าเดิม`,
                                              label: 'ลบ',
                                              destructive: true,
                                          },
                                          (done) => router.delete(`/system/queue/jobs/${j.id}`, { preserveScroll: true, onFinish: done }),
                                      )
                                  }
                              />
                          );
                      },
                  },
              ]
            : []),
    ];

    const failedColumns: FioriResponsiveColumn<FailedJob>[] = [
        { key: 'name', header: 'งาน', priority: 'always', minWidth: 180, render: (f) => f.name },
        { key: 'failed', header: 'ล้มเหลวเมื่อ', priority: 'high', minWidth: 160, render: (f) => when(f.failed_at) },
        {
            key: 'error',
            header: 'สาเหตุ',
            priority: 'medium',
            minWidth: 260,
            render: (f) => (
                <Text maxLines={2} title={f.error}>
                    {f.error}
                </Text>
            ),
        },
        ...(canManage
            ? [
                  {
                      key: 'actions',
                      header: '',
                      priority: 'always' as const,
                      align: 'right' as const,
                      render: (f: FailedJob) => (
                          <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
                              <Button
                                  design="Transparent"
                                  icon="redo"
                                  tooltip="ลองใหม่"
                                  accessibleName="ลองใหม่"
                                  disabled={busy !== null}
                                  loading={busy === `retry:${f.uuid}`}
                                  onClick={() =>
                                      act(
                                          `retry:${f.uuid}`,
                                          { title: 'ลองงานนี้ใหม่?', message: `${f.name} จะถูกส่งกลับเข้าคิว และทำอีกครั้งเมื่อมี worker`, label: 'ลองใหม่' },
                                          (done) => router.post(`/system/queue/failed/${f.uuid}/retry`, {}, { preserveScroll: true, onFinish: done }),
                                      )
                                  }
                              />
                              <Button
                                  design="Transparent"
                                  icon="delete"
                                  tooltip="ลบ"
                                  accessibleName="ลบ"
                                  disabled={busy !== null}
                                  loading={busy === `failed:${f.uuid}`}
                                  onClick={() =>
                                      act(
                                          `failed:${f.uuid}`,
                                          { title: 'ลบงานที่ล้มเหลว?', message: `ลบ ${f.name} ออกจากรายการ (ไม่ได้ลองใหม่)`, label: 'ลบ', destructive: true },
                                          (done) => router.delete(`/system/queue/failed/${f.uuid}`, { preserveScroll: true, onFinish: done }),
                                      )
                                  }
                              />
                          </span>
                      ),
                  },
              ]
            : []),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('queueMonitor')} />
            {confirmElement}
            <div className={styles.page}>
                <div className={styles.header}>
                    <div>
                        <Title level="H3" size="H3" wrappingType="Normal">
                            {tNav('queueMonitor')}
                        </Title>
                        <div className={styles.secondaryText} style={{ marginTop: '0.125rem' }}>
                            คิวแบบ {queueConnection} — รีเฟรชเองทุก {POLL_MS / 1000} วินาที
                        </div>
                    </div>
                    <div className={styles.actions}>
                        <Button icon="refresh" onClick={() => router.reload()}>
                            รีเฟรช
                        </Button>
                    </div>
                </div>

                {aliveWorkers === 0 ? (
                    <FioriMessageStrip severity="error" style={{ marginBottom: '1.5rem' }}>
                        ไม่มี queue worker ทำงานอยู่ — งานนำเข้า/ส่งออก/sync ทั้งหมดจะค้างที่ "รอดำเนินการ" จนกว่าจะรัน{' '}
                        <code>php artisan queue:work</code> บนเซิร์ฟเวอร์
                    </FioriMessageStrip>
                ) : stuckCount > 0 ? (
                    <FioriMessageStrip severity="warning" style={{ marginBottom: '1.5rem' }}>
                        มี {stuckCount} งานค้าง — worker ที่หยิบไปน่าจะหยุดกลางทาง (จะถูกลองใหม่อัตโนมัติ หรือลบทิ้งได้)
                    </FioriMessageStrip>
                ) : null}

                <div className={styles.statGrid}>
                    <div className={styles.cardPadded} style={{ padding: '1.25rem', textAlign: 'center' }}>
                        <span className={styles.statValue} style={{ color: aliveWorkers > 0 ? 'var(--sapPositiveColor)' : 'var(--sapNegativeColor)' }}>
                            {aliveWorkers}
                        </span>
                        <span className={styles.secondaryText}>Worker ที่ทำงานอยู่</span>
                    </div>
                    <div className={styles.cardPadded} style={{ padding: '1.25rem', textAlign: 'center' }}>
                        <span className={styles.statValue}>{jobsTotal}</span>
                        <span className={styles.secondaryText}>
                            งานในคิว ({waitingCount} รอ{stuckCount > 0 ? ` · ${stuckCount} ค้าง` : ''})
                        </span>
                    </div>
                    <div className={styles.cardPadded} style={{ padding: '1.25rem', textAlign: 'center' }}>
                        <span className={styles.statValue} style={{ color: failedTotal > 0 ? 'var(--sapNegativeColor)' : undefined }}>
                            {failedTotal}
                        </span>
                        <span className={styles.secondaryText}>งานที่ล้มเหลว</span>
                    </div>
                </div>

                <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
                    <div className={styles.toolbar}>
                        <Title level="H5" size="H5">
                            Worker
                        </Title>
                    </div>
                    <FioriResponsiveTable
                        variant="plain"
                        columns={workerColumns}
                        rows={workers}
                        getRowKey={(w) => w.worker_id}
                        emptyMessage="ยังไม่มี worker รายงานตัวใน 6 ชั่วโมงที่ผ่านมา"
                    />
                </div>

                <div className={styles.card} style={{ marginBottom: '1.5rem' }}>
                    <div className={styles.toolbar}>
                        <Title level="H5" size="H5">
                            งานในคิว{jobsTotal > jobs.length ? ` (แสดง ${jobs.length} จาก ${jobsTotal})` : ''}
                        </Title>
                    </div>
                    <FioriResponsiveTable variant="plain" columns={jobColumns} rows={jobs} getRowKey={(j) => j.id} emptyMessage="คิวว่าง — ไม่มีงานค้าง" />
                </div>

                <div className={styles.card}>
                    <div className={styles.toolbar}>
                        <Title level="H5" size="H5">
                            งานที่ล้มเหลว{failedTotal > failed.length ? ` (ล่าสุด ${failed.length} จาก ${failedTotal})` : ''}
                        </Title>
                    </div>
                    <FioriResponsiveTable variant="plain" columns={failedColumns} rows={failed} getRowKey={(f) => f.uuid} emptyMessage="ไม่มีงานที่ล้มเหลว" />
                </div>
            </div>
        </AppLayout>
    );
}
