import { FioriMessageStrip } from '@/components/fiori-form';
import { useFioriConfirm } from '@/components/fiori-message-box';
import { FioriResponsiveTable, type FioriResponsiveColumn } from '@/components/fiori-responsive-table';
import AppLayout from '@/layouts/app-layout';
import { FioriStatus } from '@/lib/fiori-style';
import { type BreadcrumbItem } from '@/types';
import { Head, router } from '@inertiajs/react';
import '@ui5/webcomponents-fiori/dist/illustrations/NoData.js';
import '@ui5/webcomponents-fiori/dist/illustrations/SuccessScreen.js';
import '@ui5/webcomponents-icons/dist/delete.js';
import '@ui5/webcomponents-icons/dist/error.js';
import '@ui5/webcomponents-icons/dist/it-host.js';
import '@ui5/webcomponents-icons/dist/list.js';
import '@ui5/webcomponents-icons/dist/redo.js';
import '@ui5/webcomponents-icons/dist/refresh.js';
import {
    AnalyticalCardHeader,
    Avatar,
    Button,
    Card,
    CardHeader,
    DynamicPage,
    DynamicPageHeader,
    DynamicPageTitle,
    IllustratedMessage,
    ObjectStatus,
    Text,
    Title,
    Toolbar,
    ToolbarButton,
} from '@ui5/webcomponents-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './queue.module.css';

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

/** "3 นาที" แบบหยาบๆ — พอให้เห็นว่างานค้างมานานแค่ไหน */
function ago(value: string | null, now: number): string {
    if (!value) return '—';
    const sec = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
    if (sec < 60) return `${sec} วินาที`;
    if (sec < 3600) return `${Math.floor(sec / 60)} นาที`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} ชั่วโมง`;
    return `${Math.floor(sec / 86400)} วัน`;
}

/** การ์ดหนึ่งส่วนของหน้า (Fiori Card + CardHeader) — ว่างแล้วแสดง IllustratedMessage แทนตาราง */
function SectionCard({
    sectionRef,
    title,
    subtitle,
    icon,
    count,
    empty,
    children,
}: {
    sectionRef?: RefObject<HTMLDivElement | null>;
    title: string;
    subtitle: string;
    icon: string;
    count: string;
    empty: { show: boolean; name: string; title: string; subtitle: string };
    children: ReactNode;
}) {
    return (
        <div ref={sectionRef} className={styles.section}>
            <Card
                header={
                    <CardHeader
                        titleText={title}
                        subtitleText={subtitle}
                        additionalText={count}
                        avatar={<Avatar icon={icon} shape="Square" size="S" colorScheme="Accent6" />}
                    />
                }
            >
                {empty.show ? (
                    <IllustratedMessage name={empty.name} design="Spot" titleText={empty.title} subtitleText={empty.subtitle} />
                ) : (
                    children
                )}
            </Card>
        </div>
    );
}

/**
 * สถานะคิวงาน (QueueMonitorController) — Fiori Dynamic Page: หัวหน้า = สถานะรวม + KPI (ยุบได้ตอนเลื่อน),
 * เนื้อหา = การ์ด Worker / งานในคิว / งานที่ล้มเหลว รีเฟรชเองทุก 5 วินาที (partial reload)
 */
export default function QueueMonitor({ workers, jobs, jobsTotal, failed, failedTotal, aliveWorkers, queueConnection, retryAfter, canManage }: Props) {
    const { t: tNav } = useTranslation('nav');
    const { confirm, confirmElement } = useFioriConfirm();
    const [now, setNow] = useState(() => Date.now());
    const [busy, setBusy] = useState<string | null>(null);
    const workersRef = useRef<HTMLDivElement>(null);
    const jobsRef = useRef<HTMLDivElement>(null);
    const failedRef = useRef<HTMLDivElement>(null);

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

    const scrollTo = (ref: RefObject<HTMLDivElement | null>) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const stuckCount = jobs.filter((j) => j.stuck).length;
    const runningCount = jobs.filter((j) => j.reserved_at && !j.stuck).length;
    const waitingCount = jobs.filter((j) => !j.reserved_at && !j.delayed).length;

    const workerColumns: FioriResponsiveColumn<Worker>[] = [
        {
            key: 'status',
            header: 'สถานะ',
            priority: 'always',
            minWidth: 110,
            render: (w) => <FioriStatus label={w.alive ? 'ทำงานอยู่' : 'หยุดแล้ว'} tone={w.alive ? 'success' : 'neutral'} showIcon />,
        },
        { key: 'worker', header: 'Worker', priority: 'always', minWidth: 180, render: (w) => <Text className={styles.mono}>{w.worker_id}</Text> },
        {
            key: 'current',
            header: 'กำลังทำ',
            priority: 'high',
            minWidth: 180,
            render: (w) =>
                w.alive && w.current_job ? (
                    <Text>
                        {w.current_job} <span className={styles.muted}>({ago(w.current_job_started_at, now)})</span>
                    </Text>
                ) : (
                    <Text className={styles.muted}>{w.alive ? 'ว่าง — รองาน' : '—'}</Text>
                ),
        },
        { key: 'done', header: 'ทำแล้ว / ล้มเหลว', priority: 'medium', render: (w) => <Text>{`${w.jobs_processed} / ${w.jobs_failed}`}</Text> },
        { key: 'seen', header: 'รายงานตัวล่าสุด', priority: 'medium', minWidth: 150, render: (w) => <Text>{`${ago(w.last_seen_at, now)}ที่แล้ว`}</Text> },
        { key: 'started', header: 'เริ่มเมื่อ', priority: 'low', minWidth: 160, render: (w) => <Text>{when(w.started_at)}</Text> },
    ];

    const jobColumns: FioriResponsiveColumn<QueuedJob>[] = [
        { key: 'id', header: 'ID', priority: 'low', render: (j) => <Text className={styles.mono}>{j.id}</Text> },
        {
            key: 'name',
            header: 'งาน',
            priority: 'always',
            minWidth: 200,
            render: (j) => (
                <Text title={j.full_name ?? undefined}>
                    {j.name} <span className={styles.muted}>· {j.queue}</span>
                </Text>
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
        { key: 'waiting', header: 'อยู่ในคิวมา', priority: 'medium', render: (j) => <Text>{ago(j.created_at, now)}</Text> },
        { key: 'attempts', header: 'ลองแล้ว', priority: 'medium', render: (j) => <Text>{`${j.attempts} ครั้ง`}</Text> },
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
        { key: 'name', header: 'งาน', priority: 'always', minWidth: 180, render: (f) => <Text>{f.name}</Text> },
        { key: 'failed', header: 'ล้มเหลวเมื่อ', priority: 'high', minWidth: 160, render: (f) => <Text>{when(f.failed_at)}</Text> },
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

    const overall =
        aliveWorkers === 0 ? (
            <ObjectStatus state="Negative" showDefaultIcon>
                ไม่มี worker ทำงาน
            </ObjectStatus>
        ) : stuckCount > 0 ? (
            <ObjectStatus state="Critical" showDefaultIcon>
                {`มีงานค้าง ${stuckCount} งาน`}
            </ObjectStatus>
        ) : (
            <ObjectStatus state="Positive" showDefaultIcon>
                ทำงานปกติ
            </ObjectStatus>
        );

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={tNav('queueMonitor')} />
            {confirmElement}
            <DynamicPage
                className={styles.dynamicPage}
                titleArea={
                    <DynamicPageTitle
                        heading={
                            <Title level="H2" size="H3" wrappingType="Normal">
                                {tNav('queueMonitor')}
                            </Title>
                        }
                        snappedHeading={
                            <Title level="H2" size="H5" wrappingType="Normal">
                                {tNav('queueMonitor')}
                            </Title>
                        }
                        subheading={<Text>{`คิวแบบ ${queueConnection} · รีเฟรชเองทุก ${POLL_MS / 1000} วินาที`}</Text>}
                        snappedSubheading={overall}
                        actionsBar={
                            <Toolbar design="Transparent">
                                <ToolbarButton design="Transparent" icon="refresh" text="รีเฟรช" onClick={() => router.reload()} />
                            </Toolbar>
                        }
                    >
                        {overall}
                    </DynamicPageTitle>
                }
                headerArea={
                    <DynamicPageHeader>
                        <div className={styles.kpiGrid}>
                            <Card className={styles.kpiCard}>
                                <AnalyticalCardHeader
                                    titleText="Worker ที่ทำงานอยู่"
                                    subtitleText={`รายงานตัวภายใน 90 วินาที`}
                                    value={String(aliveWorkers)}
                                    state={aliveWorkers > 0 ? 'Good' : 'Error'}
                                    description={aliveWorkers > 0 ? 'queue:work ทำงานอยู่' : 'ต้องรัน php artisan queue:work'}
                                    onClick={() => scrollTo(workersRef)}
                                />
                            </Card>
                            <Card className={styles.kpiCard}>
                                <AnalyticalCardHeader
                                    titleText="งานในคิว"
                                    subtitleText={`${waitingCount} รอ · ${runningCount} กำลังทำ · ${stuckCount} ค้าง`}
                                    value={String(jobsTotal)}
                                    state={stuckCount > 0 ? 'Error' : waitingCount > 0 && aliveWorkers === 0 ? 'Critical' : 'Neutral'}
                                    description="ตาราง jobs"
                                    onClick={() => scrollTo(jobsRef)}
                                />
                            </Card>
                            <Card className={styles.kpiCard}>
                                <AnalyticalCardHeader
                                    titleText="งานที่ล้มเหลว"
                                    subtitleText="ลองใหม่หรือลบได้"
                                    value={String(failedTotal)}
                                    state={failedTotal > 0 ? 'Error' : 'Good'}
                                    description="ตาราง failed_jobs"
                                    onClick={() => scrollTo(failedRef)}
                                />
                            </Card>
                        </div>
                    </DynamicPageHeader>
                }
            >
                <div className={styles.content}>
                    {aliveWorkers === 0 ? (
                        <FioriMessageStrip severity="error">
                            ไม่มี queue worker ทำงานอยู่ — งานนำเข้า/ส่งออก/sync ทั้งหมดจะค้างที่ "รอดำเนินการ" จนกว่าจะรัน{' '}
                            <code>php artisan queue:work</code> บนเซิร์ฟเวอร์
                        </FioriMessageStrip>
                    ) : stuckCount > 0 ? (
                        <FioriMessageStrip severity="warning">
                            มี {stuckCount} งานค้าง — worker ที่หยิบไปน่าจะหยุดกลางทาง (จะถูกลองใหม่อัตโนมัติ หรือลบทิ้งได้)
                        </FioriMessageStrip>
                    ) : null}

                    <SectionCard
                        sectionRef={workersRef}
                        title="Worker"
                        subtitle="queue:work ที่รายงานตัวใน 6 ชั่วโมงที่ผ่านมา"
                        icon="it-host"
                        count={`${aliveWorkers} / ${workers.length}`}
                        empty={{ show: workers.length === 0, name: 'NoData', title: 'ยังไม่มี worker', subtitle: 'ยังไม่มี queue:work รายงานตัวใน 6 ชั่วโมงที่ผ่านมา' }}
                    >
                        <FioriResponsiveTable variant="plain" columns={workerColumns} rows={workers} getRowKey={(w) => w.worker_id} />
                    </SectionCard>

                    <SectionCard
                        sectionRef={jobsRef}
                        title="งานในคิว"
                        subtitle={jobsTotal > jobs.length ? `แสดง ${jobs.length} จาก ${jobsTotal} งาน` : 'งานที่รอ worker หยิบไปทำ'}
                        icon="list"
                        count={String(jobsTotal)}
                        empty={{ show: jobs.length === 0, name: 'SuccessScreen', title: 'คิวว่าง', subtitle: 'ไม่มีงานค้างในคิว' }}
                    >
                        <FioriResponsiveTable variant="plain" columns={jobColumns} rows={jobs} getRowKey={(j) => j.id} />
                    </SectionCard>

                    <SectionCard
                        sectionRef={failedRef}
                        title="งานที่ล้มเหลว"
                        subtitle={failedTotal > failed.length ? `ล่าสุด ${failed.length} จาก ${failedTotal} งาน` : 'งานที่ลองครบแล้วยังไม่สำเร็จ'}
                        icon="error"
                        count={String(failedTotal)}
                        empty={{ show: failed.length === 0, name: 'SuccessScreen', title: 'ไม่มีงานที่ล้มเหลว', subtitle: 'ทุกงานทำสำเร็จ' }}
                    >
                        <FioriResponsiveTable variant="plain" columns={failedColumns} rows={failed} getRowKey={(f) => f.uuid} />
                    </SectionCard>
                </div>
            </DynamicPage>
        </AppLayout>
    );
}
